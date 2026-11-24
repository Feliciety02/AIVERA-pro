/**
 * Works out, on the server, whether each integration can actually be used right now: the tool
 * starts (Nmap, ZAP and its Java), the built-in checks are present, and the AI provider is set.
 * The result replaces the fixed status stored with the integration, so the Integrations page
 * shows what is really true on this machine.
 */
import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Integration, IntegrationStatus } from "@/types";
import { aiConfigured, aiProviderStatus } from "./ai/gemini.ts";
import { approvedScanHosts, egressIsolated } from "./egress.ts";

export interface ToolCheck {
  status: IntegrationStatus;
  /** One plain sentence: what was found, or what to do. */
  note: string;
  /** Version or runtime that answered, when there is one. */
  detail?: string;
}

/** Runs `cmd args` and resolves with its first output line, or null when it can't start. */
function probe(cmd: string, args: string[], timeout = 8000): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout, stderr) => {
        const out = `${stdout ?? ""}\n${stderr ?? ""}`.trim();
        if (err && !out) return resolve(null);
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") return resolve(null);
        resolve(out.split(/\r?\n/).find((l) => l.trim())?.trim() ?? "");
      });
    } catch {
      resolve(null);
    }
  });
}

async function checkNmap(): Promise<ToolCheck> {
  const path = process.env.AIVERA_NMAP_PATH;
  if (path && !existsSync(path)) return { status: "error", note: `AIVERA_NMAP_PATH points to ${path}, which doesn't exist.` };
  const line = await probe(path || "nmap", ["--version"]);
  if (line === null) return { status: "not_connected", note: "Nmap isn't installed or isn't on PATH. Install it, or set AIVERA_NMAP_PATH in server/.env." };
  const version = /Nmap version ([\d.]+)/i.exec(line)?.[1];
  return { status: "connected", note: path ? "Found at the path in AIVERA_NMAP_PATH." : "Found on the server's PATH.", detail: version ? `Nmap ${version}` : line };
}

async function checkZap(): Promise<ToolCheck> {
  const dir = process.env.AIVERA_ZAP_PATH;
  if (dir) {
    if (!existsSync(dir)) return { status: "error", note: `AIVERA_ZAP_PATH points to ${dir}, which doesn't exist.` };
    const jar = readdirSync(dir).find((f) => /^zap-[\d.]+\.jar$/i.test(f));
    if (!jar) return { status: "error", note: `No zap-<version>.jar in ${dir}. Point AIVERA_ZAP_PATH at the ZAP install folder.` };
    const bundled = join(dir, "jre", "bin", process.platform === "win32" ? "java.exe" : "java");
    const java = process.env.AIVERA_JAVA_PATH || (existsSync(bundled) ? bundled : "java");
    const javaLine = await probe(java, ["-version"]);
    if (javaLine === null) return { status: "error", note: "ZAP is installed but Java won't start. Install Java 17+ or set AIVERA_JAVA_PATH." };
    const javaVersion = /version "([^"]+)"/.exec(javaLine)?.[1];
    return { status: "connected", note: "Runs from the local ZAP install (no Docker needed).", detail: `ZAP ${jar.replace(/^zap-|\.jar$/gi, "")}${javaVersion ? ` · Java ${javaVersion}` : ""}` };
  }
  const docker = await probe("docker", ["image", "inspect", "--format", "{{.Id}}", "ghcr.io/zaproxy/zaproxy:stable"], 10000);
  if (docker === null) return { status: "not_connected", note: "Neither a local ZAP (AIVERA_ZAP_PATH) nor Docker was found on the server." };
  if (!docker.startsWith("sha256:")) return { status: "error", note: "Docker is installed but the ZAP image isn't pulled. Run: docker pull ghcr.io/zaproxy/zaproxy:stable" };
  return { status: "connected", note: "Runs in the ZAP Docker container.", detail: "ghcr.io/zaproxy/zaproxy:stable" };
}

const builtIn = (what: string): ToolCheck => ({ status: "connected", note: `Built into the AIVERA server. ${what}`, detail: `Node ${process.version}` });

function checkAi(): ToolCheck {
  if (!aiConfigured()) return { status: "demo_adapter", note: "Using the built-in demo adapter. Set GEMINI_API_KEY in server/.env for real AI analysis." };
  const providers = aiProviderStatus();
  return {
    status: "connected",
    note: providers.some((p) => p.resting) ? "Connected. Some providers are busy and will be retried automatically." : "Connected. Providers are tried in order until one answers.",
    detail: providers.map((p) => (p.resting ? `${p.name} (busy ${p.secondsLeft}s)` : p.name)).join(" → "),
  };
}

let cache: { at: number; value: Record<Integration["id"], ToolCheck> } | null = null;

/** Checks every integration. Results are kept for a minute unless `fresh` is set. */
export async function checkIntegrations(fresh = false): Promise<Record<Integration["id"], ToolCheck>> {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return { ...cache.value, ai_service: checkAi() };
  const [nmap, owasp_zap] = await Promise.all([checkNmap(), checkZap()]);
  const value = {
    nmap,
    owasp_zap,
    dns_utils: builtIn("Uses the server's own DNS resolver."),
    http_inspector: builtIn("Makes one request to the approved URL plus a TLS handshake."),
    ai_service: checkAi(),
  };
  cache = { at: Date.now(), value };
  return value;
}

/** Whether live scans may run at all, and what limits apply. Shown above the cards. */
export function scanGate() {
  const enabled = process.env.AIVERA_LIVE_SCANS_ENABLED === "true" || process.env.AEGIS_LIVE_SCANS_ENABLED === "true";
  return { liveScansEnabled: enabled, approvedHosts: [...approvedScanHosts()], egressIsolated: egressIsolated() };
}

/** Applies the live checks to the stored integration records. */
export async function withLiveStatus(list: Integration[], fresh = false): Promise<Integration[]> {
  const checks = await checkIntegrations(fresh);
  return list.map((i) => {
    const c = checks[i.id];
    return c ? { ...i, status: c.status, statusNote: c.note, statusDetail: c.detail, checkedAt: new Date(cache?.at ?? Date.now()).toISOString() } : i;
  });
}
