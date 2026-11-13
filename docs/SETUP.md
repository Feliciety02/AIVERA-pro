# AIVERA setup and run guide

Everything needed to install, configure and run AIVERA, from a fresh computer to a live scan.
The short version is in [Quick start](#2-quick-start). The rest explains each part.

Commands are written for **Windows PowerShell**, which this project was built on. On macOS or Linux, use `cp` instead of `copy` and `/` instead of `\`.

---

## Contents

1. [What you need](#1-what-you-need)
2. [Quick start](#2-quick-start)
3. [First-time setup, step by step](#3-first-time-setup-step-by-step)
4. [Running it every day](#4-running-it-every-day)
5. [Settings reference (`server/.env`)](#5-settings-reference-serverenv)
6. [AI providers](#6-ai-providers)
7. [Live scanning](#7-live-scanning)
8. [The two UMERCH3.0 targets](#8-the-two-umerch30-targets)
9. [Checks before a demo or a commit](#9-checks-before-a-demo-or-a-commit)
10. [Data: backups, reset, audit log](#10-data-backups-reset-audit-log)
11. [Production-style run](#11-production-style-run)
12. [Troubleshooting](#12-troubleshooting)
13. [Where things are](#13-where-things-are)

---

## 1. What you need

### Required

| Software | Version | Why |
|---|---|---|
| **Node.js** | 22 or newer (tested on 24) | Runs the web app and the API server. The server loads `server/.env` with `process.loadEnvFile`, which needs Node 21.7+, and Prisma 7 needs 20.19+. |
| **npm** | comes with Node | Installs packages and runs the scripts. |
| **Git** | any recent | To get and update the code. |

The database is **SQLite**. It is a single file (`server/prisma/dev.db`), so there is nothing extra to install.

### Optional, depending on what you want to show

| Software | Needed for | Notes |
|---|---|---|
| **Nmap** | Port and service discovery scans | Windows installer from nmap.org. If it is not on PATH, set `AIVERA_NMAP_PATH`. |
| **OWASP ZAP** | Web vulnerability scans (passive, and active on the local copy) | Install ZAP from zaproxy.org. It includes its own Java. Point `AIVERA_ZAP_PATH` at the install folder. Docker with the `ghcr.io/zaproxy/zaproxy:stable` image also works when `AIVERA_ZAP_PATH` is empty. |
| **Google Gemini API key** | Real AI analysis | Free key at https://aistudio.google.com/apikey. |
| **Groq API key** | Second AI provider when Gemini is busy | Free tier at https://console.groq.com. |
| **Ollama** | Third AI provider, runs on your PC | https://ollama.com, then `ollama pull <model>`. |
| **PHP, Composer, Node** | Running the local UMERCH3.0 copy | Follow UMERCH3.0's own README. It must answer at `http://127.0.0.1:8000`. |

Without any optional software, AIVERA still runs: you can register websites, import tool output, review findings, track remediation and make reports. AI then uses clearly labelled sample text.

---

## 2. Quick start

From the project folder:

```powershell
npm install
copy server\.env.example server\.env
npm run db:setup
npm run dev:full
```

Open **http://localhost:5173** and sign in as `admin@aivera.local`. The password is whatever `SEED_DEMO_PASSWORD` is set to in `server/.env`.

---

## 3. First-time setup, step by step

### 3.1 Get the code and install packages

```powershell
git clone <repository url>
cd "Vulnerability Tester"
npm install
```

`npm install` also runs `prisma generate`, which builds the database client.

> **OneDrive warning.** OneDrive can lock files inside `node_modules` while npm is writing them, which shows up as `ENOTEMPTY` or `EPERM` errors. If that happens, pause OneDrive syncing during `npm install`, or keep the project outside OneDrive.

### 3.2 Create the server settings file

```powershell
copy server\.env.example server\.env
```

Open `server\.env` and at least:

- set `SEED_DEMO_PASSWORD` to a password of your choice (used for the seeded accounts);
- add `GEMINI_API_KEY` if you have one (see [AI providers](#6-ai-providers)).

Leave everything else as it is for now. `server/.env` is git-ignored. Never commit it, never paste its keys into chat, and never put a key in a variable starting with `VITE_` (those are sent to the browser).

### 3.3 Create the database

```powershell
npm run db:setup
```

This creates the tables (`prisma db push`) and loads the starting data (`npm run db:seed`): one account per role, the UMERCH3.0 project and its target.

| Account | Role | Can do |
|---|---|---|
| `admin@aivera.local` | Administrator | Users, roles, settings, integrations. Sees every project and can step in anywhere |
| `lead@aivera.local` | Security Lead | Creates projects, marks websites authorized, signs off critical and high findings, approves closing fixes and final reports |
| `assessor@aivera.local` | Security Assessor | Scans, verifies findings, retests fixes, drafts reports |
| `developer@aivera.local` | Remediation Owner | Sees only their fix tasks, marks them ready for retest |
| `viewer@aivera.local` | Viewer | Reads dashboards and approved reports |

All use the `SEED_DEMO_PASSWORD` from `server/.env`. New people can sign up from the sign-in page; an administrator then activates them on the **Users** page. People only see the projects they are on.

**Already have a database from before the team roles?** Don't reseed. Run `npm run db:accounts` instead (back up first). It adds any missing starting account (the lead and developer), and puts the starting team on every project that has no lead yet. Nothing else changes, and running it twice is safe.

**What happens automatically**

| When | What AIVERA does |
|---|---|
| A scan or import finishes | New findings go to the project's assessor with the fewest open reviews, who is notified |
| An assessor adds a website | It waits as "pending" and the lead is asked to check the owner's permission |
| A finding is confirmed | A fix task is created for the project's remediation owner, due in 7 / 14 / 30 / 90 / 180 days (critical to info) |
| A critical or high finding is confirmed | The project lead is asked to sign it off (never the person who confirmed it) |
| The developer marks a fix ready | The assessor who confirmed the finding is asked to retest it |
| A retest passes | The lead is asked to approve closing the fix. A failed retest goes back to the developer |
| A fix is overdue | The owner is reminded, then the lead after 3 more days |
| Every finding in a project is reviewed | The assessors are prompted to draft the report |
| A report is submitted | A lead who did not write it approves it as final or sends it back with a note |
| Someone is suspended or changes role | Their open reviews, fixes and lead duties move to others on the project |

Each person's waiting work is on the **My work** page, with a count in the menu.

> `db:seed` **replaces** the data in the database. Run it only on a new database, or after making a backup (see [section 10](#10-data-backups-reset-audit-log)).

### 3.4 Start AIVERA

```powershell
npm run dev:full
```

This starts two things side by side:

| Part | Address | What it is |
|---|---|---|
| API server | http://localhost:4000/api | Express + Prisma. Reloads by itself when a server file changes. |
| Web app | http://localhost:5173 | React app. Sends `/api` requests to the server. |

Open http://localhost:5173. If port 5173 is busy, Vite picks the next free one and prints it.

---

## 4. Running it every day

Start things in this order, each in its own terminal:

1. **UMERCH3.0 local copy** (only if you will scan it): start it the way its README says, then check that http://127.0.0.1:8000 opens.
2. **Ollama** (only if you use it as an AI fallback):
   ```powershell
   ollama serve
   ```
3. **AIVERA**:
   ```powershell
   npm run dev:full
   ```

To stop, press `Ctrl+C` in each terminal.

### Other ways to run

| Command | Use it when |
|---|---|
| `npm run dev:full` | Normal development: API (auto-reload) + web app. |
| `npm run server:start` | API **without** auto-reload. Use this when you will run long scans, see the note below. |
| `npm run server:dev` | API with auto-reload only. |
| `npm run dev` or `npm run dev:api` | Web app only, in full-app mode. Needs the API running. |
| `npm run dev:demo` | Browser-only demo with synthetic data, no server, no database. |

> **Long scans and auto-reload.** In `dev:full` the API restarts whenever a file under `server/` is saved. A restart stops any scan that is running. AIVERA then marks it **Interrupted** and sends a notification, and you can start it again. If you plan to edit code while a scan runs, start the API with `npm run server:start` and the web app with `npm run dev` instead.

---

## 5. Settings reference (`server/.env`)

Restart the API after changing this file.

### Core

| Setting | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite file, relative to `server/prisma/`. Required. |
| `PORT` | `4000` | API port. The web app expects 4000 (see `vite.config.ts`). |
| `NODE_ENV` | `development` | `production` makes the API also serve the built web app. |
| `SESSION_TTL_HOURS` | `8` | How long a sign-in lasts. |
| `SEED_DEMO_PASSWORD` | example value | Password for the seeded accounts. Change it before sharing the app. |
| `AIVERA_APP_URL` | `http://localhost:5173` | Only used for the help page shown when someone opens the API port in a browser. |

### AI

| Setting | Meaning |
|---|---|
| `GEMINI_API_KEY` | Google Gemini key. Empty means labelled sample text instead of real AI. |
| `GEMINI_MODEL` | Main Gemini model. |
| `GEMINI_FALLBACK_MODELS` | Other Gemini models to try, comma separated, when the main one is busy. |
| `AI_FALLBACK_NAME`, `_BASE_URL`, `_API_KEY`, `_MODEL`, `_TIMEOUT_MS` | Second provider (any OpenAI-compatible API, for example Groq). |
| `AI_FALLBACK_2_...`, `AI_FALLBACK_3_...` | Third and fourth providers (for example Ollama). Same fields. |
| `AI_COOLDOWN_SECONDS` | How long a busy provider rests before AIVERA tries it first again. Default 60. |

### Live scanning

| Setting | Meaning |
|---|---|
| `AIVERA_LIVE_SCANS_ENABLED` | `true` to allow real scans. `false` blocks them all. |
| `AIVERA_ALLOWED_SCAN_HOSTS` | Exact hosts the server may contact, comma separated. Nothing else can be scanned. |
| `AIVERA_NMAP_PATH` | Full path to `nmap.exe` if it is not on PATH. Use forward slashes. |
| `AIVERA_ZAP_PATH` | ZAP install folder (the one with `zap-<version>.jar`). Empty means use Docker. |
| `AIVERA_JAVA_PATH` | Java to run ZAP with, only if ZAP's own Java is missing. |

### Secrets created by the server

| Setting | Meaning |
|---|---|
| `AIVERA_AUDIT_KEY` | Seals the activity log into a tamper-evident chain. Created on first start. |
| `AIVERA_SECRET_KEY` | Encrypts saved test-account sessions. Created the first time one is saved. |

Do not edit or share these two. A changed audit key makes every older activity entry fail verification. A changed secret key makes saved sessions unreadable (save them again).

---

## 6. AI providers

AIVERA tries providers in order and moves to the next one when a provider is busy or out of quota: **Gemini, then Groq, then Ollama**. A busy provider rests for `AI_COOLDOWN_SECONDS`, then AIVERA goes back to it first. The **Integrations** page shows which providers are ready or resting.

**Gemini.** Create a key at https://aistudio.google.com/apikey and set `GEMINI_API_KEY`.

**Groq** (second):

```ini
AI_FALLBACK_NAME=Groq
AI_FALLBACK_BASE_URL=https://api.groq.com/openai/v1
AI_FALLBACK_API_KEY=<your Groq key>
AI_FALLBACK_MODEL=<a model name from Groq's model list>
```

**Ollama** (third, runs on your PC, nothing leaves it):

```powershell
ollama pull <model>
ollama serve
```

```ini
AI_FALLBACK_2_NAME=Ollama
AI_FALLBACK_2_BASE_URL=http://localhost:11434/v1
AI_FALLBACK_2_MODEL=<the model you pulled>
AI_FALLBACK_2_TIMEOUT_MS=150000
```

What is sent to an AI provider: secrets in evidence are redacted first, and each analysis stores exactly what was sent (shown under "Data sent to the AI model"). AI never confirms or rejects a finding; a person always decides. Free tiers may use what you send to improve their products, so use test data only.

---

## 7. Live scanning

Live scans contact real websites. Only scan websites you own or have written permission to test.

### 7.1 Turn it on

In `server/.env`:

```ini
AIVERA_LIVE_SCANS_ENABLED=true
AIVERA_ALLOWED_SCAN_HOSTS=127.0.0.1,umerch3-0-r74e.onrender.com
AIVERA_NMAP_PATH=C:/Program Files (x86)/Nmap/nmap.exe
AIVERA_ZAP_PATH=C:/Program Files/ZAP/Zed Attack Proxy
```

Adjust the two paths to where Nmap and ZAP are installed on your computer, then restart the API.

### 7.2 What each website needs

A scan only starts when **all** of these are true. The app explains which one is missing.

1. The website is **authorized**: the owner's permission is recorded and confirmed on its page.
2. It belongs to a **project** (new websites get their own project automatically).
3. Its host is in the website's **in-scope hosts** and in `AIVERA_ALLOWED_SCAN_HOSTS`.
4. Its scope **allows the tool**:

| Tool | Scope activity to tick |
|---|---|
| Nmap | Port and service discovery |
| OWASP ZAP | Automated web scanning (rate-limited) |
| HTTP and TLS inspector | Security header review |
| Signed-in scan | Authenticated testing with provided test accounts |
| Active profile (Standard) | Active scanning (local lab copy only) |

5. No other scan is running for it, and **every finding from the last scan has been reviewed**.

### 7.3 Tools and profiles

| Tool | What it does |
|---|---|
| **Nmap** | Checks only the approved ports (80, 443 and the site's own port) and identifies services. |
| **OWASP ZAP** | Crawls the approved paths for about a minute, then checks responses. It never submits forms. |
| **HTTP and TLS inspector** | One normal page request plus a few TLS handshakes: security headers, cookie flags, certificate validity and expiry, and whether TLS 1.0 or 1.1 is still accepted. Safe for hosted sites. |

| Profile | Sends attacks? | Allowed on |
|---|---|---|
| Passive, Baseline | No | Any approved website |
| **Standard (active)** | **Yes**, ZAP attack payloads | **Only** a copy on this computer (127.0.0.1, localhost) with "Active scanning (local lab copy only)" ticked |
| Thorough | | Not available for automated runs |

### 7.4 Signed-in scans

To scan pages behind a login:

1. Sign in to the website **with a test account**, never a real person's.
2. In the browser's developer tools (Application, then Cookies), copy the session cookie(s), written as `name=value; other=value`.
3. On the website's page in AIVERA, under **Signed-in scans**, choose **Add session**. Keep the header as `Cookie` and paste the value.
4. In **New assessment**, tick **Scan as the test account**.

The value is encrypted on the server and never shown again. Scans skip logout links so the session stays valid. When the session expires, save a new one.

### 7.5 How a scan runs

- Each tool runs in a **separate worker process** that has no database access and none of the server's keys.
- Before it starts, the worker checks the host is on the allowlist and that an approved host name points to a public address, not your PC or local network.
- Findings arrive as **Pending Verification**. AI explains them if configured.
- You get a **notification** (bell icon, plus a pop-up on any page) when a scan finishes, finds nothing new, fails, is stopped because the scope changed, or is interrupted by a server restart.

---

## 8. The two UMERCH3.0 targets

| Target | Address | Allowed |
|---|---|---|
| UMERCH3.0 (local) | http://127.0.0.1:8000 | Nmap, ZAP passive, inspector, and active (Standard) once its scope ticks "Active scanning (local lab copy only)" |
| Umerch3-0-r74e (deployed) | https://umerch3-0-r74e.onrender.com | ZAP passive and the inspector only. **No Nmap and no active scans**: Render's servers are shared with other customers. |

The deployed site is on Render's free tier, which sleeps when idle. The first request after a while can take up to a minute. Open the site in a browser first to wake it.

---

## 9. Checks before a demo or a commit

```powershell
npm run typecheck        # web app and server types
npm run test:scan-scope  # scan safety tests (scope, egress, worker, inspector, encryption)
npm run build:api        # production build of the web app
npm audit                # known vulnerabilities in packages
```

All four should finish without errors.

---

## 10. Data: backups, reset, audit log

**Back up** before anything that changes the database (schema changes, `db:seed`, `db:dedupe -- --apply`):

```powershell
copy server\prisma\dev.db server\prisma\backups\dev-backup.db
```

`server/prisma/backups/` is git-ignored. To restore, stop the API and copy the backup back over `dev.db`.

**Reset to the starting data** (deletes everything else):

```powershell
npm run db:seed
```

**Schema changed** (after pulling new code that edits `server/prisma/schema.prisma`):

```powershell
npm run db:push
npm run db:generate
```

If `db:push` needs to drop data, Prisma stops and asks for confirmation. Back up first.

**Repeated findings in an older database:**

```powershell
npm run db:dedupe              # preview
npm run db:dedupe -- --apply   # apply (back up first)
```

**Activity log integrity.** Every activity entry is sealed into a hash chain. **Activity** shows a "Log integrity" check, which reports an edited, deleted or cut-off entry. The chain relies on `AIVERA_AUDIT_KEY` and on the anchor file `server/prisma/dev.db.audit-anchor.json`. Keep both with the database when you copy or move it.

---

## 11. Production-style run

One server serves both the API and the built web app:

```powershell
npm run build:api
$env:NODE_ENV="production"; npm run server:start
```

Then open http://localhost:4000. Before sharing it with anyone: set a strong `SEED_DEMO_PASSWORD`, change the seeded accounts' passwords, serve it over HTTPS, and keep `AIVERA_LIVE_SCANS_ENABLED=false` unless the machine is a dedicated, authorized assessment host.

---

## 12. Troubleshooting

| Problem | Fix |
|---|---|
| `DATABASE_URL is not set` | `server/.env` is missing. Do [step 3.2](#32-create-the-server-settings-file). |
| "Cannot reach the AIVERA server" in the app | The API is not running. Start `npm run dev:full` (or `npm run server:start`). |
| `EADDRINUSE: 4000` | Another API is already running. Close it, or find it with `netstat -ano \| findstr :4000` and end that process in Task Manager. |
| Sign-in fails for seeded accounts | Check `SEED_DEMO_PASSWORD` in `server/.env`. If you changed it after seeding, the old one still applies until you run `npm run db:seed` again (this resets data). |
| A new account cannot sign in | An administrator must activate it on **Users**. |
| Scan stuck at "Running" | The API restarted mid-scan. Restarting the API marks it Interrupted. See the note in [section 4](#4-running-it-every-day). |
| "Review N pending findings before scanning again" | Confirm or reject each finding from the last scan, then scan again. |
| "Live scanning is turned off" | Set `AIVERA_LIVE_SCANS_ENABLED=true` and restart the API. |
| "not on the live scan allowlist" | Add the exact host to `AIVERA_ALLOWED_SCAN_HOSTS` and restart. |
| "resolves to an internal address" | The approved host name points to your PC or local network. Approve the IP address itself (for example `127.0.0.1`) if that is intended. |
| `nmap could not start` | Install Nmap or set `AIVERA_NMAP_PATH`. |
| `No zap-<version>.jar found` | `AIVERA_ZAP_PATH` must be ZAP's install folder. |
| Deployed site scan times out | Render was asleep. Open the site in a browser, wait for it to load, then scan again. |
| Signed-in scan finds only login pages | The saved session expired. Sign in again and save a new session. |
| AI says it used sample text | No AI key is set, or every provider is busy. Check **Integrations**. |
| `npx` not found in Git Bash | Run npm and npx commands in PowerShell. |
| `ENOTEMPTY` / `EPERM` during `npm install` | OneDrive lock. Pause syncing, delete `node_modules`, run `npm install` again. |

---

## 13. Where things are

```
src/                      React web app
  pages/                  One folder per screen (targets, scans, findings, reports, ...)
  components/             Shared UI, forms, security widgets, layout
  services/               Calls to the API (and the demo-mode implementation)
  features/               Shared logic: scan permissions, imports, scope rules
server/
  .env.example            Settings template (copy to server/.env)
  prisma/schema.prisma    Database tables
  prisma/dev.db           The SQLite database (git-ignored)
  src/index.ts            API entry point
  src/routes/             API routes (core, security/scans, workflow, signed-in sessions)
  src/automatedAssessment.ts  Nmap and ZAP adapters
  src/inspector.ts        HTTP and TLS inspector
  src/scanWorker.ts       Separate process that runs one tool
  src/egress.ts           Which hosts a scan may contact
  src/auditChain.ts       Tamper-evident activity log
  src/secretBox.ts        Encryption for saved sessions
  src/ai/                 Gemini and fallback providers, redaction
docs/
  SETUP.md                This guide
  System-Design.md        Architecture and design decisions
  Authorized-Target-Lab.md  Rules for testing a target
```
