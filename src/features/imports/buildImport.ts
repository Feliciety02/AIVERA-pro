/**
 * Converts parsed tool output into AEGIS records for ONE authorized target,
 * enforcing the target's approved scope. The same function powers the import
 * preview and the actual import, so what the user previews is what is saved.
 *
 * All created findings start as "pending" — importing never verifies anything.
 */
import type { Endpoint, Evidence, Host, Port, Scan, ScanResult, ScanTool, Target, VulnerabilityFinding } from "@/types";
import { CATEGORY_BY_ID } from "@/lib/constants";
import { hostInScope, RISKY_SERVICES, urlScopeVerdict, type ParseResult } from "./parsers";

export interface ImportBundle {
  scan: Scan;
  result: ScanResult;
  hosts: Host[];
  ports: Port[];
  endpoints: Endpoint[];
  findings: VulnerabilityFinding[];
  evidence: Evidence[];
  skipped: string[];
}

export interface ImportOptions {
  scanId: string;
  scanCode: string;
  findingStartIndex: number;
  createdBy: string;
  assessorId: string;
  now: string;
  raw: string;
  fileName: string;
}

const RAW_LIMIT = 20_000;

export function buildImport(parsed: ParseResult, target: Target, o: ImportOptions): ImportBundle {
  const tool: ScanTool = parsed.format === "nmap_xml" ? "nmap" : "owasp_zap";
  const skipped: string[] = [];
  const hosts: Host[] = [];
  const ports: Port[] = [];
  const endpoints: Endpoint[] = [];
  const findings: VulnerabilityFinding[] = [];
  const evidence: Evidence[] = [];
  const allowedCats = new Set(target.scope.allowedCategories);
  let n = 0;
  const nextFindingId = () => `fnd-${o.scanId}-${++n}`;
  const code = () => `FND-${String(o.findingStartIndex + n - 1).padStart(4, "0")}`;

  /* ------------------------------ Nmap hosts ------------------------------ */
  parsed.hosts.forEach((h, hi) => {
    if (!hostInScope(h.hostname, target) && !hostInScope(h.address, target)) {
      skipped.push(`Host ${h.hostname} (${h.address}) — not an in-scope host`);
      return;
    }
    const hostId = `hst-${o.scanId}-${hi}`;
    hosts.push({ id: hostId, targetId: target.id, scanId: o.scanId, hostname: h.hostname, ipAddress: h.address, state: h.state, osGuess: h.osGuess, source: "nmap", observedAt: o.now, dataOrigin: "imported" });
    h.ports.forEach((p, pi) => {
      ports.push({ id: `prt-${o.scanId}-${hi}-${pi}`, hostId, port: p.port, protocol: p.protocol, state: p.state, service: p.service, version: p.version, source: "nmap", observedAt: o.now, dataOrigin: "imported" });
      const risky = RISKY_SERVICES[p.port];
      if (!risky || p.state !== "open") return;
      if (!allowedCats.has("config_https")) {
        skipped.push(`Exposed ${risky.label} on ${h.hostname}:${p.port} — category "${CATEGORY_BY_ID.config_https.short}" not permitted by scope (port still recorded)`);
        return;
      }
      const id = nextFindingId();
      findings.push({
        id,
        code: code(),
        title: `${risky.label} service exposed on port ${p.port}`,
        description: `The imported Nmap report lists ${p.service} (${p.version}) open on ${h.hostname} (${h.address}) port ${p.port}/${p.protocol}. Administrative and data services are usually not meant to be reachable from the assessment network.`,
        projectId: target.projectId,
        targetId: target.id,
        scanId: o.scanId,
        category: "config_https",
        severity: risky.severity,
        affectedAsset: `${h.hostname} tcp/${p.port}`,
        sourceTool: "nmap",
        verificationStatus: "pending",
        assignedAssessorId: o.assessorId,
        discoveredAt: o.now,
        updatedAt: o.now,
        impact: `Direct exposure of ${risky.label} increases the attack surface for credential attacks and unpatched service vulnerabilities.`,
        remediation: `Restrict ${risky.label} to the networks that need it (firewall / security groups) and bind it to a private interface.`,
        cwe: "CWE-668",
        owasp: "A05:2021 Security Misconfiguration",
        templateKey: `import:nmap:${p.port}`,
        dataOrigin: "imported",
      });
      evidence.push({ id: `ev-${id}-1`, findingId: id, type: "tool_output", title: `Nmap port entry (imported from ${o.fileName})`, content: `HOST     ${h.hostname} (${h.address})\nPORT     ${p.port}/${p.protocol}\nSTATE    ${p.state}\nSERVICE  ${p.service}\nVERSION  ${p.version}`, source: "nmap", capturedAt: o.now, reviewed: false, dataOrigin: "imported" });
    });
  });

  /* ------------------------------- ZAP alerts ----------------------------- */
  parsed.alerts.forEach((a) => {
    const inScope = a.instances.filter((i) => {
      const v = urlScopeVerdict(i.uri, target);
      if (!v.ok) skipped.push(`${a.name} @ ${i.uri} — ${v.reason}`);
      return v.ok;
    });
    if (!inScope.length) return;
    if (!allowedCats.has(a.category)) {
      skipped.push(`${a.name} — category "${CATEGORY_BY_ID[a.category].short}" not permitted by scope`);
      return;
    }
    inScope.forEach((i, ii) => {
      const u = new URL(i.uri);
      if (!endpoints.some((e) => e.path === u.pathname && e.method === i.method))
        endpoints.push({ id: `ept-${o.scanId}-${a.pluginId}-${ii}`, targetId: target.id, method: (["GET", "POST", "PUT", "PATCH", "DELETE"].includes(i.method) ? i.method : "GET") as Endpoint["method"], path: u.pathname + (i.param ? `?${i.param}=` : ""), statusCode: 0, contentType: "unknown", authRequired: false, source: "owasp_zap", observedAt: o.now, dataOrigin: "imported" });
    });
    const id = nextFindingId();
    const first = inScope[0]!;
    findings.push({
      id,
      code: code(),
      title: a.name,
      description: `${a.description || "No description in report."}\n\nReported by OWASP ZAP (plugin ${a.pluginId}) with ${a.confidence} confidence across ${inScope.length} in-scope instance(s).`,
      projectId: target.projectId,
      targetId: target.id,
      scanId: o.scanId,
      category: a.category,
      severity: a.severity,
      affectedAsset: first.uri,
      parameter: first.param || undefined,
      sourceTool: "owasp_zap",
      verificationStatus: "pending",
      assignedAssessorId: o.assessorId,
      discoveredAt: o.now,
      updatedAt: o.now,
      impact: "Not stated by the tool. Assess impact during manual verification.",
      remediation: a.solution || "No solution provided in the report.",
      cwe: a.cwe ? `CWE-${a.cwe}` : undefined,
      owasp: CATEGORY_BY_ID[a.category].owasp,
      templateKey: `import:zap:${a.pluginId}`,
      dataOrigin: "imported",
    });
    inScope.slice(0, 5).forEach((i, k) =>
      evidence.push({ id: `ev-${id}-${k + 1}`, findingId: id, type: "tool_output", title: `ZAP instance ${k + 1} (imported from ${o.fileName})`, content: `${i.method} ${i.uri}\nParameter: ${i.param || "—"}\nEvidence: ${i.evidence || "—"}\nPlugin: ${a.pluginId} · Confidence: ${a.confidence}${a.reference ? `\nReference: ${a.reference}` : ""}`, source: "owasp_zap", capturedAt: o.now, reviewed: false, dataOrigin: "imported" }),
    );
  });

  const itemsFound = hosts.length + ports.length + findings.length;
  const scan: Scan = {
    id: o.scanId,
    code: o.scanCode,
    name: `Imported ${tool === "nmap" ? "Nmap" : "OWASP ZAP"} report — ${o.fileName}`,
    projectId: target.projectId,
    targetId: target.id,
    status: "completed",
    progress: 100,
    stage: "Imported",
    config: { tools: [tool], categories: [...new Set(findings.map((f) => f.category))], profile: "passive", timeLimitMinutes: 0, requestsPerSecond: 0, maxConcurrency: 0, outputFormat: tool === "nmap" ? "xml" : "json", respectExclusions: true, scopeConfirmed: true },
    createdBy: o.createdBy,
    createdAt: o.now,
    startedAt: o.now,
    completedAt: o.now,
    dataOrigin: "imported",
  };
  const result: ScanResult = {
    id: `sr-${o.scanId}`,
    scanId: o.scanId,
    tool,
    summary: `Imported ${o.fileName}: ${hosts.length} host(s), ${ports.length} port(s), ${findings.length} finding(s); ${skipped.length} item(s) skipped by scope`,
    itemsFound,
    rawOutput: o.raw.length > RAW_LIMIT ? `${o.raw.slice(0, RAW_LIMIT)}\n… [truncated at ${RAW_LIMIT} characters]` : o.raw,
    recordedAt: o.now,
    dataOrigin: "imported",
  };
  return { scan, result, hosts, ports, endpoints, findings, evidence, skipped };
}
