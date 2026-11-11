/**
 * AIVERA starting data — UMERCH3.0 only.
 *
 * AIVERA is dedicated to assessing UMERCH3.0 (the UM Merchandise Management
 * System). It starts with three role accounts, one project and the locally
 * hosted UMERCH3.0 target. There are no sample scans, findings, reports or
 * activity: everything else is created by real use of the app.
 */
import type {
  ActivityLog,
  AIAnalysis,
  ApplicationSettings,
  Assessment,
  DnsRecord,
  Endpoint,
  Evidence,
  Host,
  Integration,
  Notification,
  Port,
  Project,
  ReconRun,
  RemediationTask,
  Report,
  Risk,
  Scan,
  ScanResult,
  Target,
  User,
  Verification,
  VulnerabilityFinding,
} from "@/types";
import { RESTRICTED_ACTIVITY_DEFAULTS } from "@/lib/constants";

/** Bumping this replaces any older browser data with this starting state. */
export const SEED_VERSION = 5;

const SETUP_DATE = "2026-11-12T00:00:00Z";

/* ---------------------------------- Users -------------------------------- */
// One account per role, so the role-based access control can be demonstrated.
// Rename them on the Users page; passwords come from SEED_DEMO_PASSWORD in server/.env.
export const seedUsers: User[] = [
  { id: "usr-admin", name: "AIVERA Administrator", email: "admin@aivera.local", role: "administrator", title: "Platform Administrator", status: "active", assignedProjectIds: ["prj-umerch"], createdAt: SETUP_DATE, lastActiveAt: SETUP_DATE },
  { id: "usr-assessor", name: "UMERCH Security Assessor", email: "assessor@aivera.local", role: "assessor", title: "Security Assessor", status: "active", assignedProjectIds: ["prj-umerch"], createdAt: SETUP_DATE, lastActiveAt: SETUP_DATE },
  { id: "usr-viewer", name: "UMERCH Stakeholder", email: "viewer@aivera.local", role: "viewer", title: "Project Stakeholder", status: "active", assignedProjectIds: ["prj-umerch"], createdAt: SETUP_DATE, lastActiveAt: SETUP_DATE },
];

/* -------------------------------- Projects ------------------------------- */
export const seedProjects: Project[] = [
  {
    id: "prj-umerch", code: "AIV-2026-001", name: "UMERCH3.0 Security Assessment",
    description: "Security assessment of UMERCH3.0, the UM Merchandise Management System (Laravel + React), running locally for testing.",
    assessmentType: "web_application", ownerId: "usr-assessor", memberIds: ["usr-admin", "usr-assessor", "usr-viewer"], status: "planning",
    startDate: SETUP_DATE, dueDate: "2026-12-12T00:00:00Z",
    objectives: "Check UMERCH3.0's login and OTP verification, customer and admin access control, product and inventory pages, order handling, exposed files and configuration (for example debug routes), and security headers.",
    notes: "Local copy only (http://127.0.0.1:8000). Do not test the university's live store without written permission from ERIAO.",
    createdAt: SETUP_DATE, updatedAt: SETUP_DATE, dataOrigin: "user_created",
  },
];

/* -------------------------------- Targets -------------------------------- */
export const seedTargets: Target[] = [
  {
    id: "tgt-umerch-local", projectId: "prj-umerch", name: "UMERCH3.0 (local)", url: "http://127.0.0.1:8000/",
    description: "UM Merchandise Management System running on this computer with php artisan serve and an SQLite database.",
    assetType: "web_application", environment: "development",
    owner: "UMERCH3.0 developer (personal project)", authorizationStatus: "authorized", authorizationReference: "AUTH-2026-0001",
    authorizationConfirmed: true, authorizationConfirmedBy: "usr-assessor", authorizationConfirmedAt: SETUP_DATE,
    // Scope as detected: host and path from the address; robots.txt lists no blocked paths; no sitemap.xml.
    scope: {
      inScopeHosts: ["127.0.0.1:8000"],
      allowedPaths: ["/*"],
      excludedPaths: [],
      allowedCategories: ["authentication", "access_control", "injection", "session", "exposed_files", "config_https"],
      allowedActivities: ["Passive reconnaissance", "Port and service discovery", "Automated web scanning (rate-limited)", "Security header review", "Manual verification of findings"],
      restrictedActivities: RESTRICTED_ACTIVITY_DEFAULTS,
    },
    testingNotes: "Start UMERCH3.0 with: php artisan serve --host=127.0.0.1 --port=8000 (in the UMERCH3.0 folder).",
    createdAt: SETUP_DATE, updatedAt: SETUP_DATE, dataOrigin: "user_created",
  },
];

