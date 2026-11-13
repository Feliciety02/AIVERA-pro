/**
 * AIVERA API server (Express 5 + Prisma).
 *
 * Security posture:
 *  - Session auth with hashed tokens; role checks on every mutating route.
 *  - Target scope re-validated server-side for imports and simulations.
 *  - Live tools run only when AIVERA_LIVE_SCANS_ENABLED=true, against allowlisted hosts, in a
 *    separate worker process without server secrets (see scanWorker.ts).
 *  - Append-only, tamper-evident activity log (see auditChain.ts).
 */
import { env } from "./env.ts";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { errorHandler } from "./http.ts";
import { router as core } from "./routes/core.ts";
import { router as security, recoverInterruptedScans } from "./routes/security.ts";
import { router as workflow } from "./routes/workflow.ts";
import { router as automation } from "./routes/automation.ts";
import { prisma } from "./db.ts";
import { sealPending } from "./auditChain.ts";

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
  res.json({ ok: true, service: "aivera-api", time: new Date().toISOString() });
});

const api = express.Router();
api.use(core); // auth routes first; core applies requireAuth to everything after /auth/login + /auth/logout
api.use(security);
api.use(workflow);
api.use(automation);
app.use("/api", api);
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// In production, serve the built SPA (npm run build:api) from the same origin.
const dist = resolve(process.cwd(), "dist");
if (env.isProd && existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(resolve(dist, "index.html")));
}

// In development the website is served by Vite (which proxies /api here), so opening
// this port directly would show "Cannot GET /". Point people to the real address instead.
if (!env.isProd) {
  const appUrl = process.env.AIVERA_APP_URL ?? "http://localhost:5173";
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AIVERA API</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#03060c;color:#cbd5e1;font:15px/1.6 system-ui,Roboto,sans-serif}
main{max-width:460px;padding:32px;border:1px solid #1e293b;border-radius:20px;background:#070b14}
h1{margin:0 0 8px;color:#fff;font-size:20px;font-weight:600}code{color:#7dd3fc}
a{display:inline-block;margin-top:16px;padding:10px 20px;border-radius:999px;background:#38bdf8;color:#020617;font-weight:600;text-decoration:none}
</style></head><body><main><h1>This is the AIVERA API server</h1>
<p>Port <code>${env.port}</code> only answers the app's <code>/api</code> requests. The website runs on the Vite dev server.</p>
<p>Started with <code>npm run dev:full</code>, it is usually <code>${appUrl}</code>.</p>
<a href="${appUrl}">Open AIVERA</a></main></body></html>`);
  });
}

app.use(errorHandler);

app.listen(env.port, () => console.log(`AIVERA API listening on http://localhost:${env.port}`));
// Seal activity entries written outside log() (seed data, one-off maintenance scripts).
void sealPending().then((n) => n && console.log(`[audit] sealed ${n} activity entr${n === 1 ? "y" : "ies"} into the chain`)).catch((e) => console.error("[audit] sealing failed", e));
// Scans cut off by a previous stop or restart would otherwise show "Running" forever.
void recoverInterruptedScans().then((n) => n && console.log(`[scan] marked ${n} interrupted scan(s) as failed`)).catch((e) => console.error("[scan] recovery failed", e));
