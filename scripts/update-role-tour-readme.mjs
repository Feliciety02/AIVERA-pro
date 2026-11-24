/** Build the root README tour and capture archive from the screenshot manifest. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const archive = "docs/screenshots/role-tour-2026-11-16";
const { images, capturedOn, mode, viewport } = JSON.parse(
  await readFile(resolve(archive, "manifest.json"), "utf8"),
);
const roles = [
  ["Public", "Public pages", "Visitors can explore AIVERA and reach the account entry points."],
  ["Administrator", "Administrator", "Administrators oversee access, projects, assessments, settings, and reports."],
  ["Security Lead", "Security Lead", "Leads coordinate reviews, approvals, and final reports."],
  ["Security Assessor", "Security Assessor", "Assessors run authorized tests and verify findings against evidence."],
  ["Remediation Owner", "Remediation Owner", "Fix owners track assigned work and request retests."],
  ["Viewer", "Viewer", "Viewers follow project status and read available results."],
];

const screenDescriptions = {
  "Landing page": "Platform introduction",
  "Sign in": "Account access",
  "Create account": "New account request",
  "My work": "Work and activity overview",
  "Security Analytics": "Assessment trends and metrics",
  Projects: "Assessment projects",
  "Target Management": "Authorized targets and scope",
  Reconnaissance: "Hosts, services, and endpoints",
  "Scan Center": "Scan status and history",
  "Vulnerability Assessment": "Guided security checks",
  "AI Security Analyst": "AI-assisted evidence review",
  "Findings & Evidence": "Findings and supporting proof",
  "Risk Management": "Risk register and priorities",
  "Remediation Tracking": "Fixes and retest progress",
  Reports: "Assessment reports",
  "Activity Logs": "Recorded activity",
  "User Management": "Accounts and roles",
  Integrations: "Tool connection status",
  Settings: "App preferences",
};

const dashboardDescriptions = {
  Administrator: "Platform overview",
  "Security Lead": "Review and approval overview",
  "Security Assessor": "Assessment overview",
  "Remediation Owner": "Assigned fixes overview",
  Viewer: "Read-only project overview",
};

function esc(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

const sections = roles.map(([role, heading, description]) => {
  const entries = images.filter((image) => image.role === role);
  const rows = [];
  for (let i = 0; i < entries.length; i += 2) {
    const cells = entries.slice(i, i + 2).map((item, offset) => {
      const path = `${archive}/${item.file}`;
      const caption = item.label === "Dashboard" ? dashboardDescriptions[role] : screenDescriptions[item.label];
      const alt = `${role} — ${item.label} screen in AIVERA`;
      return `    <td align="center" width="50%"><a href="${path}"><img src="${path}" width="510" alt="${esc(alt)}"></a><br><strong>${i + offset + 1} · ${esc(item.label)}</strong><br><sub>${esc(caption ?? item.label)}</sub></td>`;
    });
    rows.push(`  <tr>\n${cells.join("\n")}\n  </tr>`);
  }
  return `### ${heading}\n\n${description}\n\n<table>\n${rows.join("\n")}\n</table>`;
});

const date = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
  .format(new Date(`${capturedOn}T00:00:00Z`));
const readme = `<p align="center">
  <img src="docs/readme/banner.svg" width="1200" alt="AIVERA Pro logo and name with a PRO badge and a minimal scope radar of the authorized local target">
</p>

<h1 align="center">AIVERA Pro</h1>

<p align="center">The team edition of AIVERA: an intelligent web security assessment and vulnerability management app for authorized projects, evidence review, remediation, and reporting across five roles.</p>

<p align="center"><code>PRO edition</code> &nbsp; <code>Version 0.1.0</code> &nbsp; <code>React 19 + Vite 7</code> &nbsp; <code>Express + Prisma + SQLite</code> &nbsp; <code>Five team roles</code></p>

<p align="center">
  <a href="#run-locally"><img src="docs/readme/run-button.svg" width="216" alt="Run locally"></a>
  <br>
  <sub>Explore the browser demo with synthetic data, or run API mode against an authorized lab target.</sub>
</p>

<p align="center">
  <a href="#at-a-glance"><strong>At a glance</strong></a> &nbsp;·&nbsp;
  <a href="#app-tour"><strong>App tour</strong></a> &nbsp;·&nbsp;
  <a href="#roles"><strong>Roles</strong></a> &nbsp;·&nbsp;
  <a href="#how-it-works"><strong>How it works</strong></a> &nbsp;·&nbsp;
  <a href="#run-locally"><strong>Run locally</strong></a> &nbsp;·&nbsp;
  <a href="#explore-the-repository"><strong>Explore the repository</strong></a>
</p>

<p align="center"><sub><strong>PRO</strong> · team roles, remediation, retests, and approvals &nbsp;|&nbsp; Need a single-user scanner? See <a href="https://github.com/Feliciety02/AIVERA-lite"><strong>AIVERA Lite</strong></a></sub></p>

The browser demo uses synthetic data. API mode stores projects and findings in SQLite, enforces role and scope checks, and can run explicitly enabled assessments on an authorized lab target. AI assists with interpretation; a person confirms or rejects each finding.

## At a glance

<table>
  <tr>
    <td align="center" width="25%"><strong>01 · Scope</strong><br><sub>Projects, authorized targets, boundaries</sub></td>
    <td align="center" width="25%"><strong>02 · Assess</strong><br><sub>Recon, scans, checklists, tool output</sub></td>
    <td align="center" width="25%"><strong>03 · Verify</strong><br><sub>Evidence, human decisions, risk</sub></td>
    <td align="center" width="25%"><strong>04 · Resolve</strong><br><sub>Fixes, retests, approvals, reports</sub></td>
  </tr>
</table>

## App tour

These **${images.length} unedited ${viewport.replace("x", " × ")} screenshots** show the public pages and the main menu screens for all five demo roles, captured in Microsoft Edge on **${date}**. They use **${mode}**; empty states reflect the seeded demo data. Select an image to open it at full size. The [capture archive](${archive}/README.md) lists routes, capture details, and file hashes.

${sections.join("\n\n")}

## Roles

| Role | Main work |
| --- | --- |
| **Administrator** | Manage access, settings, projects, assessments, and system oversight |
| **Security Lead** | Coordinate assessments and approve high-impact findings, fixes, and final reports |
| **Security Assessor** | Run authorized assessments, review evidence, verify findings, and draft reports |
| **Remediation Owner** | Work assigned fixes and request retests |
| **Viewer** | Read project status and available results |

## How it works

Each assessment passes work between the five roles. The branches show what happens when an assessor rejects a finding, when a fix fails retesting, and when a critical or high finding needs lead sign-off.

\`\`\`mermaid
flowchart TD
    A["Administrator<br/>Activates accounts, manages roles, and oversees projects"]
    L1["Security Lead<br/>Creates the project and approves target authorization"]
    S1["Security Assessor<br/>Assesses the target and reviews evidence"]
    D{"Assessor decision"}
    X["Rejected finding<br/>Decision logged; no fix task"]
    C["Confirmed finding<br/>Risk record and fix task created"]
    Q["Review queue complete<br/>Every finding has a human decision"]
    H["Security Lead<br/>Signs off critical or high findings"]
    R["Remediation Owner<br/>Works the assigned fix and requests a retest"]
    S2["Security Assessor<br/>Retests the fix and records the result"]
    P{"Retest passed?"}
    L2["Security Lead<br/>Approves closing the fix"]
    RP["Security Assessor<br/>Drafts report after findings are reviewed"]
    L3["Security Lead<br/>Approves the final report"]
    V["Viewer<br/>Follows project status and reads approved reports"]
    A -->|Team access| L1
    L1 -->|Authorized work| S1
    S1 --> D
    D -->|Rejected| X
    D -->|Confirmed| C
    X --> Q
    C --> Q
    C -->|Fix task| R
    C -.->|Critical or high| H
    R -->|Ready for retest| S2
    S2 --> P
    P -->|Failed| R
    P -->|Passed| L2
    Q --> RP
    RP --> L3
    L2 -.->|Closure status| V
    L3 -->|Approved results| V
\`\`\`

- **Administrator → team:** Activates accounts, controls roles and settings, and can oversee any project. The administrator makes it possible for the assigned team to work together.
- **Security Lead → Security Assessor:** Sets up the project team and checks that a target is authorized before testing. The lead also signs off critical and high findings after an assessor confirms them.
- **Security Assessor → decision:** Runs authorized checks or imports tool output, reviews evidence, and confirms or rejects each finding. A rejection is logged without creating a fix task. A confirmation creates a risk record and a task for the remediation owner. AI can help interpret evidence but cannot verify a finding.
- **Remediation Owner → Security Assessor:** Works the assigned fix and marks it ready for retest. If the retest fails, the task returns to the owner for more work.
- **Security Assessor → Security Lead:** Records retest results and drafts the assessment report when all findings have been reviewed. Reporting can proceed while fix tasks continue. A passed retest goes to the lead for closure approval; the lead also approves the final report. Critical and high confirmed findings need a separate lead sign-off.
- **Security Lead → Viewer:** Makes approved results available. Viewers can follow project status during the work and read approved reports, but cannot change the assessment.

Dashed paths show the additional lead sign-off and updates to the viewer. A failed retest loops back to the fix owner; a rejected finding creates no fix task and is excluded from verified report findings. Administrators can step in throughout, and viewers can follow status while work progresses. The browser demo uses synthetic local data; API mode enforces roles and scope on the server and stores records in SQLite. See the [system design](docs/System-Design.md) for the full workflow.

## Run locally

You need **Node.js 22 or newer** and npm. SQLite is bundled through the app dependencies. For the full API mode, set a password of your choice as \`SEED_DEMO_PASSWORD\` in \`server/.env\` before seeding a **fresh development database**:

\`\`\`powershell
npm install
Copy-Item server/.env.example server/.env
# Set SEED_DEMO_PASSWORD in server/.env
npm run db:setup
npm run dev:full
\`\`\`

Open **http://localhost:5173**. Sign in as \`admin@aivera.local\` with the password you set. The API runs at \`http://localhost:4000/api\`. \`db:setup\` loads starting data only into a new, empty database; on an existing one it leaves your data alone.

To explore the synthetic browser demo without an API or database:

\`\`\`powershell
npm install
npm run dev:demo
\`\`\`

Nmap, ZAP, and AI credentials are optional for local setup. Live assessments require separate configuration and authorization; follow the [setup guide](docs/SETUP.md#7-live-scanning) and [authorized target lab plan](docs/Authorized-Target-Lab.md).

## Security and validation

API mode checks role permissions and target scope on assessment actions, requires a human decision on findings, and records supported actions in a tamper-evident activity log. Browser demo records and scans are labelled synthetic or simulated. The [project guide](docs/PROJECT_GUIDE.md) describes the controls and current limits in detail.

| Command | Purpose |
| --- | --- |
| \`npm run typecheck\` | Check frontend and server TypeScript |
| \`npm run test:scan-scope\` | Test scan scope and safety rules |
| \`npm run test:e2e\` | Test the persisted workflow |
| \`npm run build:api\` | Build the API-mode frontend |

## Explore the repository

| Area | Start here | What you will find |
| --- | --- | --- |
| App routes | [src/app/router.tsx](src/app/router.tsx) | Public and role-aware pages |
| UI screens | [src/pages/](src/pages/) | Projects, scans, findings, remediation, and reports |
| Demo state | [src/stores/](src/stores/) | Synthetic data and browser persistence |
| API | [server/src/routes/](server/src/routes/) | Authentication, workflow, and assessment endpoints |
| Database | [server/prisma/](server/prisma/) | Prisma schema and migrations |
| Screenshots | [capture archive](${archive}/README.md) | Every image shown above |
| Setup | [docs/SETUP.md](docs/SETUP.md) | Configuration and operating guide |
| Design | [docs/System-Design.md](docs/System-Design.md) | Architecture and finding lifecycle |
| Detailed notes | [docs/PROJECT_GUIDE.md](docs/PROJECT_GUIDE.md) | Module status, demo walk-through, and implementation limits |
`;

await writeFile(resolve("README.md"), readme);

const archiveDoc = `# AIVERA role tour captures

Captured on **${capturedOn}** in Microsoft Edge, at **${viewport}**, with the local browser demo and seeded synthetic data. No target was contacted. The screenshots are viewport captures, unedited after capture. The root [README](../../../README.md#app-tour) displays all ${images.length} images.

Run \`npm run dev:demo -- --host 127.0.0.1\` and then \`npm run screenshots:roles\` to recapture. Run \`npm run readme:role-tour\` to refresh the gallery and this archive. See [manifest.json](manifest.json) for full SHA-256 hashes.

| Role | Screen | Route | File | SHA-256 prefix |
| --- | --- | --- | --- | --- |
${images.map((item) => `| ${item.role} | ${item.label} | \`${item.route}\` | [${item.file}](${item.file}) | \`${item.sha256.slice(0, 12)}\` |`).join("\n")}
`;
await writeFile(resolve(archive, "README.md"), archiveDoc);
console.log(`Updated README.md and capture archive with ${images.length} screenshots.`);
