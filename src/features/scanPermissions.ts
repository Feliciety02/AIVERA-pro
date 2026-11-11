/**
 * Which scope permission each live tool needs, and how a URL's host is matched against
 * the in-scope host list. Shared by the server (enforcement) and the UI (what to offer),
 * so the two can never disagree.
 */
export type LiveTool = "nmap" | "owasp_zap";

/** Allowed activity (from ALLOWED_ACTIVITY_OPTIONS) that must be ticked in the scope for each tool. */
export const TOOL_ACTIVITY: Record<LiveTool, string> = {
  nmap: "Port and service discovery",
  owasp_zap: "Automated web scanning (rate-limited)",
};

const norm = (s: string) => s.trim().toLowerCase();

export function toolPermitted(tool: LiveTool, allowedActivities: string[]): boolean {
  return allowedActivities.some((a) => norm(a) === norm(TOOL_ACTIVITY[tool]));
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
    const [h, p] = entry.split(":");
    return h === host && (!p || p === port);
  });
}
