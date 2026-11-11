/** Bounded tool adapters for an explicitly authorized web target. */
import { spawn } from "node:child_process";
import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ScanConfig, Target } from "@/types";
import type { ParseResult } from "@/features/imports/parsers";
import { parseZapJson, MAX_IMPORT_BYTES } from "@/features/imports/parsers";
import { parseNmapXmlServer } from "./nmap.ts";
import { nmapPortsInScope } from "@/features/scanPermissions";

export type AutomatedTool = "nmap" | "owasp_zap";
export interface ToolOutput { tool: AutomatedTool; raw: string; parsed: ParseResult; }

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const json = (s: string) => JSON.stringify(s);

/** A ZAP context limits crawling to the approved origin and paths. */
export function zapPlan(target: Target, minutes: number, concurrency = 1, reportDir = "/zap/wrk"): string {
  const u = new URL(target.url);
  const origin = u.origin;
  const pathPattern = (p: string) => {
    if (p === "/" || p === "/*") return `^${escapeRegex(origin)}/.*$`;
    if (p.endsWith("/*")) return `^${escapeRegex(origin)}${escapeRegex(p.slice(0, -2))}(?:/.*)?$`;
    return `^${escapeRegex(origin)}${escapeRegex(p.replace(/\*$/, ""))}${p.endsWith("*") ? ".*" : "(?:/.*)?"}$`;
  };
  const allowed = target.scope.allowedPaths.length ? target.scope.allowedPaths : ["/"];
  const include = allowed.map((p) => `      - ${json(pathPattern(p))}`).join("\n");
  const exclude = target.scope.excludedPaths.map((p) => `      - ${json(pathPattern(p))}`).join("\n");
  return `env:\n  contexts:\n    - name: authorized-target\n      urls:\n        - ${json(target.url)}\n      includePaths:\n${include}\n      excludePaths:${exclude ? `\n${exclude}` : " []"}\n  parameters:\n    failOnError: true\n    failOnWarning: false\n    maxDuration: ${Math.max(60, minutes * 60)}\njobs:\n  - type: spider\n    parameters:\n      context: authorized-target\n      maxDuration: 1\n      maxDepth: 5\n      maxChildren: 20\n      threadCount: ${Math.min(2, Math.max(1, concurrency))}\n  - type: passiveScan-wait\n  - type: report\n    parameters:\n      template: traditional-json\n      reportDir: ${json(reportDir)}\n      reportFile: report.json\n      displayReport: false\n`;
}

function run(command: string, args: string[], timeoutMs: number, limit = MAX_IMPORT_BYTES, okCodes: number[] = [0], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], cwd });
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(stdout);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error(`${command} exceeded its time limit.`));
    }, timeoutMs);
    child.stdout.on("data", (b: Buffer) => {
      stdout += b.toString("utf8");
      if (stdout.length > limit) { child.kill(); finish(new Error(`${command} output exceeded ${limit} bytes.`)); }
    });
    child.stderr.on("data", (b: Buffer) => { stderr = (stderr + b.toString("utf8")).slice(-3000); });
    child.on("error", (e) => finish(new Error(`${command} could not start: ${e.message}`)));
    child.on("close", (code) => finish(okCodes.includes(code ?? -1) || (command === "docker" && code === 2)
      ? undefined : new Error(`${command} exited ${code}: ${stderr.slice(-500)}`)));
  });
}

export async function runNmap(target: Target, config: ScanConfig): Promise<ToolOutput> {
  const u = new URL(target.url);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  // Fixed, bounded TCP connect and service discovery. No shell or user supplied flags.
  const ports = nmapPortsInScope(target.url, target.scope.inScopeHosts);
  if (!ports.length) throw new Error("No approved ports for Nmap on this target.");
  // AIVERA_NMAP_PATH lets Windows installs work without Nmap on PATH.
  const raw = await run(process.env.AIVERA_NMAP_PATH || "nmap", ["-sT", "-sV", "--version-light", "-Pn", "--max-retries", "1", "--host-timeout", `${config.timeLimitMinutes}m`, "-p", ports.join(","), "-oX", "-", "--", host], config.timeLimitMinutes * 60_000 + 10_000);
  return { tool: "nmap", raw, parsed: parseNmapXmlServer(raw) };
}

