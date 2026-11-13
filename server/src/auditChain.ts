/**
 * Tamper-evident activity log.
 *
 * Every entry is "sealed" into a hash chain: it gets the next sequence number, the previous
 * entry's hash, and its own HMAC-SHA256 over its fields plus that previous hash. The HMAC key
 * (AIVERA_AUDIT_KEY) lives only in server/.env, so someone who can edit the database cannot
 * quietly rewrite an entry and recompute the chain. Editing, deleting or reordering any entry
 * breaks verification from that point on. A small anchor file outside the database records
 * the newest sealed entry, so cutting entries off the end is caught too.
 *
 * Limits: whoever has both the database and server/.env can still forge a new chain; the
 * anchor file is only as safe as the folder it is in. This is tamper EVIDENCE, not prevention.
 */
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { dbFilePath, prisma } from "./db.ts";

const ENV_PATH = resolve(process.cwd(), "server/.env");
// One anchor per database file, kept next to it (a test copy of the database gets its own).
const ANCHOR_PATH = `${dbFilePath}.audit-anchor.json`;
const GENESIS = "GENESIS";

/** The HMAC key. Created once and saved to server/.env if it is missing. */
function auditKey(): string {
  let key = process.env.AIVERA_AUDIT_KEY?.trim();
  if (!key) {
    key = randomBytes(32).toString("hex");
    process.env.AIVERA_AUDIT_KEY = key;
    try {
      appendFileSync(ENV_PATH, `\n# Secret for the tamper-evident activity log. Never share or commit it; changing it makes old entries fail verification.\nAIVERA_AUDIT_KEY=${key}\n`);
    } catch {
      console.warn("[audit] Could not save AIVERA_AUDIT_KEY to server/.env; set it manually or verification will fail after a restart.");
    }
  }
  return key;
}

interface Row { id: string; type: string; userId: string; timestamp: Date; entityType: string; entityId: string | null; entityLabel: string; description: string }

/** Canonical text of an entry: fixed field order, so the same entry always hashes the same. */
export function entryHash(r: Row, seq: number, prevHash: string, key = auditKey()): string {
  const canonical = JSON.stringify([seq, prevHash, r.id, r.type, r.userId, r.timestamp.toISOString(), r.entityType, r.entityId ?? null, r.entityLabel, r.description]);
  return createHmac("sha256", key).update(canonical).digest("hex");
}

function readAnchor(): { seq: number; hash: string } | null {
  try {
    return existsSync(ANCHOR_PATH) ? JSON.parse(readFileSync(ANCHOR_PATH, "utf8")) : null;
  } catch {
    return null;
  }
}
function writeAnchor(seq: number, hash: string) {
  writeFileSync(ANCHOR_PATH, JSON.stringify({ seq, hash, updatedAt: new Date().toISOString() }, null, 2));
}

let queue: Promise<unknown> = Promise.resolve();
/**
 * Seals every entry that has no hash yet, oldest first, onto the end of the chain.
 * Runs one at a time so the chain never forks.
 */
export function sealPending(): Promise<number> {
  const run = queue.then(async () => {
    const pending = await prisma.activityLog.findMany({ where: { seq: null }, orderBy: [{ timestamp: "asc" }, { id: "asc" }] });
    if (!pending.length) return 0;
    const last = await prisma.activityLog.findFirst({ where: { seq: { not: null } }, orderBy: { seq: "desc" } });
    let seq = last?.seq ?? 0;
    let prev = last?.hash ?? GENESIS;
    for (const r of pending) {
      seq += 1;
      const hash = entryHash(r, seq, prev);
      await prisma.activityLog.update({ where: { id: r.id }, data: { seq, prevHash: prev, hash } });
      prev = hash;
    }
    writeAnchor(seq, prev);
    return pending.length;
  });
  queue = run.catch(() => undefined);
  return run;
}

/** Called after the log is wiped on purpose (database reset), so the old anchor isn't reported as missing entries. */
export function resetAnchor() {
  writeAnchor(0, GENESIS);
}

export interface AuditVerification {
  intact: boolean;
  checked: number;
  unsealed: number;
  /** First problem found, in plain words. */
  problem?: string;
  firstBadSeq?: number;
  head?: { seq: number; hash: string };
  verifiedAt: string;
}

/** Walks the whole chain and recomputes every hash. */
export async function verifyChain(): Promise<AuditVerification> {
  await queue; // let any sealing in progress finish first
  const rows = await prisma.activityLog.findMany({ where: { seq: { not: null } }, orderBy: { seq: "asc" } });
  const unsealed = await prisma.activityLog.count({ where: { seq: null } });
  const verifiedAt = new Date().toISOString();
  const key = auditKey();
  let prev = GENESIS;
  let expected = 1;
  for (const r of rows) {
    if (r.seq !== expected) return { intact: false, checked: expected - 1, unsealed, firstBadSeq: expected, problem: `Entry #${expected} is missing (deleted).`, verifiedAt };
    if (r.prevHash !== prev) return { intact: false, checked: expected - 1, unsealed, firstBadSeq: r.seq, problem: `Entry #${r.seq} no longer links to the entry before it.`, verifiedAt };
    if (entryHash(r, r.seq, r.prevHash, key) !== r.hash) return { intact: false, checked: expected - 1, unsealed, firstBadSeq: r.seq, problem: `Entry #${r.seq} was changed after it was recorded.`, verifiedAt };
    prev = r.hash;
    expected += 1;
  }
  const head = { seq: expected - 1, hash: prev };
  const anchor = readAnchor();
  if (anchor && anchor.seq > head.seq) return { intact: false, checked: head.seq, unsealed, firstBadSeq: head.seq + 1, head, problem: `The newest ${anchor.seq - head.seq} entr${anchor.seq - head.seq === 1 ? "y was" : "ies were"} removed from the end of the log.`, verifiedAt };
  if (anchor && anchor.seq === head.seq && anchor.hash !== head.hash) return { intact: false, checked: head.seq, unsealed, firstBadSeq: head.seq, head, problem: "The newest entry does not match the saved anchor.", verifiedAt };
  return { intact: true, checked: head.seq, unsealed, head, verifiedAt };
}
