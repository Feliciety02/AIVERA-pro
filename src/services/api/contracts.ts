/**
 * Future backend contract (Node.js + Express + MySQL, isolated scan workers).
 *
 * These are the REST endpoints the API adapter will call once the backend
 * exists. They are documented here so the demo adapter and the API adapter
 * expose the same typed surface. NOTHING in this file performs a request.
 *
 * Security expectations for the backend (not enforceable from the browser):
 *  - Authenticate every request (session or token) and authorize by role.
 *  - Re-validate target authorization and scope server-side for every scan job.
 *  - Dispatch Nmap/ZAP jobs only to isolated workers; never from the browser.
 *  - Keep tool and model API keys in server-side secret storage.
 *  - Write an append-only, tamper-evident audit log.
 */
export const API_ROUTES = {
  auth: { login: "POST /api/auth/login", logout: "POST /api/auth/logout", me: "GET /api/auth/me" },
  projects: { list: "GET /api/projects", create: "POST /api/projects", get: "GET /api/projects/:id", update: "PATCH /api/projects/:id", archive: "POST /api/projects/:id/archive", restore: "POST /api/projects/:id/restore" },
  targets: { list: "GET /api/targets", create: "POST /api/targets", update: "PATCH /api/targets/:id", scope: "PUT /api/targets/:id/scope" },
  scans: { list: "GET /api/scans", create: "POST /api/scans", get: "GET /api/scans/:id", cancel: "POST /api/scans/:id/cancel", results: "GET /api/scans/:id/results" },
  recon: { hosts: "GET /api/recon/hosts", ports: "GET /api/recon/ports", dns: "GET /api/recon/dns", endpoints: "GET /api/recon/endpoints", import: "POST /api/recon/import" },
  findings: { list: "GET /api/findings", get: "GET /api/findings/:id", verify: "POST /api/findings/:id/verifications", assign: "POST /api/findings/assign" },
  ai: { analyze: "POST /api/ai/analyses", history: "GET /api/ai/analyses" },
  risks: { list: "GET /api/risks", update: "PATCH /api/risks/:id" },
  remediation: { list: "GET /api/remediation", create: "POST /api/remediation", status: "POST /api/remediation/:id/status", retest: "POST /api/remediation/:id/retest" },
  reports: { list: "GET /api/reports", create: "POST /api/reports", pdf: "GET /api/reports/:id/pdf" },
  activity: { list: "GET /api/activity" },
  users: { list: "GET /api/users", update: "PATCH /api/users/:id" },
  settings: { get: "GET /api/settings", update: "PATCH /api/settings" },
} as const;

export type DataMode = "demo" | "api";

export const DATA_MODE: DataMode = (import.meta.env.VITE_DATA_MODE as DataMode | undefined) === "api" ? "api" : "demo";

/** Placeholder HTTP client for the future API adapter. Throws until implemented. */
export async function apiRequest<T>(route: string): Promise<T> {
  throw new Error(`Backend not available in this phase (attempted ${route}). Running in demo mode.`);
}
