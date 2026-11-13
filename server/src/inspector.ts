/**
 * AIVERA's own HTTP and TLS inspector. It makes one plain GET to the approved URL (redirects are
 * not followed) and, for HTTPS, a few TLS handshakes to the same host and port. No payloads, no
 * crawling, so it is safe for hosted sites. Results use the same alert shape as ZAP, so they go
 * through the same scope checks, de-duplication and human review.
 */
import { connect, type PeerCertificate, type SecureVersion } from "node:tls";
import type { AssessmentCategoryId, ScanConfig, Severity, Target } from "@/types";
import type { ParseResult, ParsedAlert } from "@/features/imports/parsers";
import { isLoopbackUrl } from "@/features/scanPermissions";

export interface InspectorAuth { headerName: string; value: string }

const TIMEOUT_MS = 15_000;
// Free hosts (Render, for example) sleep when idle and can take most of a minute to wake.
const HTTP_TIMEOUT_MS = 60_000;
const DAY = 86_400_000;

interface Observation { request: string; status?: number; headers: Record<string, string>; setCookies: string[]; tls?: TlsInfo; legacyTls: string[]; errors: string[] }
interface TlsInfo { protocol: string | null; cipher: string; authorized: boolean; authorizationError?: string; subject?: string; issuer?: string; validFrom?: string; validTo?: string; daysLeft?: number; altNames?: string }

function handshake(host: string, port: number, opts: { min?: SecureVersion; max?: SecureVersion; ciphers?: string } = {}): Promise<{ protocol: string | null; cipher: string; authorized: boolean; authorizationError?: string; cert: PeerCertificate }> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port, servername: /^[\d.]+$|:/.test(host) ? undefined : host, rejectUnauthorized: false, minVersion: opts.min, maxVersion: opts.max, ciphers: opts.ciphers, timeout: TIMEOUT_MS }, () => {
      const out = { protocol: socket.getProtocol(), cipher: socket.getCipher()?.name ?? "unknown", authorized: socket.authorized, authorizationError: socket.authorizationError ? String(socket.authorizationError) : undefined, cert: socket.getPeerCertificate() };
      socket.end();
      resolve(out);
    });
    socket.on("timeout", () => { socket.destroy(); reject(new Error("TLS handshake timed out")); });
    socket.on("error", reject);
  });
}

