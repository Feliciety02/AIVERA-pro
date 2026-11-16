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
const hero = `${archive}/public-01-landing-page.png`;

const readme = `<p align="center">
  <a href="${hero}"><img src="${hero}" width="1200" alt="AIVERA public landing page"></a>
</p>

<h1 align="center">AIVERA</h1>

<p align="center">An intelligent web security assessment and vulnerability management app for authorized projects, evidence review, remediation, and reporting.</p>

<p align="center"><code>React 19 + TypeScript</code> &nbsp; <code>Vite 7 + Tailwind CSS 4</code> &nbsp; <code>Express + Prisma</code> &nbsp; <code>SQLite</code></p>

<p align="center">
  <a href="#app-tour"><strong>App tour</strong></a> &nbsp;·&nbsp;
  <a href="#roles"><strong>Roles</strong></a> &nbsp;·&nbsp;
  <a href="#how-it-works"><strong>How it works</strong></a> &nbsp;·&nbsp;
  <a href="#run-locally"><strong>Run locally</strong></a> &nbsp;·&nbsp;
  <a href="#explore-the-repository"><strong>Explore the repository</strong></a>
</p>

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

\`\`\`mermaid
flowchart TD
    A["1. Define the scope<br/>Project, authorized target, and testing boundaries"]
    B["2. Collect assessment data<br/>Recon, tool import, demo simulation, or approved scan"]
    C["3. Review findings and evidence<br/>Check source, affected target, and supporting proof"]
    D["4. Verify each finding<br/>An assessor confirms or rejects it with notes"]
    E["5. Prioritize and assign a fix<br/>Record risk and create a remediation task"]
    F["6. Retest and approve<br/>Check the fix, then approve closure"]
    G["7. Report the outcome<br/>Prepare results and retain activity history"]
    A --> B --> C --> D --> E --> F --> G
\`\`\`

1. **Define the scope.** Create a project, register the target, record authorization, and set allowed hosts, paths, testing activities, and exclusions. The app checks this scope before a live assessment or tool import.
2. **Collect assessment data.** Use a clearly labelled browser simulation, import Nmap XML or ZAP JSON output, or run an explicitly enabled assessment in API mode. The browser demo does not contact targets.
3. **Review evidence.** Tool alerts and manual findings are linked to the target and supporting evidence. The assessor checks provenance and may use AI analysis as an aid.
4. **Verify each finding.** A person reviews the evidence, records notes and a reason, then confirms or rejects the finding. AI output never makes that decision.
5. **Prioritize and assign a fix.** A confirmed finding receives a risk record and a remediation task for the project team. Critical and high findings also require lead sign-off.
6. **Retest and approve.** The fix owner requests a retest. An assessor records whether it passed; a lead approves closure after a passing retest. A failed retest returns the task for more work.
7. **Report the outcome.** The team prepares a report from the reviewed results, and a lead approves the final version. Activity history records the decisions and changes.

The React app uses one workspace with navigation for each role. Browser demo data is synthetic and stored locally in the browser. In API mode, Express handles authentication, permissions, scope checks, workflow rules, and SQLite storage through Prisma. See the [system design](docs/System-Design.md) for the data and workflow model.

## Run locally

You need **Node.js 22 or newer** and npm. SQLite is bundled through the app dependencies. For the full API mode, set a password of your choice as \`SEED_DEMO_PASSWORD\` in \`server/.env\` before seeding a **fresh development database**:

\`\`\`powershell
npm install
Copy-Item server/.env.example server/.env
# Set SEED_DEMO_PASSWORD in server/.env
npm run db:setup
npm run dev:full
\`\`\`

Open **http://localhost:5173**. Sign in as \`admin@aivera.local\` with the password you set. The API runs at \`http://localhost:4000/api\`. \`db:setup\` seeds starting data, so use the [setup guide](docs/SETUP.md) before running it against an existing database.

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
