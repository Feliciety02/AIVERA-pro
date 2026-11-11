/**
 * Offline parsers for security tool output that an assessor produced
 * themselves (inside an authorized engagement) and wants to bring into AIVERA.
 *
 * Everything here is pure string/DOM parsing in the browser. AIVERA does not run
 * the tools and does not contact any host mentioned in the file.
 *
 * Supported formats:
 *  - Nmap XML (`nmap -oX`)
 *  - OWASP ZAP traditional JSON report (`site[].alerts[]`)
 */
import type { AssessmentCategoryId, Severity, Target } from "@/types";
import { pathMatches } from "@/features/simulation/generator";

export type ImportFormat = "nmap_xml" | "zap_json";

export interface ParsedPort {
  port: number;
  protocol: "tcp" | "udp";
  state: "open" | "filtered" | "closed";
  service: string;
  version: string;
}

export interface ParsedHost {
  address: string;
  hostname: string;
  state: "up" | "down" | "unknown";
  osGuess?: string;
  ports: ParsedPort[];
}

export interface ParsedAlertInstance {
  uri: string;
  method: string;
  param: string;
  evidence: string;
}

export interface ParsedAlert {
  pluginId: string;
  name: string;
  severity: Severity;
  confidence: string;
  description: string;
  solution: string;
  reference: string;
  cwe?: string;
  category: AssessmentCategoryId;
  instances: ParsedAlertInstance[];
}

