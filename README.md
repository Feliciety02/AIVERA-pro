# AEGIS AI — Intelligent Web Security Assessment & Vulnerability Management Platform

> **Intelligent Security. Verified Decisions.**
> Frontend phase of a university final project. **Demo mode only** — no backend, no real scanning, no real AI.

AEGIS AI helps authorized security assessors plan assessments, register authorized targets and scope,
review tool output, use AI assistance for interpretation, **verify findings by hand**, prioritise risk,
track remediation and generate reports. The core principle: *AI assists the assessor but never confirms a vulnerability.*

---

## Run it locally

Requirements: Node.js 20.19+ (tested on Node 24) and npm.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # strict type-check (tsc -b) + production build to dist/
npm run preview    # serve the production build
npm run typecheck  # type-check only
```

Open the app, pick a demo persona on `/login` (no password), and you're in.
To start over, use **Settings → General → Reset demo data**.

### Full stack (backend + database)

The backend is Node.js + Express 5 + Prisma. Local development uses SQLite (no install needed).

```bash
npm install                                # also generates the Prisma client
copy server\.env.example server\.env       # Windows (use cp on macOS/Linux)
npm run db:setup                           # create tables + load the demo dataset
npm run dev:full                           # API on :4000 + web app (API mode) on :5173
```

Sign in with a seeded account (e.g. `jordan.kim@aegis-demo.example`) using the password set as
`SEED_DEMO_PASSWORD` in `server/.env`. Change it before any shared deployment.

| Script | What it does |
|---|---|
| `npm run server:dev` | API with auto-reload (`http://localhost:4000/api`) |
| `npm run dev:api` | Web app in API mode (proxies `/api` to the server) |
| `npm run db:push` / `db:seed` | Sync schema / reload demo data |
| `npm run build:api` then `NODE_ENV=production npm run server:start` | Single-origin production deployment (Express serves `dist/`) |

**Real AI (Google Gemini):** create a key at https://aistudio.google.com/apikey, then in `server/.env` set
`GEMINI_API_KEY=...` (and optionally `GEMINI_MODEL`, default `gemini-3.6-flash`) and restart the server. All six AI
modes then run on Gemini through the server (`server/src/ai/gemini.ts`, official `@google/genai` SDK):
evidence is redacted first (`server/src/ai/redact.ts`), output is forced into a JSON schema and validated, each
analysis stores the model name and the exact redacted text sent (shown under "Data sent to the AI model"), and
results never change a finding's verification status. Without a key the server uses the labelled demo samples.
Free-tier note: Google states free-tier content may be used to improve its products — use test/synthetic data only.

**Switching to MySQL:** in `server/prisma/schema.prisma` set `provider = "mysql"`, set `DATABASE_URL` in
`server/.env` to a MySQL URL, then run `npm run db:setup`.

**What the backend enforces (not just the UI):** bcrypt-hashed passwords, hashed session tokens in httpOnly
cookies, login throttling, role permissions on every write, target authorization + scope re-checked on every
import/simulation, verification rules (notes, reason, evidence attestation), remediation rules (passed retest +
approval before *Resolved*), and an append-only activity log. The server never contacts assessment targets.

> Keep `node_modules` out of OneDrive sync (or move the project outside OneDrive). OneDrive file locks can
> corrupt installs (`ENOTEMPTY` errors).

---

## Tech stack

React 19 + TypeScript (strict) · Vite 7 · Tailwind CSS 4 · shadcn/ui-style components on Radix (`radix-ui`) ·
Lucide icons · React Router 7 · Recharts 3 · Zustand 5 (+ persist) · React Hook Form + Zod ·
TanStack Table 8 · date-fns 4 · Sonner · jsPDF + jspdf-autotable (client-side PDF) · Inter / JetBrains Mono (self-hosted via Fontsource).

---

## End-to-end demo script (all steps share one state store)

1. Open AEGIS AI → `/login`, choose **Jordan Kim (Security Assessor)**.
2. **Dashboard** — metrics computed from state (only *Confirmed* findings count as vulnerabilities).
3. **Projects → New project** — validated multi-section form → project detail page.
4. **Register target** (from the project) — URL is syntax-validated only and **never contacted**; the
   "I confirm that this application is authorized…" checkbox is required; scope (hosts, allowed/excluded paths,
   categories, allowed/restricted activities) is defined in the same form. Use **Add &lt;host&gt; to scope**.
5. On the target page: **Edit scope** to add an exclusion; review the scope visualization.
6. **Configure demo scan** → 6-step wizard (project → authorized target → confirm scope → tools → configuration → review).
   **Start Assessment** is disabled with an explanation; click **Run Demo Simulation**.
