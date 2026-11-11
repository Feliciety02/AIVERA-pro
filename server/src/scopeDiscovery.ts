/**
 * Automatic scope detection (server side).
 *
 * Contacts the target in the lightest way possible, and only after the user has
 * confirmed permission:
 *   1. DNS lookup of the host (is it real, which addresses does it use)
 *   2. GET /robots.txt   — the owner's own list of paths crawlers must avoid
 *   3. GET /sitemap.xml  — the owner's own list of public pages
 * That's at most two small HTTP requests: no crawling, no forms, no scanning.
 * Every suggestion is labelled with the file it came from.
 */
import { lookup } from "node:dns/promises";
import net from "node:net";
import type { ScopeDetection, ScopeSuggestion } from "@/types";
import { detectFromAddress, mergeSuggestions, parseRobots, parseSitemap } from "@/features/scopeDetection";

const TIMEOUT_MS = 5000;
const MAX_BYTES = 512 * 1024;
const USER_AGENT = "AIVERA-scope-helper/1.0 (authorized assessment; reads robots.txt and sitemap.xml only)";

/** Addresses we never contact: cloud metadata/link-local, unspecified and multicast. Private lab ranges are allowed. */
function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 0 || (a === 169 && b === 254) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::" || v.startsWith("fe80:") || v.startsWith("ff") || v.startsWith("::ffff:169.254.");
}

async function fetchText(url: string): Promise<{ status: number; text: string; location?: string }> {
  const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": USER_AGENT, Accept: "text/plain, application/xml, text/xml;q=0.9, */*;q=0.1" } });
  const location = res.headers.get("location") ?? undefined;
  if (!res.body) return { status: res.status, text: "", location };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => undefined);
  return { status: res.status, text: Buffer.concat(chunks).toString("utf8").slice(0, MAX_BYTES), location };
}

/** Follows at most one redirect, and only when it stays on the same host. */
async function getSameHost(url: string, host: string) {
  let r = await fetchText(url);
  if (r.status >= 300 && r.status < 400 && r.location) {
    const next = new URL(r.location, url);
    if (next.hostname !== host) return { status: r.status, text: "", message: `Redirected to another host (${next.hostname}) — not followed.` };
    r = await fetchText(next.href);
  }
  return { status: r.status, text: r.status === 200 ? r.text : "", message: r.status === 200 ? undefined : `HTTP ${r.status}` };
}

const errMessage = (e: unknown) => ((e as Error).name === "TimeoutError" ? `No response within ${TIMEOUT_MS / 1000}s` : ((e as Error).message ?? "Request failed"));

export async function detectScope(rawUrl: string): Promise<ScopeDetection> {
  const base = detectFromAddress(rawUrl);
  const u = new URL(base.url);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const origin = u.origin;
  const result: ScopeDetection = { ...base, mode: "server" };

  // 1. DNS
  if (net.isIP(host)) {
    result.dns = { status: "skipped", addresses: [host], message: "The address is an IP, so no DNS lookup was needed." };
  } else {
    try {
      const addrs = await lookup(host, { all: true, verbatim: true });
      result.dns = { status: "resolved", addresses: [...new Set(addrs.map((a) => a.address))].slice(0, 10) };
    } catch {
      result.dns = { status: "not_found", addresses: [], message: "This host name does not exist in DNS. Check the spelling, or it may only work inside a private network." };
    }
  }
  const addresses = result.dns.addresses;
  if (addresses.some(isBlockedAddress)) {
    result.dns = { ...result.dns, status: "blocked", message: "This host points to a reserved address (e.g. cloud metadata). AIVERA will not contact it." };
  }
  const canFetch = result.dns.status === "resolved" || result.dns.status === "skipped";

  const robotsUrl = `${origin}/robots.txt`;
  let sitemapUrl = `${origin}/sitemap.xml`;
  const excluded: ScopeSuggestion[] = [];
  
  // 2. robots.txt
  if (!canFetch) {
    result.robots = { status: "skipped", url: robotsUrl, message: "Skipped because the host could not be reached safely.", unsupportedRules: [] };
  } else {
    try {
      const r = await getSameHost(robotsUrl, u.hostname);
      if (r.text) {
        const parsed = parseRobots(r.text);
        for (const p of parsed.excluded) excluded.push({ value: p, source: "robots.txt", note: "The site owner asks crawlers to stay out of this path." });
        const sameHostSitemap = parsed.sitemaps.find((s) => {
          try {
            return new URL(s).hostname === u.hostname;
          } catch {
            return false;
          }
        });
        if (sameHostSitemap) sitemapUrl = sameHostSitemap;
        result.robots = { status: "found", url: robotsUrl, unsupportedRules: parsed.unsupported, message: `${parsed.excluded.length} path(s) the owner asks crawlers to avoid.` };
      } else {
        result.robots = { status: "not_found", url: robotsUrl, unsupportedRules: [], message: r.message ?? "No robots.txt file." };
      }
    } catch (e) {
      result.robots = { status: "error", url: robotsUrl, unsupportedRules: [], message: errMessage(e) };
    }
  }

  // 3. sitemap.xml
  if (!canFetch) {
    result.sitemap = { status: "skipped", url: sitemapUrl, urlCount: 0, sections: [], message: "Skipped because the host could not be reached safely." };
  } else {
    try {
      const r = await getSameHost(sitemapUrl, u.hostname);
      if (r.text && /<(urlset|sitemapindex)/i.test(r.text)) {
        const parsed = parseSitemap(r.text, u.hostname);
        result.sitemap = {
          status: "found",
          url: sitemapUrl,
          urlCount: parsed.urlCount,
          sections: parsed.sections,
          message: parsed.nested ? "This is a sitemap index (a list of other sitemaps); only the index itself was read." : `${parsed.urlCount} page(s) listed on this host.`,
        };
      } else {
        result.sitemap = { status: "not_found", url: sitemapUrl, urlCount: 0, sections: [], message: r.message ?? "No sitemap found." };
      }
    } catch (e) {
      result.sitemap = { status: "error", url: sitemapUrl, urlCount: 0, sections: [], message: errMessage(e) };
    }
  }

    result.excludedPaths = mergeSuggestions(excluded);
  result.checkedAt = new Date().toISOString();
  return result;
}
