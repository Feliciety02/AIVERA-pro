/**
 * Which scope permission each live tool needs, and how a URL's host is matched against
 * the in-scope host list. Shared by the server (enforcement) and the UI (what to offer),
 * so the two can never disagree.
 */
export type LiveTool = "nmap" | "owasp_zap" | "http_inspector";

/** Allowed activity (from ALLOWED_ACTIVITY_OPTIONS) that must be ticked in the scope for each tool. */
export const TOOL_ACTIVITY: Record<LiveTool, string> = {
  nmap: "Port and service discovery",
  owasp_zap: "Automated web scanning (rate-limited)",
  http_inspector: "Security header review",
};

/** Needed (with ZAP) for the active profile, which sends attack payloads. Loopback hosts only. */
export const ACTIVE_SCAN_ACTIVITY = "Active scanning (local lab copy only)";
/** Needed for scans that send a stored test-account session. */
export const AUTH_SCAN_ACTIVITY = "Authenticated testing with provided test accounts";

export const hasActivity = (activity: string, allowedActivities: string[]) => allowedActivities.some((a) => norm(a) === norm(activity));

/** Active payloads only ever go to a copy running on this machine, never to a hosted site. */
export function isLoopbackUrl(url: string): boolean {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "::1" || /^127(?:\.\d{1,3}){3}$/.test(host);
}

const norm = (s: string) => s.trim().toLowerCase();

/** A machine you control: this computer, a private network address, or a .local/.localhost/.test name. */
export function isPrivateHost(url: string): boolean {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isLoopbackUrl(url)) return true;
  if (/\.(local|localhost|test|internal|lan)$/.test(host)) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * The scope activities a standard, gentle scan needs, worked out from the address so nobody has
 * to tick them by hand. Header checks and rate-limited web scanning are always included. Port
 * discovery is only included for machines you control: on shared hosting (Render, Vercel, a
 * cloud provider) the ports belong to the host's own servers, so it is left out with a reason.
 */
export function standardScanActivities(url: string): { include: string[]; leftOut: { activity: string; reason: string }[] } {
  const include = [TOOL_ACTIVITY.http_inspector, TOOL_ACTIVITY.owasp_zap];
  const leftOut: { activity: string; reason: string }[] = [];
  let ownMachine = false;
  try {
    ownMachine = isPrivateHost(url);
  } catch {
    /* not a valid URL yet */
  }
  if (ownMachine) include.push(TOOL_ACTIVITY.nmap);
  else {
    let host = "the hosting provider";
    try {
      host = new URL(url).hostname;
    } catch {
      /* keep the generic name */
    }
    leftOut.push({ activity: TOOL_ACTIVITY.nmap, reason: `${host} runs on someone else's servers, so port scanning is left out. Add it in the scope only if the host's terms allow it.` });
  }
  return { include, leftOut };
}

/** Activities from the standard set that the scope doesn't allow yet. */
export function missingScanActivities(url: string, allowedActivities: string[]): string[] {
  return standardScanActivities(url).include.filter((a) => !hasActivity(a, allowedActivities));
}

export function toolPermitted(tool: LiveTool, allowedActivities: string[]): boolean {
  return hasActivity(TOOL_ACTIVITY[tool], allowedActivities);
}

/**
 * True when the URL's host is listed in scope. Entries may be "host", "host:port" or
 * "*.domain". A "host:port" entry only matches that port; a bare "host" matches any port.
 */
export function urlHostInScope(url: string, inScopeHosts: string[]): boolean {
  const u = new URL(url);
  const host = u.hostname.toLowerCase();
  const port = u.port || (u.protocol === "https:" ? "443" : "80");
  return inScopeHosts.some((raw) => {
    const entry = norm(raw);
    if (entry.startsWith("*.")) return host.endsWith(entry.slice(1));
    const match = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(entry);
    if (!match) return false;
    const [, h, p] = match;
    return h === host && (!p || p === port);
  });
}

/** Ports Nmap may probe for this target. A scoped host:port never authorizes other ports. */
export function nmapPortsInScope(url: string, inScopeHosts: string[]): number[] {
  const u = new URL(url);
  const targetPort = Number(u.port || (u.protocol === "https:" ? "443" : "80"));
  const candidatePorts = [...new Set([80, 443, targetPort])];
  return candidatePorts.filter((port) => {
    const candidate = new URL(u.href);
    candidate.port = String(port);
    // URL normalizes default ports to an empty string; urlHostInScope restores them.
    return urlHostInScope(candidate.href, inScopeHosts);
  });
}
