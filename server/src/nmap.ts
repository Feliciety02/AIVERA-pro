/** Server-side Nmap XML parser (the browser version uses DOMParser). Produces the same ParseResult. */
import { XMLParser } from "fast-xml-parser";
import type { ParseResult, ParsedHost } from "@/features/imports/parsers";

type Node = Record<string, unknown>;
const list = (v: unknown): Node[] => (Array.isArray(v) ? (v as Node[]) : v ? [v as Node] : []);
const attr = (n: Node | undefined, k: string) => (n?.[`@_${k}`] as string | undefined) ?? undefined;

export function parseNmapXmlServer(text: string): ParseResult {
  let doc: Node;
  try {
    // Entity expansion off: protects against billion-laughs style payloads.
    doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", processEntities: false }).parse(text) as Node;
  } catch {
    throw new Error("The file is not well-formed XML.");
  }
  const run = doc.nmaprun as Node | undefined;
  if (!run) throw new Error("Not an Nmap XML report (expected <nmaprun> root element).");
  const hosts: ParsedHost[] = list(run.host).map((h) => {
    const addrs = list(h.address);
    const address = attr(addrs.find((a) => attr(a, "addrtype") === "ipv4" || attr(a, "addrtype") === "ipv6"), "addr") ?? attr(addrs[0], "addr") ?? "";
    const hostname = attr(list((h.hostnames as Node | undefined)?.hostname)[0], "name") ?? address;
    const st = attr(h.status as Node, "state");
    const ports = list((h.ports as Node | undefined)?.port).map((p) => {
      const svc = p.service as Node | undefined;
      const state = attr(p.state as Node, "state") ?? "unknown";
      return {
        port: Number(attr(p, "portid")),
        protocol: (attr(p, "protocol") === "udp" ? "udp" : "tcp") as "tcp" | "udp",
        state: (state === "open" ? "open" : state.startsWith("filtered") || state === "open|filtered" ? "filtered" : "closed") as "open" | "filtered" | "closed",
        service: attr(svc, "name") ?? "unknown",
        version: [attr(svc, "product"), attr(svc, "version"), attr(svc, "extrainfo")].filter(Boolean).join(" ") || "N/A",
      };
    });
    return {
      address,
      hostname,
      state: (st === "up" ? "up" : st === "down" ? "down" : "unknown") as ParsedHost["state"],
      osGuess: attr(list((h.os as Node | undefined)?.osmatch)[0], "name"),
      ports: ports.filter((p) => Number.isFinite(p.port)),
    };
  });
  return { format: "nmap_xml", hosts, alerts: [], warnings: hosts.length ? [] : ["No <host> entries were found in the report."] };
}