async function observe(target: Target, auth?: InspectorAuth): Promise<Observation> {
  const u = new URL(target.url);
  const obs: Observation = { request: `GET ${u.href}`, headers: {}, setCookies: [], legacyTls: [], errors: [] };
  try {
    const headers: Record<string, string> = { "User-Agent": "AIVERA-Inspector/1.0 (authorized assessment)" };
    if (auth) headers[auth.headerName] = auth.value;
    const res = await fetch(u.href, { method: "GET", redirect: "manual", headers, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    obs.status = res.status;
    res.headers.forEach((v, k) => { if (k !== "set-cookie") obs.headers[k] = v; });
    obs.setCookies = res.headers.getSetCookie();
    await res.body?.cancel();
  } catch (e) {
    obs.errors.push(`HTTP request failed: ${(e as Error).message}`);
  }
  if (u.protocol === "https:") {
    const host = u.hostname.replace(/^\[|\]$/g, "");
    const port = Number(u.port || 443);
    try {
      const h = await handshake(host, port);
      const validTo = h.cert.valid_to ? new Date(h.cert.valid_to) : undefined;
      obs.tls = {
        protocol: h.protocol, cipher: h.cipher, authorized: h.authorized, authorizationError: h.authorizationError,
        subject: [h.cert.subject?.CN].flat()[0], issuer: [h.cert.issuer?.O ?? h.cert.issuer?.CN].flat()[0], validFrom: h.cert.valid_from, validTo: h.cert.valid_to,
        daysLeft: validTo ? Math.floor((validTo.getTime() - Date.now()) / DAY) : undefined, altNames: h.cert.subjectaltname,
      };
    } catch (e) {
      obs.errors.push(`TLS handshake failed: ${(e as Error).message}`);
    }
    // Does the server still accept retired protocol versions? SECLEVEL=0 lets this client offer them.
    for (const v of ["TLSv1", "TLSv1.1"] as SecureVersion[]) {
      try {
        await handshake(host, port, { min: v, max: v, ciphers: "DEFAULT@SECLEVEL=0" });
        obs.legacyTls.push(v);
      } catch { /* refused, which is what we want */ }
    }
  }
  return obs;
}

/** Turns observations into alerts. Every alert names the exact header or certificate field it is based on. */
export function inspectorAlerts(target: Target, obs: Observation): ParsedAlert[] {
  const url = new URL(target.url);
  const https = url.protocol === "https:";
  const local = isLoopbackUrl(target.url);
  const alerts: ParsedAlert[] = [];
  const add = (pluginId: string, name: string, severity: Severity, category: AssessmentCategoryId, description: string, solution: string, param: string, evidence: string, reference = "", cwe?: string) =>
    alerts.push({ pluginId, name, severity, confidence: "High", description, solution, reference, cwe, category, instances: [{ uri: url.href, method: "GET", param, evidence }] });
  const h = obs.headers;
  if (obs.status === undefined) return alerts;

  if (!https && !local)
    add("insp-no-https", "Site is not served over HTTPS", "high", "config_https", "The approved URL uses plain HTTP, so traffic, including session cookies, can be read or changed in transit.", "Serve the site only over HTTPS and redirect HTTP to HTTPS.", "scheme", url.href, "https://owasp.org/www-project-top-ten/2017/A3_2017-Sensitive_Data_Exposure", "319");
  if (https && !h["strict-transport-security"])
    add("insp-hsts", "Strict-Transport-Security header missing", "low", "config_https", "Without HSTS, a browser may still try plain HTTP first, which allows downgrade attacks on the first visit.", "Send Strict-Transport-Security: max-age=31536000; includeSubDomains.", "Strict-Transport-Security", "(header not present)", "https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html", "319");
  if (!h["content-security-policy"])
    add("insp-csp", "Content-Security-Policy header missing", "medium", "config_https", "No Content Security Policy was sent, so the browser has no extra protection if a script injection bug exists.", "Add a Content-Security-Policy that limits where scripts, styles and frames may load from.", "Content-Security-Policy", "(header not present)", "https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html", "693");
  if (!h["x-frame-options"] && !/frame-ancestors/i.test(h["content-security-policy"] ?? ""))
    add("insp-framing", "Page can be framed by other sites (clickjacking)", "medium", "config_https", "Neither X-Frame-Options nor a CSP frame-ancestors rule was sent, so another site can load this page in a frame.", "Send X-Frame-Options: DENY (or SAMEORIGIN), or CSP frame-ancestors 'self'.", "X-Frame-Options", "(header not present)", "https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html", "1021");
  if ((h["x-content-type-options"] ?? "").toLowerCase() !== "nosniff")
    add("insp-nosniff", "X-Content-Type-Options header missing", "low", "config_https", "Without nosniff, older browsers may guess a response's type and run it as script.", "Send X-Content-Type-Options: nosniff.", "X-Content-Type-Options", h["x-content-type-options"] ?? "(header not present)", "", "693");
  for (const name of ["server", "x-powered-by"]) {
    const v = h[name];
    if (v && /\d/.test(v)) add(`insp-version-${name}`, `${name === "server" ? "Server" : "X-Powered-By"} header reveals software version`, "low", "info_disclosure", "The response names the software and version, which helps an attacker look up known vulnerabilities.", "Remove the version from this header, or remove the header.", name, `${name}: ${v}`, "", "200");
  }
  for (const raw of obs.setCookies) {
    const name = raw.split("=")[0]!.trim();
    const attrs = raw.toLowerCase();
    const missing = [https && !/;\s*secure/.test(attrs) ? "Secure" : "", /session|token|auth|sid/i.test(name) && !/^(xsrf|csrf)/i.test(name) && !/;\s*httponly/.test(attrs) ? "HttpOnly" : "", !/;\s*samesite=/.test(attrs) ? "SameSite" : ""].filter(Boolean);
    // The cookie value is never stored, only its name and attributes.
    if (missing.length) add(`insp-cookie-${name.toLowerCase()}`, `Cookie "${name}" is missing ${missing.join(", ")}`, missing.includes("HttpOnly") || missing.includes("Secure") ? "medium" : "low", "session", "Cookie attributes limit how a cookie can be stolen or sent from other sites.", `Set ${missing.join(", ")} on the "${name}" cookie.`, name, `${name}=[value hidden]${raw.slice(raw.indexOf(";"))}`, "https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html", "614");
  }
  const t = obs.tls;
  if (t) {
    if (!t.authorized) add("insp-cert-untrusted", "TLS certificate is not trusted", "high", "config_https", `Browsers will warn users. Reason: ${t.authorizationError ?? "unknown"}.`, "Install a certificate from a trusted authority that matches the host name.", "certificate", `${t.subject ?? "?"} issued by ${t.issuer ?? "?"}`, "", "295");
    if (t.daysLeft !== undefined && t.daysLeft < 0) add("insp-cert-expired", "TLS certificate has expired", "high", "config_https", `The certificate expired on ${t.validTo}.`, "Renew the certificate now and set up automatic renewal.", "certificate", `valid to ${t.validTo}`, "", "298");
    else if (t.daysLeft !== undefined && t.daysLeft < 14) add("insp-cert-expiring", "TLS certificate expires within 14 days", "medium", "config_https", `The certificate expires on ${t.validTo} (${t.daysLeft} days).`, "Renew the certificate and check that automatic renewal works.", "certificate", `valid to ${t.validTo}`, "", "298");
  }
  for (const v of obs.legacyTls)
    add(`insp-legacy-${v.toLowerCase().replace(/\./g, "")}`, `Server accepts retired protocol ${v.replace("TLSv", "TLS ")}`, "medium", "config_https", `A handshake using ${v} succeeded. TLS 1.0 and 1.1 are deprecated (RFC 8996) and have known weaknesses.`, "Allow only TLS 1.2 and TLS 1.3.", "protocol", `${v} handshake accepted`, "https://datatracker.ietf.org/doc/html/rfc8996", "327");
  return alerts;
}

export async function runInspector(target: Target, _config: ScanConfig, auth?: InspectorAuth): Promise<{ raw: string; parsed: ParseResult }> {
  const obs = await observe(target, auth);
  if (obs.status === undefined) throw new Error(obs.errors.join("; ") || "The website did not answer.");
  const alerts = inspectorAlerts(target, obs);
  // Raw output keeps headers and TLS facts; cookie values are dropped.
  const raw = JSON.stringify({ ...obs, setCookies: obs.setCookies.map((c) => c.replace(/=[^;]*/, "=[value hidden]")) }, null, 2);
  return { raw, parsed: { format: "aivera_inspector", hosts: [], alerts, warnings: obs.errors } };
}