7. Watch the progress (labelled **SIMULATED**). Findings appear when it completes (toast → *View findings*).
8. Open a finding → **AI Analysis** tab → *Generate sample analysis* ("Sample AI Analysis — Demo Mode").
9. **Technical Evidence** tab → review / mark evidence reviewed.
10. **Confirm** (notes + reason + evidence attestation + second confirmation) or **Reject**.
11. Back on the **Dashboard**: confirmed / critical / pending counts update.
12. **Risk & Remediation** tab → **Create task** → **Remediation Tracking**: Start work → Request retest →
    Record retest passed → **Approve & resolve** (resolution is blocked until a passed retest + manual approval).
13. **Reports → Create report** — 7-step wizard → preview → **Generate** → **Download PDF** (real PDF, watermarked "DEMO DATA").

---

## Modules & routes

| Area | Routes |
|---|---|
| Auth (demo) | `/login` |
| Overview | `/dashboard`, `/analytics` |
| Projects | `/projects`, `/projects/new`, `/projects/:projectId`, `/projects/:projectId/edit` |
| Targets & scope | `/targets`, `/targets/new`, `/targets/:targetId`, `/targets/:targetId/edit` |
| Reconnaissance | `/reconnaissance` (Overview, Host, Port, Service, DNS, Endpoint, History tabs) |
| Scan Center | `/scans`, `/scans/new`, `/scans/:scanId` |
| Vulnerability Assessment | `/assessments`, `/assessments/:categoryId` (8 categories, 6 emphasised) |
| AI Security Analyst | `/ai-analyst` (6 modes) |
| Findings & Evidence | `/findings`, `/findings/:findingId` |
| Risk Management | `/risks` (5×5 matrix, register, trends) |
| Remediation | `/remediation` (board, list, insights, timeline) |
| Reports | `/reports`, `/reports/new`, `/reports/:reportId` |
| Activity Logs | `/activity` |
| System | `/users`, `/integrations`, `/settings` |

---

## Architecture

```
src/
  app/            App shell providers + router (route-level code splitting)
  components/
    ui/           shadcn-style primitives (Button, Dialog, Select, Tabs, Sheet, Table…)
    layout/       AppShell, Sidebar, Header, Breadcrumbs, GlobalSearch (Ctrl+K), PageHeader
    shared/       DataTable (TanStack), filters, ConfirmDialog, Empty/Error/Loading states
    security/     Severity/Status/Tool/Origin/Scope badges, EvidenceViewer, VerificationDialog,
                  RiskMatrix, ScanProgress, AIAnalysisPanel
    forms/        ProjectForm, TargetForm, ScopeEditor, ScanWizard, RemediationForm, ReportWizard
    charts/       Recharts wrappers with accessible text summaries
    dashboard/    StatCard, RecentActivity, VerificationQueue, FindingRow
    reports/      ReportDocument (print-friendly preview)
  features/       metrics (all chart numbers derive from state), simulation engine, report model
  services/       Service layer (demo adapter) + api/contracts.ts (future REST surface) + ai/aiService.ts
  stores/         dataStore (single source of truth, persisted + versioned), session/UI stores
  data/           Synthetic seed dataset + finding templates (with predefined sample AI analyses)
  lib/            constants, risk model, permissions, formatting, CSV, PDF
  types/          Domain model (User, Project, Target, TargetScope, Scan, Finding, Evidence, AIAnalysis, …)
```

- **One source of truth:** every entity lives once in `useDataStore`, referenced by ID. Dashboards, analytics and
  reports are *derived* (see `src/features/metrics.ts`, `src/features/reports/reportModel.ts`).
- **Persistence:** `localStorage` key `aegis-demo-state`, versioned by `SEED_VERSION` — a version bump re-seeds.
- **Seed data:** fixed dates and IDs (no randomness on reload). Hostnames use `.example` / `.test` / `localhost`;
  IPs use documentation ranges (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24).
- **Provenance everywhere:** every scan, finding, evidence item and recon record carries `dataOrigin`
  (`synthetic` · `imported` sample · `SIMULATED` · `user_created` · `real` reserved for the backend) and shows a badge.

---

## What actually works (frontend, persisted in the browser)

Create/edit/archive/restore projects · register/edit targets with validated scope · edit scope in a dialog ·
record authorization · import labelled sample recon data · 6-step scan wizard · in-browser **SIMULATED** scans
with live progress, cancel, and resume after reload · guided category checklists (automated vs manual) ·
findings table with search, multi-filter, sort, pagination, row selection, bulk assign, CSV export · quick-view drawer ·
evidence review toggles and sensitive-value masking · human verification workflow with audit history ·
sample AI analyses (6 modes) with history, copy, send-to-verification-queue · automatic risk record on confirmation ·
editable 5×5 risk matrix/register · remediation tasks with retest + manual approval workflow and timeline ·
analytics with date-range & project filters · report wizard, print view and **real PDF export** ·
activity log with filters and CSV export · notifications · user/role management with role-based navigation ·
settings (theme dark/light/system, density, page size, notifications, safeguards, defaults) · global search · reset demo data.