/* ------------------------- Created by real use only ------------------------ */
export const seedAssessments: Assessment[] = [];
export const seedScans: Scan[] = [];
export const seedScanResults: ScanResult[] = [];
export const seedHosts: Host[] = [];
export const seedPorts: Port[] = [];
export const seedDns: DnsRecord[] = [];
export const seedEndpoints: Endpoint[] = [];
export const seedReconRuns: ReconRun[] = [];
export const seedFindings: VulnerabilityFinding[] = [];
export const seedEvidence: Evidence[] = [];
export const seedVerifications: Verification[] = [];
export const seedAIAnalyses: AIAnalysis[] = [];
export const seedRisks: Risk[] = [];
export const seedRemediation: RemediationTask[] = [];
export const seedReports: Report[] = [];
export const seedActivity: ActivityLog[] = [];
export const seedNotifications: Notification[] = [];

/* ------------------------------ Integrations ----------------------------- */
export const seedIntegrations: Integration[] = [
  { id: "nmap", name: "Nmap", purpose: "Host discovery, port scanning and service identification.", integrationType: "Server-side tool adapter (CLI)", status: "not_connected", features: ["Host discovery", "TCP port enumeration", "Service & version detection", "XML output import"], setupSteps: ["Install Nmap on the machine that runs the AIVERA server (not in the browser).", "Set AIVERA_LIVE_SCANS_ENABLED=true and AIVERA_ALLOWED_SCAN_HOSTS in server/.env.", "The server checks every run against the target's approved scope first."], futureEndpoint: "POST /api/scans/automated { tools: ['nmap'] }" },
  { id: "owasp_zap", name: "OWASP ZAP", purpose: "Web application spidering and passive vulnerability checks.", integrationType: "Docker container started by the server", status: "not_connected", features: ["Spider inside the approved scope", "Passive scan rules", "JSON report import"], setupSteps: ["Install Docker and pull ghcr.io/zaproxy/zaproxy:stable.", "Enable live scans and allowlist the host in server/.env.", "AIVERA builds the ZAP context from the target's scope and exclusions."], futureEndpoint: "POST /api/scans/automated { tools: ['owasp_zap'] }" },
  { id: "dns_utils", name: "DNS Utilities", purpose: "Resolve DNS records for declared in-scope hostnames.", integrationType: "Backend resolver service", status: "not_connected", features: ["A/AAAA lookups during scope detection", "Scope-restricted resolution"], setupSteps: ["Used automatically by Detect scope on the AIVERA server."], futureEndpoint: "POST /api/targets/detect-scope" },
  { id: "http_inspector", name: "HTTP Security Inspector", purpose: "Review security headers, cookies, redirects and TLS settings.", integrationType: "Backend inspection worker", status: "not_connected", features: ["Security header checks", "Cookie attribute analysis", "Redirect chain review"], setupSteps: ["Not implemented yet — use ZAP's passive header checks or import results."], futureEndpoint: "POST /api/scans/:id/jobs { tool: 'http_inspector' }" },
  { id: "ai_service", name: "AI Analysis Service", purpose: "Assist assessors with interpretation, explanation and remediation guidance.", integrationType: "Google Gemini via the AIVERA server", status: "demo_adapter", features: ["Scan result interpretation", "Vulnerability explanation", "Risk prioritization", "Remediation recommendations", "Security test recommendations", "Assessment summary drafting"], setupSteps: ["Set GEMINI_API_KEY in server/.env (never in the browser).", "Secrets are redacted before anything is sent to the model.", "Outputs are suggestions that a person must verify."], futureEndpoint: "POST /api/ai/analyses" },
];

/* -------------------------------- Settings ------------------------------- */
export const defaultSettings: ApplicationSettings = {
  general: { organizationName: "UMERCH3.0 Security Assessment", timezone: "local", dateFormat: "MMM d, yyyy" },
  appearance: { theme: "light", density: "comfortable", reduceMotion: false },
  table: { pageSize: 10 },
  notifications: { findingUpdates: true, scanEvents: true, remediationDue: true, reportReady: true, toastsEnabled: true },
  security: { requireConfirmBeforeVerify: true, requireEvidenceReview: true, maskSensitiveEvidence: false, idleLockMinutes: 30 },
  assessmentDefaults: { profile: "baseline", requestsPerSecond: 5, timeLimitMinutes: 60, categories: ["authentication", "access_control", "injection", "session", "exposed_files", "config_https"] },
  reports: { defaultTemplate: "technical", includeUnverifiedAppendix: false, showDemoWatermark: false, preparedBy: "AIVERA" },
  integrations: { backendBaseUrl: "http://localhost:4000/api", aiServiceMode: "demo" },
};
