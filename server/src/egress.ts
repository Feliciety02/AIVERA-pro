/**
 * Egress rules for live scans. A scan may only reach a host that the server administrator put on
 * AIVERA_ALLOWED_SCAN_HOSTS. A host NAME on that list must also resolve to public addresses, so a
 * DNS record cannot quietly point an approved name at this machine, the local network or a cloud
 * metadata service. Loopback is only reachable when it is listed by literal address or as
 * "localhost" (the local lab copy).
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const approvedScanHosts = () =>
  new Set(((process.env.AIVERA_ALLOWED_SCAN_HOSTS ?? process.env.AEGIS_ALLOWED_SCAN_HOSTS) ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));

/** True for loopback, private, link-local, CGNAT, multicast and other non-public ranges. */
export function isInternalAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x.startsWith("::ffff:")) return isInternalAddress(x.slice(7));
    return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff");
  }
  return true;
}

const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "::1"]);

/** Throws unless the URL's host may be contacted. Returns the addresses that were checked. */
export async function assertEgressAllowed(url: string, allowlist = approvedScanHosts()): Promise<string[]> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!allowlist.has(host)) throw new Error(`Egress blocked: ${host} is not on the server's live scan allowlist.`);
  if (isIP(host)) return [host]; // A literal address was approved as-is by the administrator.
  if (LOOPBACK_NAMES.has(host)) return ["127.0.0.1"];
  const addresses = (await lookup(host, { all: true })).map((a) => a.address);
  if (!addresses.length) throw new Error(`Egress blocked: ${host} did not resolve.`);
  const internal = addresses.filter(isInternalAddress);
  if (internal.length) throw new Error(`Egress blocked: ${host} resolves to an internal address (${internal.join(", ")}). Approve the address itself if this is intended.`);
  return addresses;
}
