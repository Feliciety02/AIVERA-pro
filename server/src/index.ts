/**
 * AEGIS AI API server (Express 5 + Prisma).
 *
 * Security posture:
 *  - Session auth with hashed tokens; role checks on every mutating route.
 *  - Target scope re-validated server-side for imports and simulations.
 *  - The server never connects to assessment targets in this phase:
 *    tool output is uploaded by the assessor and parsed here.
 *  - Append-only activity log.
 */
import { env } from "./env.ts";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { errorHandler } from "./http.ts";
import { router as core } from "./routes/core.ts";
import { router as security } from "./routes/security.ts";
import { router as workflow } from "./routes/workflow.ts";
import { prisma } from "./db.ts";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "3mb" }));
app.use(cookieParser());

// Basic CSRF defence for cookie auth: state-changing requests must be JSON
// (a cross-site HTML form cannot send application/json without CORS preflight).
app.use("/api", (req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && !req.is("application/json") && req.headers["content-length"] !== "0") {
    return res.status(415).json({ error: "Requests must be application/json" });
  }
  next();
});

app.get("/api/health", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true, service: "aegis-api", time: new Date().toISOString() });
});

const api = express.Router();
api.use(core); // auth routes first; core applies requireAuth to everything after /auth/login + /auth/logout
api.use(security);
api.use(workflow);
app.use("/api", api);
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// In production, serve the built SPA (npm run build:api) from the same origin.
const dist = resolve(process.cwd(), "dist");
if (env.isProd && existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(resolve(dist, "index.html")));
}

app.use(errorHandler);

app.listen(env.port, () => console.log(`AEGIS API listening on http://localhost:${env.port}`));
