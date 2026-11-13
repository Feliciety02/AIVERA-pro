# AIVERA: Intelligent Web Security Assessment & Vulnerability Management Platform

> **Intelligent Security. Verified Decisions.**
> University final project with a browser demo mode and a database-backed API mode. API mode can run bounded passive assessments when explicitly enabled on a dedicated lab machine.

AIVERA helps authorized security assessors plan assessments, register authorized targets and scope,
review tool output, use AI assistance for interpretation, **verify findings by hand**, prioritise risk,
track remediation and generate reports. The core principle: *AI assists the assessor but never confirms a vulnerability.*

---

## Run it locally

**Full setup guide: [docs/SETUP.md](docs/SETUP.md).** It covers requirements, every `server/.env` setting, AI providers, live scanning, the UMERCH3.0 targets, backups and troubleshooting.

Requirements: **Node.js 22 or newer** (tested on 24) and npm. Nmap, OWASP ZAP and AI keys are optional.

```powershell
npm install                                # also generates the Prisma client
copy server\.env.example server\.env       # then set SEED_DEMO_PASSWORD (cp on macOS/Linux)
npm run db:setup                           # create the database and load the starting data
npm run dev:full                           # API on :4000 + web app on http://localhost:5173
```

Sign in with a seeded account (`admin@aivera.local`, `lead@aivera.local`, `assessor@aivera.local`, `developer@aivera.local`
or `viewer@aivera.local`) using the password set as `SEED_DEMO_PASSWORD` in `server/.env`. Change it before any shared
deployment. An existing database from before the team roles gets the new accounts with `npm run db:accounts` (no reseed).