export interface ParseResult {
  format: ImportFormat;
  hosts: ParsedHost[];
  alerts: ParsedAlert[];
  warnings: string[];
}

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const stripHtml = (s: string) =>
  s
    .replace(/<\/p>\s*<p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .trim();

/* ---------------------------------- Nmap --------------------------------- */
export function parseNmapXml(text: string): ParseResult {
  const warnings: string[] = [];
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("The file is not well-formed XML.");
  const root = doc.documentElement;
  if (root.nodeName !== "nmaprun") throw new Error("Not an Nmap XML report (expected <nmaprun> root element).");

  const hosts: ParsedHost[] = [...root.querySelectorAll(":scope > host")].map((h) => {
    const address = h.querySelector("address[addrtype='ipv4'], address[addrtype='ipv6']")?.getAttribute("addr") ?? h.querySelector("address")?.getAttribute("addr") ?? "";
    const hostname = h.querySelector("hostnames > hostname")?.getAttribute("name") ?? address;
    const st = h.querySelector("status")?.getAttribute("state");
    const ports: ParsedPort[] = [...h.querySelectorAll("ports > port")].map((p) => {
      const svc = p.querySelector("service");
      const state = p.querySelector("state")?.getAttribute("state") ?? "unknown";
      return {
        port: Number(p.getAttribute("portid")),
        protocol: p.getAttribute("protocol") === "udp" ? "udp" : "tcp",
        state: state === "open" ? "open" : state.startsWith("filtered") || state === "open|filtered" ? "filtered" : "closed",
        service: svc?.getAttribute("name") ?? "unknown",
        version: [svc?.getAttribute("product"), svc?.getAttribute("version"), svc?.getAttribute("extrainfo")].filter(Boolean).join(" ") || "—",
      };
    });
    return {
      address,
      hostname,
      state: st === "up" ? "up" : st === "down" ? "down" : "unknown",
      osGuess: h.querySelector("os > osmatch")?.getAttribute("name") ?? undefined,
      ports: ports.filter((p) => Number.isFinite(p.port)),
    };
  });
  if (!hosts.length) warnings.push("No <host> entries were found in the report.");
  return { format: "nmap_xml", hosts, alerts: [], warnings };
}

/* ----------------------------------- ZAP --------------------------------- */
const RISK: Record<string, Severity> = { "3": "high", "2": "medium", "1": "low", "0": "info" };

/** Maps a CWE / alert name onto an AIVERA assessment category. */
export function categorize(cwe: string | undefined, name: string): AssessmentCategoryId {
  const c = Number(cwe);
  const n = name.toLowerCase();
  if ([79, 89, 77, 78, 94, 917, 643, 91, 90].includes(c) || /inject|cross site scripting|xss/.test(n)) return "injection";
  if ([614, 1004, 384, 613, 1275].includes(c) || /cookie|session/.test(n)) return "session";
  if ([287, 307, 521, 204, 522].includes(c) || /authenticat|password|login/.test(n)) return "authentication";
  if ([639, 284, 285, 942, 352, 862, 863].includes(c) || /cors|access control|csrf|authoriz/.test(n)) return "access_control";
  if ([548, 530, 527, 538, 552].includes(c) || /directory|backup|\.git|hidden file/.test(n)) return "exposed_files";
  if ([693, 319, 326, 16, 1021, 525, 311].includes(c) || /header|strict-transport|content security|tls|ssl|clickjack/.test(n)) return "config_https";
  return "info_disclosure";
}

interface ZapAlertJson {
  pluginid?: string;
  alert?: string;
  name?: string;
  riskcode?: string | number;
  confidence?: string | number;
  desc?: string;
  solution?: string;
  reference?: string;
  cweid?: string | number;
  instances?: { uri?: string; method?: string; param?: string; evidence?: string }[];
}

export function parseZapJson(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  const sites = (json as { site?: unknown }).site;
  const list = Array.isArray(sites) ? sites : sites ? [sites] : null;
  if (!list) throw new Error("Not a ZAP JSON report (expected a top-level \"site\" array).");
  const warnings: string[] = [];
  const confidence: Record<string, string> = { "0": "False Positive", "1": "Low", "2": "Medium", "3": "High", "4": "Confirmed" };
  const alerts: ParsedAlert[] = list.flatMap((site: { alerts?: ZapAlertJson[] }) =>
    (site.alerts ?? []).map((a) => {
      const name = a.name ?? a.alert ?? "Unnamed alert";
      const cwe = a.cweid !== undefined && String(a.cweid) !== "-1" && String(a.cweid) !== "0" ? String(a.cweid) : undefined;
      return {
        pluginId: String(a.pluginid ?? "?"),
        name,
        severity: RISK[String(a.riskcode)] ?? "info",
        confidence: confidence[String(a.confidence)] ?? String(a.confidence ?? "Unknown"),
        description: stripHtml(a.desc ?? ""),
        solution: stripHtml(a.solution ?? ""),
        reference: stripHtml(a.reference ?? ""),
        cwe,
        category: categorize(cwe, name),
        instances: (a.instances ?? []).map((i) => ({ uri: i.uri ?? "", method: (i.method ?? "GET").toUpperCase(), param: i.param ?? "", evidence: i.evidence ?? "" })),
      };
    }),
  );
  if (!alerts.length) warnings.push("The report contains no alerts.");
  return { format: "zap_json", hosts: [], alerts, warnings };
}

export function parseToolOutput(format: ImportFormat, text: string): ParseResult {
  if (new Blob([text]).size > MAX_IMPORT_BYTES) throw new Error("File is larger than the 2 MB demo import limit.");
  return format === "nmap_xml" ? parseNmapXml(text) : parseZapJson(text);
}

/* ------------------------------ Scope checks ------------------------------ */
export function hostInScope(host: string, target: Target): boolean {
  const h = host.toLowerCase();
  return target.scope.inScopeHosts.some((s) => {
    const entry = s.toLowerCase().split(":")[0]!;
    return entry === h || (entry.startsWith("*.") && h.endsWith(entry.slice(1)));
  });
}

export type ScopeVerdict = { ok: true } | { ok: false; reason: string };

export function urlScopeVerdict(uri: string, target: Target): ScopeVerdict {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return { ok: false, reason: "Unparseable URL" };
  }
  if (!hostInScope(u.hostname, target)) return { ok: false, reason: `Host ${u.hostname} is not in scope` };
  if (target.scope.excludedPaths.some((p) => pathMatches(p, u.pathname))) return { ok: false, reason: `Path ${u.pathname} is excluded` };
  if (!target.scope.allowedPaths.some((p) => p === "/" || pathMatches(p, u.pathname))) return { ok: false, reason: `Path ${u.pathname} is not an allowed path` };
  return { ok: true };
}

/** Services whose exposure is worth an (unverified) finding when seen open. */
export const RISKY_SERVICES: Record<number, { label: string; severity: Severity }> = {
  21: { label: "FTP", severity: "medium" },
  23: { label: "Telnet", severity: "high" },
  445: { label: "SMB", severity: "high" },
  1433: { label: "Microsoft SQL Server", severity: "high" },
  3306: { label: "MySQL", severity: "high" },
  3389: { label: "RDP", severity: "high" },
  5432: { label: "PostgreSQL", severity: "high" },
  5900: { label: "VNC", severity: "high" },
  6379: { label: "Redis", severity: "high" },
  9200: { label: "Elasticsearch", severity: "high" },
  27017: { label: "MongoDB", severity: "high" },
};