### Added in phase 2

- **Tool output import** (Scan Center, Reconnaissance, Target detail → *Import tool output*): parses **Nmap XML** and
  **OWASP ZAP JSON** reports in the browser for one authorized target. Out-of-scope hosts, URLs, excluded paths and
  non-permitted categories are skipped and listed in a preview before import. Creates an *Imported* scan with raw output,
  hosts/ports/endpoints, and findings (ZAP alerts; exposed DB/admin services from Nmap) as **Pending Verification**.
  A *Load synthetic sample* button provides fictional reports for demos. AEGIS never runs the tools.
- **Manual findings**: *Record manual finding* (Findings page) and *Record finding* on checklist items
  (Vulnerability Assessment). Requires evidence; links the finding code back to the checklist item and marks it failed.
- **Manual evidence notes** on any finding (Evidence tab → *Add evidence note*).
- **Remediation task editing** (title, description, recommendation, owner, priority, due date, retest requirement).
  Status still changes only through the workflow actions.
- **Settings that now take effect**: date format and timezone apply to every displayed date (calendar dates don't shift);
  overdue remediation tasks raise one notification each when "Remediation due dates" is on; the idle lock signs out of the
  demo persona after inactivity (Off / 5–60 min).
- The demo AI adapter states plainly when no sample exists (imported/manual findings) and only echoes recorded fields.

### Implementation status

| Module | Status |
|---|---|
| App shell, navigation, search, notifications, themes, demo login/roles | Complete (frontend) |
| Dashboard, Security Analytics | Complete — all numbers derived from state |
| Projects, Targets & Scope | Complete |
| Reconnaissance | Complete — sample bundles + Nmap XML import |
| Scan Center | Complete for simulation and file import; **real scanning requires backend** (button disabled) |
| Vulnerability Assessment | Complete — guided checklists, manual findings |
| Findings & Evidence, Verification | Complete — incl. manual evidence |
| AI Security Analyst | Complete UI; **demo adapter only** (no LLM) |
| Risk, Remediation | Complete |
| Reports (preview, print, PDF) | Complete — demonstration data only |
| Activity, Users, Integrations, Settings | Complete (integrations honestly show Not Connected) |
| Backend, real auth, scan workers, LLM gateway, tamper-proof audit | **Not started** (out of scope for this phase) |

## Demo-only (clearly labelled in the UI)

- **Login & roles** — personas, client-side guards and permissions are UI demonstrations, not security.
- **Scans** — "Run Demo Simulation" fabricates clearly labelled SIMULATED records; **Start Assessment is disabled**.
- **Reconnaissance** — sample bundles only; no DNS lookups, no port scans, no HTTP requests.
- **AI** — deterministic demo adapter returning predefined samples per finding template; no LLM is called.
- **Integrations** — all show *Not Connected* (AI shows *Demo Adapter*); *Connect* is disabled.
- **Activity log** — stored in localStorage; explicitly not a tamper-proof audit trail.
- **Reports** — always generated from demonstration data and watermarked.

**Safety guarantees in this phase:** the frontend never visits, requests, crawls, scans or authenticates against a
target URL, never executes Nmap/ZAP, never calls an AI model, and stores no secrets.

---

## Backend integration points (Node.js + Express + MySQL + isolated workers)

- `src/services/api/contracts.ts` — documented REST routes (`API_ROUTES`) and `DATA_MODE` switch (`VITE_DATA_MODE`).
- `src/services/index.ts` — typed services (`projectService`, `targetService`, `scanService`, `reconService`,
  `findingService`, `verificationService`, `analysisService`, `riskService`, `remediationService`, `reportService`,
  `userService`, `settingsService`). Swap each demo implementation for an API call with the same signature.
- `src/services/ai/aiService.ts` — `AIAdapter` interface; `demoAIAdapter` now, `apiAIAdapter` placeholder for the backend AI gateway.
- `scanService.startRealAssessment()` — reserved; must be implemented server-side with **independent scope & authorization enforcement**.

The backend must independently authenticate users, authorize every action, re-validate target scope for every job,
run tools only on isolated workers, keep secrets server-side, and write an append-only audit log.

## Remaining work (next phases)

Backend API + MySQL schema · real authentication/authorization · scan worker orchestration for Nmap & OWASP ZAP with
scope enforcement (server-side re-validation of imports too) · backend AI gateway with evidence redaction ·
server-side PDF/report storage · tamper-evident audit log · automated tests (unit + E2E).