**Team roles and workflow:** Administrator > Security Lead > Security Assessor > Remediation Owner > Viewer, defined once in
`src/lib/permissions.ts` and enforced by the server. People see only their projects. Nobody approves their own work: the
lead signs off critical and high findings, approves closing fixes and makes reports final. Assignments are automatic
(`server/src/workflowRules.ts`): findings to the least busy assessor, fix tasks with a due date by severity to the
developer, retests to the confirming assessor, approvals to the lead, overdue fixes escalated, and open work handed over
when someone leaves. See [docs/SETUP.md](docs/SETUP.md#33-create-the-database) for the full table.

`npm run dev:full` reloads the API whenever a server file changes, which interrupts a running scan. For long scans, run `npm run server:start` and `npm run dev` in two terminals instead.

| Script | What it does |
|---|---|
| `npm run server:dev` | API with auto-reload (`http://localhost:4000/api`) |
| `npm run server:start` | API without auto-reload (use during long scans) |
| `npm run dev:demo` | Browser-only demo with synthetic data, no server |
| `npm run typecheck` / `test:scan-scope` / `build:api` | Checks to run before a demo or commit |
| `npm run dev:api` | Web app in API mode (proxies `/api` to the server) |
| `npm run db:push` / `db:seed` | Sync schema / reload the UMERCH3.0 starting data |
| `npm run db:accounts` | Add missing starting accounts to an existing database without reseeding |
| `npm run build:api` then `NODE_ENV=production npm run server:start` | Single-origin production deployment (Express serves `dist/`) |

**Real AI (Google Gemini):** create a key at https://aistudio.google.com/apikey, then in `server/.env` set
`GEMINI_API_KEY=...` (and optionally `GEMINI_MODEL`, default `gemini-3.6-flash`) and restart the server. All six AI
modes then run on Gemini through the server (`server/src/ai/gemini.ts`, official `@google/genai` SDK):
evidence is redacted first (`server/src/ai/redact.ts`), output is forced into a JSON schema and validated, each
analysis stores the model name and the exact redacted text sent (shown under "Data sent to the AI model"), and
results never change a finding's verification status. Without a key the server uses the labelled demo samples.
Free-tier note: Google states free-tier content may be used to improve its products, use test/synthetic data only.

**Database:** the current server uses SQLite through Prisma's `better-sqlite3` adapter. A MySQL deployment
requires changing the Prisma provider and replacing the adapter in `server/src/db.ts` before running database setup.

**What the backend enforces (not just the UI):** bcrypt-hashed passwords, hashed session tokens in httpOnly
cookies, login throttling, role permissions on every write, target authorization + scope re-checked on every
import/simulation, verification rules (notes, reason, evidence attestation), remediation rules (passed retest +
approval before *Resolved*), and an append-only activity log. Live target contact occurs only through the explicitly enabled automated assessment or scope detection routes.

### Automated assessment in API mode

Install Nmap and Docker on the dedicated assessment machine, pull `ghcr.io/zaproxy/zaproxy:stable`, and set `AIVERA_LIVE_SCANS_ENABLED=true` plus `AIVERA_ALLOWED_SCAN_HOSTS=<exact lab host>` in `server/.env`. Register only an approved lab target with explicit hosts, paths, exclusions, and an authorization reference. In **Scan Center → New assessment**, choose Nmap and/or OWASP ZAP with the Passive or Baseline profile, then select **Start Automated Assessment**. The API queues a background run, Nmap performs bounded TCP discovery, ZAP spiders inside a generated context with passive checks, and the server normalizes results into pending findings and evidence. Configured Gemini analysis automatically interprets the scan and drafts remediation for up to three findings. An assessor must still verify every finding.

Before another scan or tool import for the same target, decide every pending or needs-review finding. Each completed rescan stays in scan history; recurring alerts reuse the existing finding instead of adding another review row, while new alerts enter a new review batch. Deleting a target from its detail page removes its scan history and related assessment records so it can be registered again. For older databases, `npm run db:dedupe` previews repeated unreviewed rows and `npm run db:dedupe -- --apply` consolidates them; back up the database before applying it. Old finding links redirect to the retained record.

Three tools can run: Nmap, OWASP ZAP, and AIVERA's own HTTP and TLS inspector (one plain GET plus TLS handshakes; it checks security headers, cookie flags, certificate validity and expiry, and whether TLS 1.0 or 1.1 is still accepted). Each tool needs its own permission in the target's scope. The Docker and Nmap executables are not bundled. See [the authorized target lab plan](docs/Authorized-Target-Lab.md) before a live demonstration.

**Scan profiles.** Passive and Baseline only observe. **Standard is the active profile**: ZAP sends attack payloads after spidering. The server allows it only when the target is a loopback copy (127.0.0.1, localhost or ::1) *and* the scope allows "Active scanning (local lab copy only)". A hosted site can never get an active scan. ZAP never submits POST forms in any profile.

**Signed-in scans.** On a target's page, **Signed-in scans** stores a test-account session (for example the `Cookie` header after signing in with a test account). The value is encrypted with AES-256-GCM using `AIVERA_SECRET_KEY` (created in `server/.env` on first use), is never returned by the API, and is never logged. A run marked "Scan as the test account" sends it on every request and skips logout links. The scope must allow "Authenticated testing with provided test accounts". Use a test account only, never a real person's.

**Scan worker and egress rules.** Each tool runs in a separate Node process (`server/src/scanWorker.ts`) that gets no database URL, AI keys, audit key or credential key, and can only hand its output back to the API process, which re-checks scope before storing anything. Before a tool runs, the worker checks that the host is on `AIVERA_ALLOWED_SCAN_HOSTS` and that an approved host *name* resolves only to public addresses, so DNS can't redirect a scan to this machine, the local network or a cloud metadata address. This is process isolation, not a network sandbox: the operating system does not stop the worker from opening other connections. For network-level isolation, run the worker in a container or VM whose firewall only allows the approved hosts.

**Tamper-evident activity log.** Every activity entry is sealed into an HMAC-SHA256 hash chain (key `AIVERA_AUDIT_KEY` in `server/.env`), with an anchor file next to the database. **Activity → Log integrity** re-checks the chain and reports an edited, deleted or truncated entry. This is tamper evidence, not prevention: someone with both the database and `server/.env` could forge a new chain.

> Keep `node_modules` out of OneDrive sync (or move the project outside OneDrive). OneDrive file locks can
> corrupt installs (`ENOTEMPTY` errors).

---

## Tech stack

React 19 + TypeScript (strict) · Vite 7 · Tailwind CSS 4 · shadcn/ui-style components on Radix (`radix-ui`) ·
Lucide icons · React Router 7 · Recharts 3 · Zustand 5 (+ persist) · React Hook Form + Zod ·
TanStack Table 8 · date-fns 4 · Sonner · jsPDF + jspdf-autotable (client-side PDF) · Inter / JetBrains Mono (self-hosted via Fontsource).

---

## End-to-end demo script (all steps share one state store)

1. Open AIVERA → `/login`, choose **Jordan Kim (Security Assessor)**.
2. **Dashboard**: metrics computed from state (only *Confirmed* findings count as vulnerabilities).
3. **Projects → New project**: validated multi-section form → project detail page.
4. **Register target** (from the project), URL is syntax-validated only and **never contacted**; the
   "I confirm that this application is authorized…" checkbox is required; scope (hosts, allowed/excluded paths,
   categories, allowed/restricted activities) is defined in the same form. Use **Add &lt;host&gt; to scope**.
5. On the target page: **Edit scope** to add an exclusion; review the scope visualization.
6. **Configure demo scan** → 6-step wizard (project → authorized target → confirm scope → tools → configuration → review).
   **Start Automated Assessment** is available in API mode when the live scan gate and tool prerequisites are configured. Otherwise click **Run Demo Simulation**.
7. Watch the progress (labelled **SIMULATED**). Findings appear when it completes (toast → *View findings*).
8. Open a finding → **AI Analysis** tab → *Generate sample analysis* ("Sample AI Analysis, Demo Mode").
9. **Technical Evidence** tab → review / mark evidence reviewed.
10. **Confirm** (notes + reason + evidence attestation + second confirmation) or **Reject**.
11. Back on the **Dashboard**: confirmed / critical / pending counts update.
12. **Risk & Remediation** tab → **Create task** → **Remediation Tracking**: Start work → Request retest →
    Record retest passed → **Approve & resolve** (resolution is blocked until a passed retest + manual approval).
13. **Reports → Create report**: 7-step wizard → preview → **Generate** → **Download PDF** (real PDF, watermarked "DEMO DATA").

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
- **Persistence:** `localStorage` key `aegis-demo-state`, versioned by `SEED_VERSION`, a version bump re-seeds.
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
  A *Load synthetic sample* button provides fictional reports for demos. In API mode, the separate automated assessment path can launch Nmap and a containerized ZAP passive run.
- **Manual findings**: *Record manual finding* (Findings page) and *Record finding* on checklist items
  (Vulnerability Assessment). Requires evidence; links the finding code back to the checklist item and marks it failed.
- **Manual evidence notes** on any finding (Evidence tab → *Add evidence note*).
- **Remediation task editing** (title, description, recommendation, owner, priority, due date, retest requirement).
  Status still changes only through the workflow actions.
- **Settings that now take effect**: date format and timezone apply to every displayed date (calendar dates don't shift);
  overdue remediation tasks raise one notification each when "Remediation due dates" is on; the idle lock signs out of the
  demo persona after inactivity (Off / 5 to 60 min).
- The demo AI adapter states plainly when no sample exists (imported/manual findings) and only echoes recorded fields.

### Implementation status

| Module | Status |
|---|---|
| App shell, navigation, search, notifications, themes, demo login/roles | Complete (frontend) |
| Dashboard, Security Analytics | Complete, all numbers derived from state |
| Projects, Targets & Scope | Complete |
| Reconnaissance | Complete, sample bundles + Nmap XML import |
| Scan Center | Simulation and file import; API mode has an opt-in runner (Nmap, ZAP passive or local-only active, HTTP/TLS inspector, optional signed-in session) in a separate worker process |
| Vulnerability Assessment | Complete, guided checklists, manual findings |
| Findings & Evidence, Verification | Complete, incl. manual evidence |
| AI Security Analyst | Demo samples in browser mode; server-side Gemini when configured |
| Risk, Remediation | Complete |
| Reports (preview, print, PDF) | Complete; provenance notice and watermark depend on selected data |
| Activity, Users, Integrations, Settings | Complete (integrations honestly show Not Connected) |
| Backend, real auth, LLM gateway | Implemented in API mode; automated tool runner is opt-in; activity log is tamper-evident |

## Demo-only (clearly labelled in the UI)

- **Login & roles**: personas, client-side guards and permissions are UI demonstrations, not security.
- **Scans in demo mode**: "Run Demo Simulation" fabricates clearly labelled SIMULATED records. API mode has a separate opt-in passive assessment path.
- **Reconnaissance in demo mode**: sample bundles only. API mode has scope detection and an opt-in Nmap adapter.
- **AI in demo mode**: deterministic samples. API mode calls Gemini when configured.
- **Integrations**: the integration cards do not certify installed external tools; check the assessment prerequisites separately.
- **Activity log in demo mode**: stored in localStorage and not tamper-evident. API mode seals every entry into a verifiable hash chain.
- **Reports**: simulated and synthetic data are explicitly marked. Imported output retains a provenance warning.

The browser never launches tools or stores model secrets. API mode can contact an authorized target only through scope detection or an explicitly enabled automated assessment.

---

## Backend integration points

- `src/services/api/contracts.ts`: documented REST routes (`API_ROUTES`) and `DATA_MODE` switch (`VITE_DATA_MODE`).
- `src/services/index.ts`: typed services (`projectService`, `targetService`, `scanService`, `reconService`,
  `findingService`, `verificationService`, `analysisService`, `riskService`, `remediationService`, `reportService`,
  `userService`, `settingsService`). Swap each demo implementation for an API call with the same signature.
- `src/services/ai/aiService.ts`: `AIAdapter` interface for demo samples; API mode uses the server-side Gemini route.
- `scanService.startRealAssessment()`: queues the opt-in automated assessment through the API.
- `automationService`: saves or removes a target's encrypted test-account session (write-only).

The backend authenticates users, authorizes actions, and checks target scope before each tool. Each tool runs in a separate worker process without server secrets, after an egress check. For shared deployment, run that worker in a container or VM with a firewall that only allows approved hosts, and add durable queue recovery.

## Remaining work (next phases)

**Scheduled scans** (repeat a scan daily, weekly or monthly; skip and notify while findings still need review), network-level worker isolation (a container or VM with a firewall, beyond today's process isolation and egress checks), form-based login for signed-in scans (today a session is pasted in), more non-web adapters (for example DNS and mail configuration), durable queue recovery, server-side PDF storage, and end-to-end tests against an approved lab target. The final submission also needs real assessment evidence, a completed report, a deployed demonstration, and member-specific oral preparation.
