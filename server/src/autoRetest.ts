/** Replays the original, narrow check after a fix is offered for retest. */
import type { ScanConfig } from "@/types";
import { urlScopeVerdict } from "@/features/imports/parsers";
import { urlHostInScope } from "@/features/scanPermissions";
import { newId, prisma } from "./db.ts";
import { log, notify } from "./audit.ts";
import { runToolInWorker } from "./workerClient.ts";
import { assertAutomatedRunAllowed, authorizedTarget } from "./routes/security.ts";
import { open as openSecret } from "./secretBox.ts";
import type { AutomatedTool, RunOptions } from "./automatedAssessment.ts";

const configFor = (tool: AutomatedTool, category: ScanConfig["categories"][number], authenticated: boolean): ScanConfig => ({
  tools: [tool], categories: [category], profile: "passive", timeLimitMinutes: 5,
  requestsPerSecond: 1, maxConcurrency: 1, outputFormat: "json", respectExclusions: true, scopeConfirmed: true,
  authenticated,
});

function samePage(a: string, b: string) {
  try { return new URL(a).href === new URL(b).href; } catch { return false; }
}

async function finish(taskId: string, status: "unavailable" | "failed", note: string) {
  await prisma.remediationTask.updateMany({ where: { id: taskId, status: "awaiting_retest" }, data: {
    autoRetestStatus: status, autoRetestSuggestion: null, autoRetestNote: note.slice(0, 500), autoRetestCheckedAt: new Date(), updatedAt: new Date(),
  } });
}

