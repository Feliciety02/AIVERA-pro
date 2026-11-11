import "./env.ts";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

export const prisma = new PrismaClient();

/** Same ID style as the frontend (`prefix-<time><random>`), but with a CSPRNG. */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${randomBytes(4).toString("hex").slice(0, 5)}`;
}

/** Next sequential code like SCN-0012 from existing codes. */
export function nextCode(prefix: string, codes: string[], pad = 4): string {
  const max = codes.reduce((m, c) => {
    const n = Number.parseInt(c.split("-").pop() ?? "0", 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(pad, "0")}`;
}

export const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);
export const date = (s: string | null | undefined) => (s ? new Date(s) : null);
