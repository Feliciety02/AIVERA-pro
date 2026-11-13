import "./env.ts";
import { PrismaClient } from "../prisma/generated/prisma/client.ts";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const dbUrl = process.env.DATABASE_URL!;
if (!dbUrl.startsWith("file:")) throw new Error("This deployment requires a SQLite DATABASE_URL.");
const dbFile = dbUrl.slice("file:".length);
/** Absolute path of the SQLite file (other files that belong to this database sit next to it). */
export const dbFilePath = resolve(process.cwd(), "server/prisma", dbFile);
const adapter = new PrismaBetterSqlite3({ url: `file:${dbFilePath}` });
export const prisma = new PrismaClient({ adapter });

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

/**
 * Codes like RPT-0003 are read, then inserted into a unique column. If two saves pick the same
 * code at the same moment, the database rejects the second one (P2002); this runs `create`
 * again so it reads the codes afresh and takes the next free one.
 */
export async function retryOnDuplicateCode<T>(create: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await create();
    } catch (e) {
      if (attempt < attempts && (e as { code?: string }).code === "P2002") continue;
      throw e;
    }
  }
}