/**
 * Runs a locally installed ZAP without Docker: `java -jar zap-<version>.jar -cmd -autorun plan.yaml`
 * with a throwaway ZAP home folder. AIVERA_ZAP_PATH is the ZAP install folder; its bundled JRE
 * is used if present, otherwise AIVERA_JAVA_PATH or `java` on PATH.
 */
async function runZapLocal(zapDir: string, target: Target, config: ScanConfig): Promise<ToolOutput> {
  const jar = (await readdir(zapDir)).find((f) => /^zap-[\d.]+\.jar$/i.test(f));
  if (!jar) throw new Error(`No zap-<version>.jar found in ${zapDir}.`);
  const bundledJava = join(zapDir, "jre", "bin", process.platform === "win32" ? "java.exe" : "java");
  const java = process.env.AIVERA_JAVA_PATH || (existsSync(bundledJava) ? bundledJava : "java");
  const dir = await mkdtemp(join(tmpdir(), "aivera-zap-"));
  const home = await mkdtemp(join(tmpdir(), "aivera-zap-home-"));
  try {
    const plan = join(dir, "zap.yaml");
    await writeFile(plan, zapPlan(target, config.timeLimitMinutes, config.maxConcurrency, dir.replace(/\\/g, "/")), "utf8");
    // Exit code 2 means "finished with warnings", which is normal for a passive scan.
    await run(java, ["-Xmx1g", "-jar", join(zapDir, jar), "-cmd", "-dir", home, "-autorun", plan], config.timeLimitMinutes * 60_000 + 120_000, 400_000, [0, 2], zapDir);
    const raw = await readFile(join(dir, "report.json"), "utf8");
    if (raw.length > MAX_IMPORT_BYTES) throw new Error("ZAP report is too large to import.");
    return { tool: "owasp_zap", raw, parsed: parseZapJson(raw) };
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(home, { recursive: true, force: true });
  }
}

export async function runZap(target: Target, config: ScanConfig): Promise<ToolOutput> {
  if (process.env.AIVERA_ZAP_PATH) return runZapLocal(process.env.AIVERA_ZAP_PATH, target, config);
  const dir = await mkdtemp(join(tmpdir(), "aivera-zap-"));
  const containerName = `aivera-zap-${randomUUID()}`;
  try {
    // The unprivileged ZAP image needs write access to the short-lived report directory.
    await chmod(dir, 0o777);
    await writeFile(join(dir, "zap.yaml"), zapPlan(target, config.timeLimitMinutes, config.maxConcurrency), "utf8");
    // A separate ephemeral container runs ZAP. Its API is not exposed to the host.
    await run("docker", ["run", "--rm", "--name", containerName, "--pull=never", "-v", `${dir}:/zap/wrk:rw`, "ghcr.io/zaproxy/zaproxy:stable", "zap.sh", "-cmd", "-autorun", "/zap/wrk/zap.yaml"], config.timeLimitMinutes * 60_000 + 30_000, 200_000);
    const raw = await readFile(join(dir, "report.json"), "utf8");
    if (raw.length > MAX_IMPORT_BYTES) throw new Error("ZAP report is too large to import.");
    return { tool: "owasp_zap", raw, parsed: parseZapJson(raw) };
  } finally {
    await run("docker", ["rm", "-f", containerName], 10_000, 1000).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
}

/** New system families add an adapter here and a matching parser/normalizer. */
export const AUTOMATED_ADAPTERS: Record<AutomatedTool, (target: Target, config: ScanConfig) => Promise<ToolOutput>> = {
  nmap: runNmap,
  owasp_zap: runZap,
};
