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
import type { User } from "../prisma/generated/prisma/client.ts";
import { can, type Permission } from "@/lib/permissions";
import { prisma } from "./db.ts";
import { env } from "./env.ts";

export const COOKIE = "aegis_session";

// One role matrix for the server and the web app (src/lib/permissions.ts).
export { can, type Permission };

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

/** SQLite-backed throttle shared by API instances and retained across restarts. Keys are hashed. */
const THROTTLE_WINDOW_MS = 15 * 60_000;
const THROTTLE_LIMIT = 10;
export async function loginThrottle(key: string): Promise<{ blocked: boolean; fail: () => Promise<void>; reset: () => Promise<void> }> {
  const id = sha256(key);
  const cutoff = new Date(Date.now() - THROTTLE_WINDOW_MS);
  await prisma.loginAttempt.deleteMany({ where: { key: id, firstAt: { lt: cutoff } } });
  const current = await prisma.loginAttempt.findUnique({ where: { key: id } });
  return {
    blocked: (current?.count ?? 0) >= THROTTLE_LIMIT,
    fail: async () => { await prisma.loginAttempt.upsert({
      where: { key: id }, create: { key: id, count: 1, firstAt: new Date() }, update: { count: { increment: 1 } },
    }); },
    reset: async () => { await prisma.loginAttempt.deleteMany({ where: { key: id } }); },
  };
}

setInterval(() => {
  void prisma.loginAttempt.deleteMany({ where: { firstAt: { lt: new Date(Date.now() - THROTTLE_WINDOW_MS) } } }).catch((e) => console.error("Login throttle cleanup failed", e));
}, 60 * 60_000).unref();
