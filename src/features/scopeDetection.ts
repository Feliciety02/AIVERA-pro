/**
 * Automatic scope detection helpers shared by the browser (address-only) and the
 * AIVERA server (address + DNS + robots.txt + sitemap.xml).
 *
 * Nothing here invents values: every suggestion is copied from the address the
 * user typed or from the site's own public files, and is labelled with its source.
 */
import type { ScopeDetection, ScopeSuggestion, TargetEnvironment } from "@/types";

const ENV_WORDS: [RegExp, TargetEnvironment][] = [
  [/(^|[.-])(staging|stage|stg|uat|preprod)([.-]|$)/i, "staging"],
  [/(^|[.-])(qa|test|testing)([.-]|$)|\.test$/i, "qa"],
  [/(^|[.-])(dev|develop|development|local)([.-]|$)|^localhost$|\.localhost$/i, "development"],
  [/(^|[.-])(lab|sandbox|demo)([.-]|$)/i, "lab"],
];

/** Environment suggested by words in the host name, or undefined if there are none. */
export function guessEnvironment(host: string): TargetEnvironment | undefined {
  return ENV_WORDS.find(([re]) => re.test(host))?.[1];
}

/** Readable name from a host, e.g. "umerch.staging.example" → "Umerch (staging)". */
export function nameFromHost(host: string): string {
  const parts = host.replace(/^www\./, "").split(".");
  const first = parts[0] ?? host;
  const env = guessEnvironment(host);
  const label = first.charAt(0).toUpperCase() + first.slice(1);
  return env && !new RegExp(env, "i").test(first) ? `${label} (${env})` : label;
}

/** Turns a URL path into a scope pattern: "/" → "/*", "/app/" → "/app/*", "/app" → "/app/*". */
export function pathPattern(path: string): string {
  const clean = path.split(/[?#]/)[0] || "/";
  if (clean === "/") return "/*";
  return `${clean.replace(/\/+$/, "")}/*`;
}

/** Scope taken from the address alone — exact host, and the address's path. */
export function detectFromAddress(rawUrl: string): ScopeDetection {
  const u = new URL(rawUrl);
  const host = u.port ? `${u.hostname}:${u.port}` : u.hostname;
  return {
    url: u.href,
    host: u.hostname,
    checkedAt: new Date().toISOString(),
    mode: "address",
    inScopeHosts: [{ value: host, source: "Web address", note: "Only this exact host — other subdomains are not included." }],
    allowedPaths: [{ value: pathPattern(u.pathname), source: "Web address", note: u.pathname === "/" ? "Everything under the site root." : `Everything under ${u.pathname}` }],
    excludedPaths: [],
    environmentHint: guessEnvironment(u.hostname),
  };
}

/**
 * Converts robots.txt Disallow rules into excluded paths. Rules for all crawlers
 * ("User-agent: *") are used; mid-path wildcards and "$" anchors can't be represented
 * by AIVERA scope patterns, so they are returned separately for the user to review.
 */
export function parseRobots(text: string): { excluded: string[]; unsupported: string[]; sitemaps: string[] } {
  const groups: { agents: string[]; disallow: string[] }[] = [];
  const sitemaps: string[] = [];
  let current: { agents: string[]; disallow: string[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!current || !lastWasAgent) groups.push((current = { agents: [], disallow: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "disallow" && current && value) current.disallow.push(value);
  }
  const star = groups.filter((g) => g.agents.includes("*"));
  const rules = [...new Set((star.length ? star : groups).flatMap((g) => g.disallow))];
  const excluded: string[] = [];
  const unsupported: string[] = [];
  for (const r of rules) {
    if (!r.startsWith("/")) continue;
    const body = r.endsWith("$") ? r.slice(0, -1) : r;
    if (body.slice(0, -1).includes("*") || r.endsWith("$") || body.includes("?")) {
      unsupported.push(r);
      continue;
    }
    if (body === "/") {
      unsupported.push(r); // "Disallow: /" would exclude the whole site — leave that decision to the user
      continue;
    }
    excluded.push(body.endsWith("*") ? body : body.endsWith("/") ? `${body}*` : body);
  }
  return { excluded: excluded.slice(0, 50), unsupported: unsupported.slice(0, 20), sitemaps };
}

/** Reads <loc> URLs from a sitemap and returns the top-level folders on the given host. */
export function parseSitemap(xml: string, host: string): { urlCount: number; sections: string[]; nested: boolean } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]!);
  const nested = /<sitemapindex/i.test(xml);
  const sections = new Map<string, number>();
  let urlCount = 0;
  for (const loc of locs) {
    try {
      const u = new URL(loc.replace(/&amp;/g, "&"));
      if (u.hostname !== host) continue;
      urlCount++;
      const seg = u.pathname.split("/").filter(Boolean)[0];
      if (seg && !seg.includes(".")) sections.set(seg, (sections.get(seg) ?? 0) + 1);
    } catch {
      /* skip invalid entries */
    }
  }
  return { urlCount, nested, sections: [...sections.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([s]) => `/${s}/*`) };
}

export function mergeSuggestions(list: ScopeSuggestion[]): ScopeSuggestion[] {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.value) ? false : (seen.add(s.value), true)));
}
