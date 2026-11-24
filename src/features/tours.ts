/**
 * First-run page tutorials, focused on the assessment workflow (not generic
 * website parts like search or notifications). Each step highlights one piece
 * of UI and explains what it does and why it matters.
 *
 * Targets are found by CSS selector or by visible text, so pages need no
 * tutorial-specific markup. A step whose target isn't on screen (role-hidden
 * button, mobile layout, hidden banner) is skipped automatically.
 */

export type TourTarget = string | { text: string; selector?: string; closest?: string };

export interface TourStep {
  target?: TourTarget;
  title: string;
  body: string;
  /** Show the step (centred) even when its target is hidden, e.g. the sidebar on small screens. */
  keepIfHidden?: boolean;
}

const card = (text: string, selector = "h3") => ({ text, selector, closest: "[data-slot=card]" });
const btn = (text: string) => ({ text, selector: "button, a" });
const tab = (text: string) => ({ text, selector: "[role=tab]" });
const statGrid = (label: string) => ({ text: label, selector: "p", closest: ".grid" });
const menuLink = (to: string) => `nav[aria-label="Main navigation"] a[href="${to}"]`;
const TABS = "main [role=tablist]";
const TABLE = "main table";
const NOTE = "main [role=note]";

export const WELCOME_TOUR: TourStep[] = [
  {
    title: "Welcome to AIVERA",
    body: "AIVERA helps you test a website you have permission to test, step by step: add the website, scan it, decide which findings are real, plan the fixes, and create a report. AI helps explain things, but you always make the final call.",
  },
  { target: '[data-tour="next-step"]', title: "Start here every time", body: "This card always shows your next step and one button to do it. Follow it from top to bottom and you won't miss anything." },
  { target: menuLink("/targets"), title: "1 · Websites", body: "The websites you're allowed to test. Adding one takes four short steps, and AIVERA works out what may be tested.", keepIfHidden: true },
  { target: menuLink("/scans"), title: "2 · Scans", body: "Every scan of your website. The easiest way to start one is the Scan this website button on Home or on the website's page.", keepIfHidden: true },
  { target: menuLink("/findings"), title: "3 · Findings", body: "What the scans found. Look at the evidence and decide: real problem or false alarm. Only your decision counts.", keepIfHidden: true },
  { target: menuLink("/remediation"), title: "4 · Fixes", body: "A to-do list of fixes for confirmed problems: who fixes it, by when, and a retest to prove it's fixed.", keepIfHidden: true },
  { target: menuLink("/reports"), title: "5 · Reports", body: "Turn your confirmed findings, evidence and fixes into a PDF report.", keepIfHidden: true },
  { target: '[data-tour="menu-mode"]', title: "Need more tools?", body: "The menu is in Simple mode. Click Show all tools for extra pages like analytics, projects and checklists. Replay any page's tutorial with the ? button at the top.", keepIfHidden: true },
];

interface PageTour {
  key: string;
  match: RegExp;
  steps: TourStep[];
}

