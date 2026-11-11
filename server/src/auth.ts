/**
 * Authentication & authorization.
 *
 *  - Passwords: bcrypt (cost 12). Plaintext is never stored or logged.
 *  - Sessions: random 32-byte token in an httpOnly, SameSite=Lax cookie; only
 *    its SHA-256 hash is stored, so a database leak does not leak sessions.
 *  - Authorization: every mutating route declares the permission it needs and
 *    is checked here on the server, the frontend's role checks are UI only.
 */
import type { NextFunction, Request, Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import type { UserRole } from "@/types";
import { prisma } from "./db.ts";
import { env } from "./env.ts";

export const COOKIE = "aegis_session";

export type Permission =
  | "manage_users" | "manage_settings" | "manage_integrations" | "manage_projects" | "manage_targets" | "run_demo_scans"
  | "verify_findings" | "manage_remediation" | "generate_reports" | "use_ai" | "view_activity";

const MATRIX: Record<UserRole, Permission[]> = {
  administrator: ["manage_users", "manage_settings", "manage_integrations", "manage_projects", "manage_targets", "run_demo_scans", "verify_findings", "manage_remediation", "generate_reports", "use_ai", "view_activity"],
  assessor: ["manage_projects", "manage_targets", "run_demo_scans", "verify_findings", "manage_remediation", "generate_reports", "use_ai", "view_activity"],
  viewer: [],
};

export const can = (role: string, p: Permission) => (MATRIX[role as UserRole] ?? []).includes(p);

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function createSession(res: Response, userId: string, userAgent?: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + env.sessionTtlHours * 3600_000);
  await prisma.session.create({ data: { id: sha256(token), userId, expiresAt, userAgent: userAgent?.slice(0, 200) } });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: "lax", secure: env.isProd, expires: expiresAt, path: "/" });
}

export async function destroySession(req: Request, res: Response) {
  const token = req.cookies?.[COOKIE] as string | undefined;
  if (token) await prisma.session.deleteMany({ where: { id: sha256(token) } });
  res.clearCookie(COOKIE, { path: "/" });
}

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}

/** Resolves the session cookie to an active user, or responds 401. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.user) return next();
  const token = req.cookies?.[COOKIE] as string | undefined;
  if (!token) return res.status(401).json({ error: "Not signed in" });
  const session = await prisma.session.findUnique({ where: { id: sha256(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } });
    res.clearCookie(COOKIE, { path: "/" });
    return res.status(401).json({ error: "Session expired" });
  }
  if (session.user.status !== "active") return res.status(403).json({ error: "Account is not active" });
  req.user = session.user;
  next();
}

/** Route guard: `router.post("/x", requirePermission("manage_projects"), handler)`. */
export function requirePermission(p: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !can(req.user.role, p)) return res.status(403).json({ error: `Your role (${req.user?.role ?? "none"}) is not permitted to ${p.replaceAll("_", " ")}.` });
    next();
  };
}

/** Minimal in-memory login throttle: 10 failed attempts per IP+email per 15 minutes. */
const attempts = new Map<string, { count: number; first: number }>();
export function loginThrottle(key: string): { blocked: boolean; fail: () => void; reset: () => void } {
  const now = Date.now();
  const rec = attempts.get(key);
  if (rec && now - rec.first > 15 * 60_000) attempts.delete(key);
  const cur = attempts.get(key);
  return {
    blocked: !!cur && cur.count >= 10,
    fail: () => attempts.set(key, cur ? { ...cur, count: cur.count + 1 } : { count: 1, first: now }),
    reset: () => attempts.delete(key),
  };
}