export async function runAutoRetest(taskId: string) {
  const claimed = await prisma.remediationTask.updateMany({ where: { id: taskId, status: "awaiting_retest", autoRetestStatus: "queued" }, data: { autoRetestStatus: "running" } });
  if (!claimed.count) return;
  const task = await prisma.remediationTask.findUniqueOrThrow({ where: { id: taskId } });
  const finding = await prisma.finding.findUnique({ where: { id: task.findingId } });
  if (!finding || finding.verificationStatus !== "confirmed") return finish(taskId, "unavailable", "Only a confirmed finding can be checked automatically.");
  const tool = finding.sourceTool;
  if (tool !== "http_inspector" && tool !== "nmap" && tool !== "owasp_zap")
    return finish(taskId, "unavailable", "This finding needs a person to retest it.");
  const original = finding.scanId ? await prisma.scan.findUnique({ where: { id: finding.scanId } }) : null;
  if (!original || original.dataOrigin !== "real")
    return finish(taskId, "unavailable", "The original check was not a live automated scan, so it cannot be replayed reliably.");
  const originalConfig = original.config as unknown as ScanConfig;
  if (tool === "owasp_zap" && originalConfig.profile === "standard")
    return finish(taskId, "unavailable", "This finding came from an active scan. A tester must retest it manually.");
  try {
    const target = await authorizedTarget(finding.targetId);
    let checkedUrl = target.url;
    const options: RunOptions = {};
    let checkId = "";
    if (tool === "nmap") {
      const port = Number(/^import:nmap:(\d+)$/.exec(finding.templateKey)?.[1]);
      const host = /^(.+) tcp\/\d+$/.exec(finding.affectedAsset)?.[1];
      if (!port || !host || host.toLowerCase() !== new URL(target.url).hostname.toLowerCase())
        return finish(taskId, "unavailable", "The original port or host cannot be matched to this website.");
      options.retestPort = port;
      checkId = `port ${port}`;
    } else {
      const page = new URL(finding.affectedAsset);
      if (page.origin !== new URL(target.url).origin || !urlHostInScope(page.href, target.scope.inScopeHosts) || !urlScopeVerdict(page.href, target).ok)
        return finish(taskId, "unavailable", "The original page is no longer in the approved scope.");
      checkedUrl = page.href;
      checkId = finding.templateKey.slice(tool === "http_inspector" ? "import:inspector:".length : "import:zap:".length);
      if (!checkId || !finding.templateKey.startsWith(tool === "http_inspector" ? "import:inspector:" : "import:zap:"))
        return finish(taskId, "unavailable", "The original check cannot be identified.");
      if (tool === "owasp_zap") {
        const oldEvidence = await prisma.evidence.findFirst({ where: { findingId: finding.id, source: "owasp_zap" }, orderBy: { capturedAt: "asc" } });
        if (!oldEvidence?.content.startsWith("GET ")) return finish(taskId, "unavailable", "The original page check used a request that cannot be replayed safely.");
        options.singlePage = checkedUrl;
      }
    }
    const credential = originalConfig.authenticated ? await prisma.scanCredential.findUnique({ where: { targetId: target.id } }) : null;
    if (originalConfig.authenticated && !credential) return finish(taskId, "unavailable", "The test-account session used by the original scan is no longer available.");
    if (credential) options.auth = { headerName: credential.headerName, value: openSecret(credential.valueEnc) };
    const pageTarget = { ...target, url: checkedUrl };
    const config = configFor(tool, finding.category as ScanConfig["categories"][number], !!originalConfig.authenticated);
    assertAutomatedRunAllowed(pageTarget, config, !!credential);
    const output = await runToolInWorker(tool, pageTarget, config, options);
    // ZAP reports an empty alert list as a warning, although that is a valid clean retest.
    const observationWarnings = output.parsed.warnings.filter((warning) => !(tool === "owasp_zap" && warning === "The report contains no alerts."));
    if (observationWarnings.length) return finish(taskId, "failed", `The check could not observe the page reliably: ${observationWarnings.join("; ")}`);
    const match = tool === "nmap"
      ? output.parsed.hosts.some((h) => h.ports.some((p) => p.port === options.retestPort && p.state === "open"))
      : output.parsed.alerts.some((a) => a.pluginId === checkId && a.instances.some((i) => samePage(i.uri, checkedUrl)));
    if (tool === "nmap" && (!output.parsed.hosts.length || !output.parsed.hosts.some((h) => h.ports.some((p) => p.port === options.retestPort))))
      return finish(taskId, "failed", "The port scan did not return a usable observation for the original port.");
    const suggestion = match ? "failed" : "passed";
    const observed = tool === "http_inspector" ? JSON.parse(output.raw) as { status?: number; headers?: Record<string, string> } : null;
    const observation = tool === "nmap"
      ? output.parsed.hosts.flatMap((h) => h.ports.filter((p) => p.port === options.retestPort).map((p) => `${h.hostname || h.address}: ${p.port}/${p.protocol} ${p.state} ${p.service}`)).join("; ")
      : output.parsed.alerts.filter((a) => a.pluginId === checkId).flatMap((a) => a.instances.filter((i) => samePage(i.uri, checkedUrl)).map((i) => i.evidence)).join("; ");
    const evidence = await prisma.evidence.create({ data: {
      id: newId("ev"), findingId: finding.id, type: "tool_output", title: `Automatic retest suggests ${suggestion}`,
      content: [
        `Website or page: ${checkedUrl}`, `Original check: ${checkId}`, ...(observed ? [`HTTP status: ${observed.status ?? "unknown"}`] : []),
        `Result: ${match ? "The same check still reported the issue." : "The same check did not report the issue."}`,
        observation ? `New observation: ${observation.slice(0, 3000)}` : observed ? `Response header names: ${Object.keys(observed.headers ?? {}).join(", ").slice(0, 1000)}` : `The ${tool} report contained no matching issue on this page.`,
      ].join("\n"), source: tool, capturedAt: new Date(), reviewed: false, dataOrigin: "real",
    } });
    const saved = await prisma.remediationTask.updateMany({ where: { id: taskId, status: "awaiting_retest", autoRetestStatus: "running" }, data: {
      autoRetestStatus: "completed", autoRetestSuggestion: suggestion, autoRetestEvidenceId: evidence.id,
      autoRetestNote: suggestion === "passed" ? "The original check no longer reports this issue on the same page." : "The original check still reports this issue on the same page.",
      autoRetestCheckedAt: new Date(), updatedAt: new Date(),
    } });
    if (!saved.count) return;
    await log(task.retestAssigneeId ?? task.ownerId, "remediation_updated", "remediation", task.id, task.code, `Automatic retest suggested ${suggestion}; final decision remains with a tester`);
    if (task.retestAssigneeId) await notify({ title: "Automatic retest ready for review", message: `${task.code}: the check suggests ${suggestion}. Review the new evidence and record your decision.`, tone: suggestion === "failed" ? "warning" : "info", link: `/remediation?task=${task.id}` }, "remediationDue", [task.retestAssigneeId]);
  } catch (e) {
    await finish(taskId, "failed", `Automatic check could not finish: ${(e as Error).message}`);
  }
}

/** Requeue checks interrupted by a server restart. The task status is checked again before a run. */
export async function recoverAutoRetests() {
  const tasks = await prisma.remediationTask.findMany({ where: { status: "awaiting_retest", autoRetestStatus: { in: ["queued", "running"] } }, select: { id: true } });
  for (const task of tasks) {
    await prisma.remediationTask.update({ where: { id: task.id }, data: { autoRetestStatus: "queued" } });
    void runAutoRetest(task.id).catch((e) => console.error("[retest] recovery failed", e));
  }
  return tasks.length;
}