// Order matters: specific routes (…/new, …/edit) come before …/:id.
export const PAGE_TOURS: PageTour[] = [
  {
    key: "dashboard",
    match: /^\/dashboard$/,
    steps: [
      { target: '[data-tour="next-step"]', title: "What to do next", body: "The steps of your assessment, with the current one highlighted. The button does the next step for you. When a step is done it turns green." },
      { target: '[data-tour="quick-scan"]', title: "Scan with one click", body: "Runs the security tools on your website inside the approved scope, with gentle settings. It asks you to confirm first, takes about two minutes, and AI explains the results." },
      { target: statGrid("Websites ready to scan"), title: "Where things stand", body: "Four live numbers: websites you may scan, findings waiting for a decision, problems a person confirmed, and how many fixes are closed. Click any card to open the matching list." },
      { target: card("Waiting on you"), title: "Your to-do list", body: "Everything assigned to you: findings to review, fixes, retests and approvals. Click a row to open it. Charts and trends are on the Analytics page." },
      { target: btn("New project"), title: "Start an assessment", body: "Everything begins with a project. Click here when you're ready to plan a new assessment." },
    ],
  },
  {
    key: "analytics",
    match: /^\/analytics$/,
    steps: [
      { target: 'main [aria-label="Projects"]', title: "Pick a project", body: "Show all projects together or focus on one. Every number and chart on this page follows this choice." },
      { target: 'input[aria-label="From date"]', title: "Pick a period", body: "Set a date range, or use the 30/90/180/365-day shortcuts. Findings and scans outside the range are left out." },
      { target: statGrid("Verification rate"), title: "Key rates", body: "Verification rate = findings that got a final human decision. Confirmation rate = how many of those turned out to be real. Remediation rate = fix tasks that are closed." },
      { target: card("Findings by tool"), title: "Compare tools", body: "Which tool produced confirmed, unverified and rejected findings. Many rejected findings from one tool means it produces false positives, useful to discuss in your report." },
      { target: card("Project comparison"), title: "Compare projects", body: "Confirmed, unverified and remediated findings for each project side by side." },
    ],
  },
  {
    key: "projects",
    match: /^\/projects$/,
    steps: [
      { target: btn("New project"), title: "Create a project", body: "A project is one assessment engagement: its goal, dates, owner and team. Targets, scans, findings and reports all belong to a project." },
      { target: 'main [aria-label="Statuses"]', title: "Filter by status", body: "Projects move from Draft → Planning → In Progress → Under Review → Completed. Archived projects are hidden unless you tick \"Show archived\"." },
      { target: TABLE, title: "Project list", body: "Each row shows the project ID, assigned assessor, number of targets and status. Click a row to open it. Use the ⋯ menu to edit, archive or restore it." },
    ],
  },
  {
    key: "project-form",
    match: /^\/projects\/(new|[^/]+\/edit)$/,
    steps: [
      { target: "#name", title: "Name and description", body: "Give the assessment a clear name and describe what is being tested and why. These appear on the dashboard and in the final report." },
      { target: "#assessmentType", title: "Assessment type", body: "Web application, API, external perimeter, authenticated web app, or retest. It describes the kind of engagement in reports." },
      { target: "#ownerId", title: "Owner and team", body: "The owner is accountable for the assessment. Tick the members below, they can be assigned findings and checklists." },
      { target: "#startDate", title: "Schedule", body: "The planned testing window. The completion date must be on or after the start date." },
      { target: "#objectives", title: "Objectives", body: "What this assessment must find out, for example \"check access control between customer and admin roles\". It's used in the report's methodology." },
      { target: 'main button[type="submit"]', title: "Save the plan", body: "Creating a project only records the plan, no testing starts. Next you'll register the target you're allowed to test." },
    ],
  },
  {
    key: "project-detail",
    match: /^\/projects\/[^/]+$/,
    steps: [
      { target: "main h1", title: "Project overview", body: "The project's name, ID, status and dates. Everything about this assessment is collected on this page." },
      { target: statGrid("Authorized targets"), title: "Progress numbers", body: "How many targets are authorized, how many scans ran, how many vulnerabilities are confirmed, how many still need a decision, and how much of the checklist is done." },
      { target: TABS, title: "Tabs", body: "Three tabs in work order: the overview with its websites, then scans and findings, then reports and activity." },
      { target: btn("Register target"), title: "Next step", body: "Register the web application you have written permission to test, and define exactly what may be tested." },
    ],
  },
  {
    key: "targets",
    match: /^\/targets$/,
    steps: [
      { target: statGrid("Registered"), title: "Authorization status", body: "Only targets that are Authorized and confirmed can be scanned or receive imported results. Pending, expired or revoked targets are blocked." },
      { target: 'main [aria-label="Authorization"]', title: "Filters", body: "Filter by authorization status, environment (development, staging, QA, lab) or project." },
      { target: btn("Register target"), title: "Register a target", body: "Add a new application, its proof of permission, and its testing scope." },
      { target: TABLE, title: "Target list", body: "Shows each target's environment, authorization, number of in-scope hosts and exclusions. Click a row to see its full scope." },
      { target: 'main [aria-label="Websites view"]', title: "Two views", body: "Websites lists what you may test. Discovery shows the hosts, ports, services and pages found on them." },
      { target: 'main [aria-label="Targets"]', title: "Choose a target", body: "Show discovery data for one target or all of them. The Origins filter separates imported, simulated and sample data." },
      { target: TABS, title: "Discovery tabs", body: "Overview: counts, services and import history. Hosts & ports: which machines are up and their open ports. Web & DNS: pages and API routes found, and name records." },
      { target: card("Open services"), title: "Open services", body: "How many open ports each service has, for example https or ssh. Unexpected services, like a database, often lead to findings." },
      { target: btn("Import Nmap / ZAP report"), title: "Add discovery data", body: "Import an Nmap XML report to fill hosts, ports and services, or a ZAP report to fill endpoints. Only in-scope items are kept." },
    ],
  },
  {
    key: "target-form",
    match: /^\/targets\/(new|[^/]+\/edit)$/,
    steps: [
      { target: "#url", title: "Website address", body: "Paste the full address, e.g. http://127.0.0.1:8000. AIVERA fills in the name, environment, host to test and owner from it." },
      { target: "#authorizationConfirmed", title: "Permission", body: "Tick this only if the owner gave you written permission. Your name and the time are saved, with an automatic record number." },
      { target: "main details", title: "Details", body: "Everything AIVERA filled in: name, environment, scope, owner and project. Open it to check or change anything, or to detect scope from robots.txt and sitemap.xml." },
      { target: 'main button[type="submit"]', title: "Save", body: "Anything missing is highlighted in red with a short explanation." },
    ],
  },
  {
    key: "target-detail",
    match: /^\/targets\/[^/]+$/,
    steps: [
      { target: card("Permission to test", "h2"), title: "Permission first", body: "Whether this website may be tested, the authorization reference and who confirmed it. If it isn't authorized, every scan and import is blocked, and the button to record it appears here." },
      { target: '[data-tour="quick-scan"]', title: "Scan this website", body: "One button runs Nmap and OWASP ZAP inside the approved scope. If it can't run yet, the note says exactly why and how to fix it." },
      { target: card("Findings", "h2"), title: "What was found", body: "Findings from every scan of this website. Click one to review it." },
      { target: card("Scope", "h2"), title: "What may be tested", body: "Left: hosts, paths, checks and activities you may test. Right: what must never be touched. Edit scope changes it, and every change is logged." },
      { target: card("Details", "h2"), title: "Details", body: "Project, environment, counts and dates in one place." },
    ],
  },
  {
    key: "scans",
    match: /^\/scans$/,
    steps: [
      { target: btn("Import tool output"), title: "Use real tool results", body: "Run Nmap (e.g. nmap -sV -oX report.xml <host>) or OWASP ZAP yourself on your authorized target, export the report, and import it here. Findings arrive as Pending Verification." },
      { target: btn("New scan"), title: "Start a scan", body: "One screen: pick the website, tick that you'll stay in scope, and start. In demo mode it runs a clearly labelled practice scan." },
      { target: TABLE, title: "Scan history", body: "Every scan with its target, tools, status, result type and number of findings. Click a row to see its output and findings." },
    ],
  },
  {
    key: "scan-wizard",
    match: /^\/scans\/new$/,
    steps: [
      { target: "#scan-target", title: "Pick the website", body: "Only websites with confirmed permission can be picked. Its project comes with it." },
      { target: "main details", title: "More settings", body: "Request rate, time limit and test categories. The defaults are gentle; most scans never need changing." },
    ],
  },
  {
    key: "scan-detail",
    match: /^\/scans\/[^/]+$/,
    steps: [
      { target: card("Status", "h2"), title: "Status and next step", body: "How far the scan got, any error, and the one button you need next, usually Review findings." },
      { target: card("Findings", "h2"), title: "Results", body: "What this scan found, all waiting for a decision. Raw tool output and the scan settings are folded below." },
      { target: card("Details", "h2"), title: "Scan details", body: "Website, project, profile, tools, speed limits and who started it." },
    ],
  },
  {
    key: "assessments",
    match: /^\/assessments$/,
    steps: [
      { target: 'main [role="combobox"]', title: "Choose a project", body: "The category cards below show this project's progress." },
      { target: { text: "Authentication and Login Security", selector: "h3", closest: "a" }, title: "A test category", body: "Each card is one security area (authentication, access control, injection…). It shows how many checks are done, how many findings exist, how many are confirmed, and how much evidence was reviewed. Click it to open the checklist." },
    ],
  },
  {
    key: "assessment-detail",
    match: /^\/assessments\/[^/]+$/,
    steps: [
      { target: card("Automated checks"), title: "Automated checks", body: "Checks a tool can perform. Record the result based on the imported or simulated tool output." },
      { target: card("Manual testing"), title: "Manual tests", body: "Checks you perform yourself with test accounts, inside the scope, for example trying another user's order ID." },
      { target: 'main [aria-label^="Result for"]', title: "Record each result", body: "Choose Not tested, Pass, Fail (issue observed) or Not applicable. It saves straight away." },
      { target: 'main textarea[aria-label="Observation"]', title: "Write what you saw", body: "Describe what you tested and what happened, plus where the evidence is. Click Save notes when done." },
      { target: btn("Record finding"), title: "Found a problem?", body: "Turns this check into a finding with your evidence. It starts as Pending Verification and the check is marked Fail." },
      { target: card("Assessment details"), title: "Status and assessor", body: "Set the category status (not started, in progress, completed, blocked) and who is responsible for it." },
    ],
  },
  {
    key: "ai",
    match: /^\/ai-analyst$/,
    steps: [
      { target: 'main [role="radiogroup"]', title: "Six AI tasks", body: "Scan interpretation explains tool output. Vulnerability explanation describes a finding in plain words. Risk prioritization suggests urgency. Remediation suggests fixes. Test recommendations suggests manual checks. Summary drafts an executive summary from confirmed findings." },
      { target: { text: "Analysis context", selector: "p", closest: "[data-slot=card]" }, title: "Pick what to analyse", body: "Choose the project, then a scan or finding depending on the task. The Run button tells you what's still missing." },
      { target: { text: "Technical evidence", selector: "p", closest: "[data-slot=card]" }, title: "Check the input", body: "The evidence and tool output the AI will read. Passwords, tokens, cookies, keys and emails are removed before anything is sent." },
      { target: NOTE, title: "Real AI or demo?", body: "This banner tells you whether a real AI model is connected or demo samples are used. Either way the result is only advice, it can be wrong and never confirms a finding." },
      { target: { text: "Analysis history", selector: "p", closest: "[data-slot=card]" }, title: "History", body: "Every analysis for this project. Open one to see its reasoning, suggested steps, and exactly what data was sent to the AI." },
    ],
  },
  {
    key: "findings",
    match: /^\/findings$/,
    steps: [
      { target: statGrid("Pending Verification"), title: "Verification status", body: "Pending: no decision yet. Needs Further Review: unsure, needs more checks. Confirmed: a real vulnerability. Rejected: a false positive. Click a box to show only those findings." },
      { target: 'main [aria-label="Severities"]', title: "Filters", body: "Filter by status, severity, category, source tool, data origin (Imported, Simulated, User entered) or assessor. Filters stay in the address, so you can share the view." },
      { target: TABLE, title: "Findings register", body: "Each finding with its target, category, severity, tool, evidence count and status. Click a row to review it, or the eye icon for a quick look. Tick rows to assign or export them, confirming is never done in bulk." },
      { target: btn("Record manual finding"), title: "Found something yourself?", body: "Add a finding from manual testing, with your evidence. It starts as Pending Verification like any other finding." },
      { target: btn("Export CSV"), title: "Export", body: "Download the filtered list as a spreadsheet for your documentation." },
      { target: 'main [aria-label="Findings view"]', title: "Two views", body: "All findings lists everything to review. Risk priority ranks confirmed problems by risk so you know what to fix first." },
      { target: statGrid("Open risks"), title: "Risk summary", body: "Open risks, how many are critical or high, the average score, and how many are mitigated or accepted." },
      { target: card("Risk matrix"), title: "Risk matrix", body: "Each cell counts risks with that likelihood and impact. Top-right (red) is the most dangerous. Click a cell to filter the risk list below." },
      { target: card("Affected assets"), title: "Most affected targets", body: "Targets ranked by their highest open risk score." },
      { target: { text: "Risk register", selector: "p", closest: "[data-slot=card]" }, title: "Risk register", body: "Every confirmed risk with its score, owner, mitigation status and review date. Click a row to change likelihood, impact, owner or status." },
    ],
  },
  {
    key: "finding-detail",
    match: /^\/findings\/[^/]+$/,
    steps: [
      { target: "main h1", title: "The finding", body: "What was found, how serious the tool thinks it is, and on which website." },
      { target: 'section[aria-label="Is this a real problem?"]', title: "Decide here", body: "Red: it is a real problem. Green: it is a false alarm. The AI result, when shown, is labelled as AI and is only advice. Your notes are filled in for you." },
      { target: card("Evidence", "h2"), title: "Check the evidence", body: "What the tool actually saw. Tick \"I reviewed this\" on the items you checked." },
      { target: card("Details", "h2"), title: "Details", body: "Location, category, tool, dates and risk score, all in one list." },
      { target: "main details", title: "More details", body: "Impact, the full fix, fix tasks and every past decision, folded away until you need them." },
    ],
  },
  {
    key: "remediation",
    match: /^\/remediation$/,
    steps: [
      { target: { text: "% closed", selector: "span", closest: "div" }, title: "Fix progress", body: "How many fixes are open, how many are overdue, and how many are closed." },
      { target: NOTE, title: "Closing rule", body: "A task is never resolved just because an AI suggested a fix. It needs a passed manual retest (if required) and an assessor's approval." },
      { target: "main .grid", title: "The board", body: "One column per step: open, in progress, awaiting retest, awaiting approval, then closed. Click a card to work on it." },
      { target: btn("New task"), title: "Create a fix task", body: "Pick a confirmed finding and give it an owner, priority, due date and fix recommendation. Then click the task to move it: Start work → Request retest → Record retest → Approve & resolve, or Accept risk." },
    ],
  },
  {
    key: "reports",
    match: /^\/reports$/,
    steps: [
      { target: btn("Create report"), title: "Make a report", body: "Pick the project and the type of report (technical, executive or fix progress), then create. Websites, dates and the summary are filled in for you." },
      { target: TABLE, title: "Your reports", body: "Each report with its status. Click a row to read or print it, or use PDF to download." },
    ],
  },
  {
    key: "report-detail",
    match: /^\/reports\/[^/]+$/,
    steps: [
      { target: "main article", title: "Report preview", body: "The full report: cover, scope and authorization, methodology, tools, findings summary, detailed verified findings with evidence, risks, fixes and conclusion." },
      { target: card("Status", "h2"), title: "Where it stands", body: "Draft, waiting for approval, or final, and the one action that moves it forward." },
      { target: card("Download", "h2"), title: "Download or print", body: "Creates the PDF in your browser from the current data, with page numbers. Print leaves out the menus." },
    ],
  },
  {
    key: "activity",
    match: /^\/activity$/,
    steps: [
      { target: NOTE, title: "Activity log", body: "Every important action, targets registered, scope changes, scans, decisions, fixes, reports, with who did it and when. In full-stack mode it's stored on the server and can't be edited." },
      { target: 'input[aria-label="From date"]', title: "Filter", body: "Narrow by event type, user, entity and date range." },
      { target: TABLE, title: "Entries", body: "Click an associated entity to jump to it. Export CSV keeps a copy for your documentation." },
    ],
  },
  {
    key: "users",
    match: /^\/users$/,
    steps: [
      { target: TABLE, title: "Users", body: "Each person's role, account status, assigned projects and activity. Click a row to change their role, status or projects." },
      { target: card("Roles & permissions"), title: "Who can do what", body: "Administrators manage everything. Security assessors plan, test, verify and report. Viewers can only read dashboards and final reports. In full-stack mode the server enforces this." },
      { target: card("Role-based navigation demo"), title: "Menu per role", body: "Preview which menu items each role sees." },
    ],
  },
  {
    key: "integrations",
    match: /^\/integrations$/,
    steps: [
      { target: card("AI Analysis Service"), title: "AI connection", body: "Connected means a real AI model is configured on the server. Demo Adapter means sample analyses are used. Nothing claims to be connected when it isn't." },
      { target: card("Nmap"), title: "Security tools", body: "Nmap, ZAP, DNS and the HTTP inspector. For now their results come in through report imports. Open Setup information to see how each one will be connected later." },
      { target: { text: "Prepared backend API surface", selector: "p", closest: "[data-slot=card]" }, title: "API", body: "The server endpoints that the app and future integrations use." },
    ],
  },
  {
    key: "settings",
    match: /^\/settings$/,
    steps: [
      { target: { text: "Display", selector: "h3", closest: "[data-slot=card]" }, title: "Your preferences", body: "Theme, table rows, the simple menu, tutorials and demo reminders. Notifications are just below." },
      { target: tab("Workspace"), title: "Workspace defaults", body: "Administrators: scan defaults, report options and verification safeguards for everyone." },
      { target: tab("Advanced"), title: "Advanced", body: "Administrators: integration settings and resetting the demo data." },
    ],
  },
];

export function tourForPath(pathname: string): PageTour | undefined {
  return PAGE_TOURS.find((t) => t.match.test(pathname));
}

/** Finds the element a step points at, or null if it isn't visible. */
export function resolveTarget(target: TourTarget | undefined): HTMLElement | null {
  if (!target) return null;
  const visible = (el: Element | null): el is HTMLElement => {
    if (!(el instanceof HTMLElement)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  if (typeof target === "string") {
    const el = [...document.querySelectorAll(target)].find(visible);
    return el ?? null;
  }
  const candidates = [...document.querySelectorAll(target.selector ?? "button, a, h1, h2, h3, p, span, label")];
  const hit = candidates.find((el) => visible(el) && (el.textContent ?? "").trim().startsWith(target.text));
  if (!hit) return null;
  const el = target.closest ? hit.closest(target.closest) : hit;
  return visible(el) ? el : null;
}
