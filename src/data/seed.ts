/**
 * AEGIS AI demonstration dataset (SYNTHETIC).
 *
 * All organisations, people, hosts and results are fictional. Hostnames use
 * reserved TLDs (.example / .test) or localhost; IP addresses use the
 * documentation ranges 192.0.2.0/24, 198.51.100.0/24 and 203.0.113.0/24.
 * Dates are fixed so the dataset is identical on every load.
 */
import type {
  ActivityLog,
  AIAnalysis,
  ApplicationSettings,
  Assessment,
  AssessmentCategoryId,
  ChecklistResult,
  DataOrigin,
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
  VerificationStatus,
  VulnerabilityFinding,
} from "@/types";
import { CATEGORIES, RESTRICTED_ACTIVITY_DEFAULTS } from "@/lib/constants";
import { defaultRiskInputs } from "@/lib/risk";
import { TEMPLATE_BY_KEY } from "./findingTemplates";

export const SEED_VERSION = 4;

/* ---------------------------------- Users -------------------------------- */
export const seedUsers: User[] = [
  { id: "usr-admin", name: "Alex Rivera", email: "alex.rivera@aegis-demo.example", role: "administrator", title: "Platform Administrator", status: "active", assignedProjectIds: ["prj-001", "prj-002", "prj-003", "prj-004", "prj-005"], createdAt: "2026-06-02T09:00:00Z", lastActiveAt: "2026-11-10T16:20:00Z" },
  { id: "usr-jkim", name: "Jordan Kim", email: "jordan.kim@aegis-demo.example", role: "assessor", title: "Lead Security Assessor", status: "active", assignedProjectIds: ["prj-001", "prj-003", "prj-005"], createdAt: "2026-06-05T09:00:00Z", lastActiveAt: "2026-11-11T08:45:00Z" },
  { id: "usr-pnat", name: "Priya Natarajan", email: "priya.natarajan@aegis-demo.example", role: "assessor", title: "Security Assessor", status: "active", assignedProjectIds: ["prj-001", "prj-002"], createdAt: "2026-06-12T09:00:00Z", lastActiveAt: "2026-11-10T13:10:00Z" },
  { id: "usr-mvil", name: "Marco Villanueva", email: "marco.villanueva@aegis-demo.example", role: "assessor", title: "Junior Security Assessor", status: "active", assignedProjectIds: ["prj-002", "prj-004"], createdAt: "2026-07-01T09:00:00Z", lastActiveAt: "2026-11-09T10:05:00Z" },
  { id: "usr-soka", name: "Sam Okafor", email: "sam.okafor@aegis-demo.example", role: "viewer", title: "Engineering Manager (Stakeholder)", status: "active", assignedProjectIds: ["prj-001", "prj-003"], createdAt: "2026-07-15T09:00:00Z", lastActiveAt: "2026-11-06T15:00:00Z" },
  { id: "usr-tbro", name: "Taylor Brooks", email: "taylor.brooks@aegis-demo.example", role: "viewer", title: "Compliance Analyst", status: "invited", assignedProjectIds: ["prj-002"], createdAt: "2026-10-28T09:00:00Z", lastActiveAt: "2026-10-28T09:00:00Z" },
];

/* -------------------------------- Projects ------------------------------- */
export const seedProjects: Project[] = [
  {
    id: "prj-001", code: "AEG-2026-001", name: "Northwind Retail Portal Assessment",
    description: "Web application assessment of the fictional Northwind storefront and its admin console in the staging environment.",
    assessmentType: "web_application", ownerId: "usr-jkim", memberIds: ["usr-jkim", "usr-pnat", "usr-soka"], status: "in_progress",
    startDate: "2026-09-14T00:00:00Z", dueDate: "2026-11-27T00:00:00Z",
    objectives: "Identify OWASP Top 10 weaknesses in the storefront, checkout and admin console. Verify session handling and access control between customer and admin roles.",
    notes: "Staging mirror only. Test accounts provided by the Northwind (fictional) engineering team.", createdAt: "2026-09-10T10:00:00Z", updatedAt: "2026-11-08T14:00:00Z", dataOrigin: "synthetic",
  },
  {
    id: "prj-002", code: "AEG-2026-002", name: "Helix Patient Portal (Lab) Review",
    description: "Authenticated assessment of a fictional patient self-service portal deployed in an isolated lab network.",
    assessmentType: "authenticated_webapp", ownerId: "usr-pnat", memberIds: ["usr-pnat", "usr-mvil", "usr-tbro"], status: "under_review",
    startDate: "2026-08-24T00:00:00Z", dueDate: "2026-11-14T00:00:00Z",
    objectives: "Assess authentication, session management and information disclosure for the patient portal lab build.",
    notes: "Lab data only — no real patient information exists in this environment.", createdAt: "2026-08-20T10:00:00Z", updatedAt: "2026-11-05T09:30:00Z", dataOrigin: "synthetic",
  },
  {
    id: "prj-003", code: "AEG-2026-003", name: "Orbital API Gateway Security Test",
    description: "API-focused assessment of the fictional Orbital logistics REST gateway (QA environment).",
    assessmentType: "api", ownerId: "usr-jkim", memberIds: ["usr-jkim", "usr-soka"], status: "completed",
    startDate: "2026-08-03T00:00:00Z", dueDate: "2026-09-25T00:00:00Z",
    objectives: "Validate object-level authorization, CORS and error handling on the public API.",
    notes: "Retest completed for two findings.", createdAt: "2026-07-29T10:00:00Z", updatedAt: "2026-10-02T11:00:00Z", dataOrigin: "synthetic",
  },
  {
    id: "prj-004", code: "AEG-2026-004", name: "Campus LMS Staging Assessment",
    description: "Planned assessment of a locally hosted learning-management system used for course delivery testing.",
    assessmentType: "web_application", ownerId: "usr-mvil", memberIds: ["usr-mvil", "usr-jkim"], status: "planning",
    startDate: "2026-11-18T00:00:00Z", dueDate: "2026-12-18T00:00:00Z",
    objectives: "Baseline security configuration and exposed files review prior to wider testing.",
    notes: "Awaiting signed authorization from the (fictional) LMS owner.", createdAt: "2026-11-03T10:00:00Z", updatedAt: "2026-11-03T10:00:00Z", dataOrigin: "synthetic",
  },
  {
    id: "prj-005", code: "AEG-2025-014", name: "Legacy Intranet Review (2025)",
    description: "Historical review of a decommissioned fictional intranet. Kept for reference.",
    assessmentType: "external_perimeter", ownerId: "usr-jkim", memberIds: ["usr-jkim"], status: "archived", statusBeforeArchive: "completed",
    startDate: "2025-10-06T00:00:00Z", dueDate: "2025-11-07T00:00:00Z",
    objectives: "Perimeter review prior to decommissioning.", notes: "Archived after decommissioning.", createdAt: "2025-10-01T10:00:00Z", updatedAt: "2026-01-15T10:00:00Z", dataOrigin: "synthetic",
  },
];

/* -------------------------------- Targets -------------------------------- */
const scope = (hosts: string[], allowed: string[], excluded: string[], cats: AssessmentCategoryId[], activities: string[]) => ({
  inScopeHosts: hosts,
  allowedPaths: allowed,
  excludedPaths: excluded,
  allowedCategories: cats,
  allowedActivities: activities,
  restrictedActivities: RESTRICTED_ACTIVITY_DEFAULTS,
});

export const seedTargets: Target[] = [
  {
    id: "tgt-001", projectId: "prj-001", name: "Northwind Storefront (Staging)", url: "https://shop.northwind.example",
    description: "Customer-facing storefront: catalogue, search, cart and checkout.", assetType: "web_application", environment: "staging",
    owner: "Northwind Engineering (fictional)", authorizationStatus: "authorized", authorizationReference: "RoE-NW-2026-09 (synthetic)",
    authorizationConfirmed: true, authorizationConfirmedBy: "usr-jkim", authorizationConfirmedAt: "2026-09-12T09:00:00Z",
    scope: scope(["shop.northwind.example", "static.northwind.example"], ["/", "/search", "/products", "/cart", "/checkout", "/api/*", "/uploads/"], ["/api/payments/*", "/admin/*"], ["authentication", "access_control", "injection", "session", "exposed_files", "info_disclosure", "config_https", "business_logic"], ["Passive reconnaissance", "Port and service discovery", "Automated web scanning (rate-limited)", "Authenticated testing with provided test accounts", "Manual verification of findings"]),
    testingNotes: "Rate limit 5 req/s. Testing window 08:00–18:00 UTC weekdays.", createdAt: "2026-09-11T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", dataOrigin: "synthetic",
  },
  {
    id: "tgt-002", projectId: "prj-001", name: "Northwind Admin Console (Staging)", url: "https://admin.northwind.example",
    description: "Back-office console for order management and reporting.", assetType: "admin_portal", environment: "staging",
    owner: "Northwind Engineering (fictional)", authorizationStatus: "authorized", authorizationReference: "RoE-NW-2026-09 (synthetic)",
    authorizationConfirmed: true, authorizationConfirmedBy: "usr-jkim", authorizationConfirmedAt: "2026-09-12T09:05:00Z",
    scope: scope(["admin.northwind.example"], ["/", "/admin/*", "/login"], ["/admin/users/delete", "/admin/billing/*"], ["authentication", "access_control", "session", "config_https"], ["Authenticated testing with provided test accounts", "Manual verification of findings", "Security header review"]),
    testingNotes: "Use only test accounts admin-test-01 and staff-test-01.", createdAt: "2026-09-11T10:30:00Z", updatedAt: "2026-09-30T10:00:00Z", dataOrigin: "synthetic",
  },
  {
    id: "tgt-003", projectId: "prj-002", name: "Helix Patient Portal (Lab)", url: "https://portal.helix-lab.test",
    description: "Patient self-service portal lab build with synthetic patient records.", assetType: "single_page_app", environment: "lab",
    owner: "Helix Health IT (fictional)", authorizationStatus: "authorized", authorizationReference: "LAB-AUTH-HX-0824 (synthetic)",
    authorizationConfirmed: true, authorizationConfirmedBy: "usr-pnat", authorizationConfirmedAt: "2026-08-22T09:00:00Z",
    scope: scope(["portal.helix-lab.test", "api.helix-lab.test"], ["/", "/login", "/account/*", "/api/*"], ["/api/integrations/*"], ["authentication", "session", "info_disclosure", "config_https", "exposed_files", "access_control"], ["Passive reconnaissance", "Port and service discovery", "Automated web scanning (rate-limited)", "Authenticated testing with provided test accounts"]),
    testingNotes: "Lab network only. Reset the lab after destructive-looking tests (none planned).", createdAt: "2026-08-21T10:00:00Z", updatedAt: "2026-10-12T10:00:00Z", dataOrigin: "synthetic",
  },
  {
    id: "tgt-004", projectId: "prj-003", name: "Orbital Logistics API (QA)", url: "https://api.orbital.example/v2",
    description: "REST API for shipment tracking and customer orders.", assetType: "rest_api", environment: "qa",
    owner: "Orbital Platform Team (fictional)", authorizationStatus: "authorized", authorizationReference: "QA-SEC-ORB-07 (synthetic)",
    authorizationConfirmed: true, authorizationConfirmedBy: "usr-jkim", authorizationConfirmedAt: "2026-07-31T09:00:00Z",
    scope: scope(["api.orbital.example"], ["/v2/*"], ["/v2/internal/*"], ["access_control", "injection", "info_disclosure", "config_https"], ["Automated web scanning (rate-limited)", "Authenticated testing with provided test accounts", "Manual verification of findings"]),
    testingNotes: "API keys for test tenants supplied out-of-band (never stored in AEGIS).", createdAt: "2026-07-30T10:00:00Z", updatedAt: "2026-09-20T10:00:00Z", dataOrigin: "synthetic",
  },
  {
    id: "tgt-005", projectId: "prj-004", name: "Campus LMS (Local Dev)", url: "http://localhost:8080",
    description: "Locally hosted LMS instance for pre-release testing.", assetType: "cms", environment: "development",
    owner: "Campus Digital Learning (fictional)", authorizationStatus: "pending", authorizationReference: "Pending — REQ-LMS-112",
    authorizationConfirmed: false,
    scope: scope(["localhost"], ["/"], ["/admin/backup/*"], ["exposed_files", "config_https", "info_disclosure"], ["Passive reconnaissance"]),
    testingNotes: "Do not begin testing until authorization is signed.", createdAt: "2026-11-03T10:30:00Z", updatedAt: "2026-11-03T10:30:00Z", dataOrigin: "synthetic",
  },
  {
    id: "tgt-006", projectId: "prj-005", name: "Legacy Intranet", url: "http://intranet.legacy.test",
    description: "Decommissioned intranet portal.", assetType: "web_application", environment: "lab",
    owner: "Corporate IT (fictional)", authorizationStatus: "expired", authorizationReference: "PERIM-2025-031 (synthetic)",
    authorizationConfirmed: true, authorizationConfirmedBy: "usr-jkim", authorizationConfirmedAt: "2025-10-04T09:00:00Z",
    scope: scope(["intranet.legacy.test"], ["/"], [], ["config_https", "info_disclosure"], ["Port and service discovery"]),
    testingNotes: "Authorization expired 2025-11-30.", createdAt: "2025-10-02T10:00:00Z", updatedAt: "2025-12-01T10:00:00Z", dataOrigin: "synthetic",
  },
];

/* ---------------------------------- Scans -------------------------------- */
const baseConfig = {
  timeLimitMinutes: 60, requestsPerSecond: 5, maxConcurrency: 2, outputFormat: "json" as const, respectExclusions: true, scopeConfirmed: true,
};

export const seedScans: Scan[] = [
  { id: "scn-001", code: "SCN-0001", name: "Storefront baseline web review", projectId: "prj-001", targetId: "tgt-001", status: "completed", progress: 100, config: { ...baseConfig, tools: ["owasp_zap", "http_inspector"], categories: ["injection", "config_https", "session", "exposed_files", "info_disclosure"], profile: "baseline" }, createdBy: "usr-jkim", createdAt: "2026-09-18T09:00:00Z", startedAt: "2026-09-18T09:02:00Z", completedAt: "2026-09-18T10:41:00Z", dataOrigin: "imported" },
  { id: "scn-002", code: "SCN-0002", name: "Storefront host & service discovery", projectId: "prj-001", targetId: "tgt-001", status: "completed", progress: 100, config: { ...baseConfig, tools: ["nmap", "dns_utils"], categories: ["config_https", "info_disclosure"], profile: "passive" }, createdBy: "usr-pnat", createdAt: "2026-09-16T13:00:00Z", startedAt: "2026-09-16T13:01:00Z", completedAt: "2026-09-16T13:22:00Z", dataOrigin: "imported" },
  { id: "scn-003", code: "SCN-0003", name: "Admin console access review", projectId: "prj-001", targetId: "tgt-002", status: "completed", progress: 100, config: { ...baseConfig, tools: ["owasp_zap", "http_inspector"], categories: ["access_control", "session", "authentication"], profile: "standard" }, createdBy: "usr-jkim", createdAt: "2026-10-20T09:00:00Z", startedAt: "2026-10-20T09:01:00Z", completedAt: "2026-10-20T09:48:00Z", dataOrigin: "simulated" },
  { id: "scn-004", code: "SCN-0004", name: "Patient portal authenticated review", projectId: "prj-002", targetId: "tgt-003", status: "completed", progress: 100, config: { ...baseConfig, tools: ["owasp_zap", "http_inspector", "nmap"], categories: ["authentication", "session", "info_disclosure", "config_https", "exposed_files"], profile: "standard" }, createdBy: "usr-pnat", createdAt: "2026-09-02T09:00:00Z", startedAt: "2026-09-02T09:03:00Z", completedAt: "2026-09-02T11:15:00Z", dataOrigin: "simulated" },
  { id: "scn-005", code: "SCN-0005", name: "Orbital API authorization sweep", projectId: "prj-003", targetId: "tgt-004", status: "completed", progress: 100, config: { ...baseConfig, tools: ["owasp_zap", "http_inspector"], categories: ["access_control", "info_disclosure", "config_https"], profile: "standard" }, createdBy: "usr-jkim", createdAt: "2026-08-10T09:00:00Z", startedAt: "2026-08-10T09:02:00Z", completedAt: "2026-08-10T10:30:00Z", dataOrigin: "imported" },
  { id: "scn-006", code: "SCN-0006", name: "Orbital API retest", projectId: "prj-003", targetId: "tgt-004", status: "completed", progress: 100, config: { ...baseConfig, tools: ["owasp_zap"], categories: ["access_control"], profile: "baseline" }, createdBy: "usr-jkim", createdAt: "2026-09-22T09:00:00Z", startedAt: "2026-09-22T09:01:00Z", completedAt: "2026-09-22T09:25:00Z", dataOrigin: "imported" },
  { id: "scn-007", code: "SCN-0007", name: "Patient portal DNS enumeration", projectId: "prj-002", targetId: "tgt-003", status: "failed", progress: 35, config: { ...baseConfig, tools: ["dns_utils"], categories: ["info_disclosure"], profile: "passive" }, createdBy: "usr-mvil", createdAt: "2026-10-08T09:00:00Z", startedAt: "2026-10-08T09:01:00Z", completedAt: "2026-10-08T09:06:00Z", errorMessage: "Simulated failure: lab resolver unreachable (demo scenario).", dataOrigin: "simulated" },
  { id: "scn-008", code: "SCN-0008", name: "Admin console header re-check", projectId: "prj-001", targetId: "tgt-002", status: "cancelled", progress: 10, config: { ...baseConfig, tools: ["http_inspector"], categories: ["config_https"], profile: "passive" }, createdBy: "usr-pnat", createdAt: "2026-11-04T09:00:00Z", startedAt: "2026-11-04T09:01:00Z", completedAt: "2026-11-04T09:02:00Z", dataOrigin: "simulated" },
];

export const seedScanResults: ScanResult[] = [
  { id: "sr-001a", scanId: "scn-001", tool: "owasp_zap", summary: "Imported sample ZAP report: 5 alerts across 4 paths", itemsFound: 5, rawOutput: "{\n  \"site\": \"https://shop.northwind.example\",\n  \"alerts\": [\n    { \"name\": \"Cross Site Scripting (Reflected)\", \"risk\": \"High\", \"instances\": 1 },\n    { \"name\": \"SQL Injection indicator\", \"risk\": \"High\", \"instances\": 1 },\n    { \"name\": \"Directory Browsing\", \"risk\": \"Medium\", \"instances\": 1 },\n    { \"name\": \"Application Error Disclosure\", \"risk\": \"Medium\", \"instances\": 1 },\n    { \"name\": \".git exposure\", \"risk\": \"High\", \"instances\": 1 }\n  ],\n  \"_note\": \"SYNTHETIC SAMPLE — not produced by a live scan\"\n}", recordedAt: "2026-09-18T10:41:00Z", dataOrigin: "imported" },
  { id: "sr-001b", scanId: "scn-001", tool: "http_inspector", summary: "Header review: HSTS and CSP absent; session cookie flags missing", itemsFound: 4, rawOutput: "strict-transport-security: MISSING\ncontent-security-policy: MISSING\nset-cookie SESSIONID: secure=false httponly=false samesite=unset\nserver: nginx/1.18.0 (Ubuntu)\n# SYNTHETIC SAMPLE", recordedAt: "2026-09-18T10:40:00Z", dataOrigin: "imported" },
  { id: "sr-002a", scanId: "scn-002", tool: "nmap", summary: "2 hosts up, 5 open ports", itemsFound: 7, rawOutput: "Nmap scan report for shop.northwind.example (192.0.2.10)\nPORT     STATE SERVICE VERSION\n22/tcp   open  ssh     OpenSSH 8.9p1\n80/tcp   open  http    nginx 1.18.0\n443/tcp  open  https   nginx 1.18.0\n3306/tcp open  mysql   MySQL 8.0.x\n\nNmap scan report for static.northwind.example (192.0.2.11)\n443/tcp  open  https   nginx 1.18.0\n# SYNTHETIC SAMPLE", recordedAt: "2026-09-16T13:22:00Z", dataOrigin: "imported" },
  { id: "sr-002b", scanId: "scn-002", tool: "dns_utils", summary: "4 DNS records resolved", itemsFound: 4, rawOutput: "shop.northwind.example.   300 IN A     192.0.2.10\nstatic.northwind.example. 300 IN A     192.0.2.11\nnorthwind.example.        3600 IN MX   10 mail.northwind.example.\nnorthwind.example.        3600 IN TXT  \"v=spf1 -all\"\n# SYNTHETIC SAMPLE", recordedAt: "2026-09-16T13:20:00Z", dataOrigin: "imported" },
  { id: "sr-003a", scanId: "scn-003", tool: "owasp_zap", summary: "SIMULATED: forced browsing reached /admin/reports as standard user", itemsFound: 1, rawOutput: "[SIMULATED OUTPUT — demo mode]\nGET /admin/reports -> 200 (role: staff-test-01)", recordedAt: "2026-10-20T09:48:00Z", dataOrigin: "simulated" },
  { id: "sr-004a", scanId: "scn-004", tool: "owasp_zap", summary: "SIMULATED: 3 alerts", itemsFound: 3, rawOutput: "[SIMULATED OUTPUT — demo mode]\nUsername enumeration indicator /login\nStack trace on /api/cart\nDirectory listing /uploads/", recordedAt: "2026-09-02T11:15:00Z", dataOrigin: "simulated" },
  { id: "sr-004b", scanId: "scn-004", tool: "nmap", summary: "SIMULATED: 1 host, 3 open ports", itemsFound: 4, rawOutput: "[SIMULATED OUTPUT — demo mode]\n203.0.113.20 portal.helix-lab.test\n22/tcp ssh\n443/tcp https\n8443/tcp https-alt", recordedAt: "2026-09-02T10:10:00Z", dataOrigin: "simulated" },
  { id: "sr-005a", scanId: "scn-005", tool: "owasp_zap", summary: "Imported sample: IDOR and CORS indicators on /v2/orders and /v2/profile", itemsFound: 2, rawOutput: "{ \"alerts\": [ { \"name\": \"Access control issue (sample)\", \"url\": \"/v2/orders/{id}\" }, { \"name\": \"CORS misconfiguration\", \"url\": \"/v2/profile\" } ], \"_note\": \"SYNTHETIC SAMPLE\" }", recordedAt: "2026-08-10T10:30:00Z", dataOrigin: "imported" },
  { id: "sr-006a", scanId: "scn-006", tool: "owasp_zap", summary: "Retest sample: previous IDOR indicator no longer reproduced", itemsFound: 0, rawOutput: "{ \"alerts\": [], \"_note\": \"SYNTHETIC SAMPLE retest\" }", recordedAt: "2026-09-22T09:25:00Z", dataOrigin: "imported" },
];

/* ------------------------------- Findings -------------------------------- */
interface FindingSeed {
  id: string;
  key: string;
  targetId: string;
  scanId?: string;
  status: VerificationStatus;
  assessor: string;
  at: string;
  origin: DataOrigin;
  host: string;
}

const findingSeeds: FindingSeed[] = [
  { id: "fnd-001", key: "reflected_xss", targetId: "tgt-001", scanId: "scn-001", status: "confirmed", assessor: "usr-jkim", at: "2026-09-18T10:20:00Z", origin: "imported", host: "shop.northwind.example" },
  { id: "fnd-002", key: "sqli_error", targetId: "tgt-001", scanId: "scn-001", status: "pending", assessor: "usr-jkim", at: "2026-09-18T10:25:00Z", origin: "imported", host: "shop.northwind.example" },
  { id: "fnd-003", key: "missing_hsts", targetId: "tgt-001", scanId: "scn-001", status: "confirmed", assessor: "usr-pnat", at: "2026-09-18T10:40:00Z", origin: "imported", host: "shop.northwind.example" },
  { id: "fnd-004", key: "missing_csp", targetId: "tgt-001", scanId: "scn-001", status: "confirmed", assessor: "usr-pnat", at: "2026-09-18T10:40:00Z", origin: "imported", host: "shop.northwind.example" },
  { id: "fnd-005", key: "cookie_flags", targetId: "tgt-001", scanId: "scn-001", status: "confirmed", assessor: "usr-pnat", at: "2026-09-18T10:40:00Z", origin: "imported", host: "shop.northwind.example" },
  { id: "fnd-006", key: "git_exposed", targetId: "tgt-001", scanId: "scn-001", status: "pending", assessor: "usr-jkim", at: "2026-09-18T10:33:00Z", origin: "imported", host: "shop.northwind.example" },
  { id: "fnd-007", key: "directory_listing", targetId: "tgt-001", scanId: "scn-001", status: "rejected", assessor: "usr-pnat", at: "2026-09-18T10:30:00Z", origin: "imported", host: "shop.northwind.example" },
  { id: "fnd-008", key: "open_db_port", targetId: "tgt-001", scanId: "scn-002", status: "confirmed", assessor: "usr-jkim", at: "2026-09-16T13:22:00Z", origin: "imported", host: "shop.northwind.example" },
  { id: "fnd-009", key: "server_banner", targetId: "tgt-001", scanId: "scn-001", status: "needs_review", assessor: "usr-pnat", at: "2026-09-18T10:40:00Z", origin: "imported", host: "shop.northwind.example" },
  { id: "fnd-010", key: "price_tamper", targetId: "tgt-001", status: "pending", assessor: "usr-jkim", at: "2026-10-27T14:00:00Z", origin: "user_created", host: "shop.northwind.example" },
  { id: "fnd-011", key: "admin_forced_browse", targetId: "tgt-002", scanId: "scn-003", status: "pending", assessor: "usr-jkim", at: "2026-10-20T09:48:00Z", origin: "simulated", host: "admin.northwind.example" },
  { id: "fnd-012", key: "session_fixation", targetId: "tgt-002", status: "confirmed", assessor: "usr-pnat", at: "2026-10-22T11:00:00Z", origin: "user_created", host: "admin.northwind.example" },
  { id: "fnd-013", key: "username_enum", targetId: "tgt-003", scanId: "scn-004", status: "confirmed", assessor: "usr-mvil", at: "2026-09-02T10:30:00Z", origin: "simulated", host: "portal.helix-lab.test" },
  { id: "fnd-014", key: "no_lockout", targetId: "tgt-003", status: "confirmed", assessor: "usr-pnat", at: "2026-09-04T15:00:00Z", origin: "user_created", host: "portal.helix-lab.test" },
  { id: "fnd-015", key: "stack_trace", targetId: "tgt-003", scanId: "scn-004", status: "needs_review", assessor: "usr-mvil", at: "2026-09-02T10:50:00Z", origin: "simulated", host: "portal.helix-lab.test" },
  { id: "fnd-016", key: "directory_listing", targetId: "tgt-003", scanId: "scn-004", status: "pending", assessor: "usr-mvil", at: "2026-09-02T11:05:00Z", origin: "simulated", host: "portal.helix-lab.test" },
  { id: "fnd-017", key: "tls_legacy", targetId: "tgt-003", scanId: "scn-004", status: "rejected", assessor: "usr-pnat", at: "2026-09-02T10:15:00Z", origin: "simulated", host: "portal.helix-lab.test" },
  { id: "fnd-018", key: "cookie_flags", targetId: "tgt-003", scanId: "scn-004", status: "pending", assessor: "usr-mvil", at: "2026-10-14T10:00:00Z", origin: "simulated", host: "portal.helix-lab.test" },
  { id: "fnd-019", key: "idor_orders", targetId: "tgt-004", scanId: "scn-005", status: "confirmed", assessor: "usr-jkim", at: "2026-08-10T10:10:00Z", origin: "imported", host: "api.orbital.example" },
  { id: "fnd-020", key: "cors_wildcard", targetId: "tgt-004", scanId: "scn-005", status: "confirmed", assessor: "usr-jkim", at: "2026-08-10T10:20:00Z", origin: "imported", host: "api.orbital.example" },
  { id: "fnd-021", key: "stack_trace", targetId: "tgt-004", scanId: "scn-005", status: "rejected", assessor: "usr-jkim", at: "2026-08-11T09:00:00Z", origin: "imported", host: "api.orbital.example" },
  { id: "fnd-022", key: "server_banner", targetId: "tgt-004", scanId: "scn-005", status: "confirmed", assessor: "usr-jkim", at: "2026-08-12T09:00:00Z", origin: "imported", host: "api.orbital.example" },
  { id: "fnd-023", key: "backup_file", targetId: "tgt-006", status: "confirmed", assessor: "usr-jkim", at: "2025-10-20T09:00:00Z", origin: "synthetic", host: "intranet.legacy.test" },
];

const targetProject = Object.fromEntries(seedTargets.map((t) => [t.id, t.projectId]));

function buildFinding(s: FindingSeed, index: number): VulnerabilityFinding {
  const t = TEMPLATE_BY_KEY[s.key]!;
  return {
    id: s.id,
    code: `FND-${String(index + 1).padStart(4, "0")}`,
    title: t.title,
    description: t.description,
    projectId: targetProject[s.targetId]!,
    targetId: s.targetId,
    scanId: s.scanId,
    category: t.category,
    severity: t.severity,
    affectedAsset: t.path.startsWith("tcp/") ? `${s.host} ${t.path}` : `https://${s.host}${t.path}`,
    parameter: t.parameter,
    sourceTool: t.sourceTool,
    verificationStatus: s.status,
    assignedAssessorId: s.assessor,
    discoveredAt: s.at,
    updatedAt: s.at,
    impact: t.impact,
    remediation: t.remediation,
    cwe: t.cwe,
    owasp: t.owasp,
    templateKey: t.key,
    dataOrigin: s.origin,
  };
}

export const seedFindings: VulnerabilityFinding[] = findingSeeds.map(buildFinding);

export const seedEvidence: Evidence[] = findingSeeds.flatMap((s) => {
  const t = TEMPLATE_BY_KEY[s.key]!;
  return t.evidence.map((e, i) => ({
    id: `ev-${s.id}-${i + 1}`,
    findingId: s.id,
    type: e.type,
    title: e.title,
    content: e.content.replaceAll("{host}", s.host),
    source: t.sourceTool,
    capturedAt: s.at,
    reviewed: s.status === "confirmed" || s.status === "rejected",
    reviewedBy: s.status === "confirmed" || s.status === "rejected" ? s.assessor : undefined,
    dataOrigin: s.origin === "user_created" ? "user_created" : s.origin,
  }));
});

const addHours = (iso: string, h: number) => new Date(new Date(iso).getTime() + h * 3600_000).toISOString();

const decisionText: Record<VerificationStatus, { notes: string; reason: string }> = {
  confirmed: { notes: "Reproduced manually in the authorized environment using the documented steps. Evidence reviewed and attached.", reason: "Behaviour reproduced; impact consistent with description." },
  rejected: { notes: "Could not reproduce. Behaviour is expected/compensated in this environment.", reason: "False positive — compensating control verified." },
  needs_review: { notes: "Partially reproduced. Requires confirmation with the system owner before final decision.", reason: "Insufficient evidence for a final decision." },
  pending: { notes: "", reason: "" },
};

export const seedVerifications: Verification[] = findingSeeds
  .filter((s) => s.status !== "pending")
  .map((s) => ({
    id: `ver-${s.id}`,
    findingId: s.id,
    fromStatus: "pending" as const,
    toStatus: s.status,
    assessorId: s.assessor,
    notes: decisionText[s.status].notes,
    decisionReason: decisionText[s.status].reason,
    evidenceReviewed: true,
    decidedAt: addHours(s.at, 26),
  }));

/* --------------------------------- Risks --------------------------------- */
export const seedRisks: Risk[] = seedFindings
  .filter((f) => f.verificationStatus === "confirmed")
  .map((f, i) => {
    const base = defaultRiskInputs(f.severity);
    const mitigation = ["fnd-019", "fnd-022", "fnd-023"].includes(f.id) ? "mitigated" : i % 3 === 0 ? "in_progress" : "not_started";
    return {
      id: `rsk-${f.id.slice(4)}`,
      findingId: f.id,
      title: f.title,
      likelihood: base.likelihood,
      impact: base.impact,
      ownerId: f.assignedAssessorId,
      mitigationStatus: mitigation,
      reviewDate: addHours(f.discoveredAt, 24 * 30),
      notes: "Demo risk rating derived from reported severity (likelihood × impact). Not a CVSS score.",
      createdAt: addHours(f.discoveredAt, 27),
      updatedAt: addHours(f.discoveredAt, 27),
    } satisfies Risk;
  });

/* ------------------------------ Remediation ------------------------------ */
export const seedRemediation: RemediationTask[] = [
  {
    id: "rem-001", code: "REM-0001", findingId: "fnd-001", title: "Encode search output and add CSP", description: "Fix reflected XSS in /search and introduce CSP in report-only mode.",
    recommendation: TEMPLATE_BY_KEY.reflected_xss!.remediation, ownerId: "usr-pnat", priority: "high", status: "in_progress", dueDate: "2026-11-20T00:00:00Z",
    retestRequired: true, retestResult: "pending", createdAt: "2026-09-21T09:00:00Z", updatedAt: "2026-10-30T09:00:00Z",
    history: [
      { at: "2026-09-21T09:00:00Z", by: "usr-jkim", to: "open", note: "Created from confirmed finding FND-0001." },
      { at: "2026-10-30T09:00:00Z", by: "usr-pnat", from: "open", to: "in_progress", note: "Developer fix in review (fictional PR)." },
    ],
  },
  {
    id: "rem-002", code: "REM-0002", findingId: "fnd-005", title: "Harden session cookie attributes", description: "Enable Secure, HttpOnly and SameSite on SESSIONID.",
    recommendation: TEMPLATE_BY_KEY.cookie_flags!.remediation, ownerId: "usr-pnat", priority: "medium", status: "awaiting_retest", dueDate: "2026-11-10T00:00:00Z",
    retestRequired: true, retestResult: "pending", createdAt: "2026-09-21T09:10:00Z", updatedAt: "2026-11-06T09:00:00Z",
    history: [
      { at: "2026-09-21T09:10:00Z", by: "usr-jkim", to: "open", note: "Created from confirmed finding FND-0005." },
      { at: "2026-10-12T09:00:00Z", by: "usr-pnat", from: "open", to: "in_progress", note: "Config change scheduled." },
      { at: "2026-11-06T09:00:00Z", by: "usr-pnat", from: "in_progress", to: "awaiting_retest", note: "Owner reports fix deployed to staging." },
    ],
  },
  {
    id: "rem-003", code: "REM-0003", findingId: "fnd-008", title: "Restrict MySQL to application network", description: "Firewall 3306 and bind to private interface.",
    recommendation: TEMPLATE_BY_KEY.open_db_port!.remediation, ownerId: "usr-jkim", priority: "high", status: "open", dueDate: "2026-11-05T00:00:00Z",
    retestRequired: true, retestResult: "pending", createdAt: "2026-09-19T09:00:00Z", updatedAt: "2026-09-19T09:00:00Z",
    history: [{ at: "2026-09-19T09:00:00Z", by: "usr-jkim", to: "open", note: "Created from confirmed finding FND-0008." }],
  },
  {
    id: "rem-004", code: "REM-0004", findingId: "fnd-019", title: "Enforce object-level authorization on /v2/orders", description: "Add ownership check to order lookups.",
    recommendation: TEMPLATE_BY_KEY.idor_orders!.remediation, ownerId: "usr-jkim", priority: "critical", status: "resolved", dueDate: "2026-09-15T00:00:00Z",
    retestRequired: true, retestResult: "passed", approvedBy: "usr-jkim", approvedAt: "2026-09-22T10:00:00Z", createdAt: "2026-08-12T09:00:00Z", updatedAt: "2026-09-22T10:00:00Z",
    history: [
      { at: "2026-08-12T09:00:00Z", by: "usr-jkim", to: "open", note: "Created from confirmed finding FND-0019." },
      { at: "2026-08-20T09:00:00Z", by: "usr-jkim", from: "open", to: "in_progress", note: "Owner implementing fix." },
      { at: "2026-09-12T09:00:00Z", by: "usr-jkim", from: "in_progress", to: "awaiting_retest", note: "Fix deployed to QA." },
      { at: "2026-09-22T10:00:00Z", by: "usr-jkim", from: "awaiting_retest", to: "resolved", note: "Retest SCN-0006 passed (imported sample). Approved by assessor." },
    ],
  },
  {
    id: "rem-005", code: "REM-0005", findingId: "fnd-022", title: "Suppress server version banners", description: "Remove version tokens from API gateway responses.",
    recommendation: TEMPLATE_BY_KEY.server_banner!.remediation, ownerId: "usr-jkim", priority: "low", status: "accepted_risk", dueDate: "2026-10-01T00:00:00Z",
    retestRequired: false, retestResult: "not_required", approvedBy: "usr-admin", approvedAt: "2026-09-25T10:00:00Z", createdAt: "2026-08-13T09:00:00Z", updatedAt: "2026-09-25T10:00:00Z",
    history: [
      { at: "2026-08-13T09:00:00Z", by: "usr-jkim", to: "open", note: "Created from confirmed finding FND-0022." },
      { at: "2026-09-25T10:00:00Z", by: "usr-admin", from: "open", to: "accepted_risk", note: "Risk accepted by owner: gateway is internal-only QA (fictional)." },
    ],
  },
  {
    id: "rem-006", code: "REM-0006", findingId: "fnd-014", title: "Add login throttling to patient portal", description: "Progressive delays after failed logins.",
    recommendation: TEMPLATE_BY_KEY.no_lockout!.remediation, ownerId: "usr-mvil", priority: "high", status: "open", dueDate: "2026-11-25T00:00:00Z",
    retestRequired: true, retestResult: "pending", createdAt: "2026-09-08T09:00:00Z", updatedAt: "2026-09-08T09:00:00Z",
    history: [{ at: "2026-09-08T09:00:00Z", by: "usr-pnat", to: "open", note: "Created from confirmed finding FND-0014." }],
  },
];

/* --------------------------------- Recon --------------------------------- */
export const seedHosts: Host[] = [
  { id: "hst-001", targetId: "tgt-001", scanId: "scn-002", hostname: "shop.northwind.example", ipAddress: "192.0.2.10", state: "up", osGuess: "Linux 5.x (sample)", source: "nmap", observedAt: "2026-09-16T13:10:00Z", dataOrigin: "imported" },
  { id: "hst-002", targetId: "tgt-001", scanId: "scn-002", hostname: "static.northwind.example", ipAddress: "192.0.2.11", state: "up", osGuess: "Linux 5.x (sample)", source: "nmap", observedAt: "2026-09-16T13:12:00Z", dataOrigin: "imported" },
  { id: "hst-003", targetId: "tgt-002", hostname: "admin.northwind.example", ipAddress: "192.0.2.20", state: "up", source: "nmap", observedAt: "2026-10-20T09:05:00Z", dataOrigin: "simulated" },
  { id: "hst-004", targetId: "tgt-003", scanId: "scn-004", hostname: "portal.helix-lab.test", ipAddress: "203.0.113.20", state: "up", osGuess: "Linux (sample)", source: "nmap", observedAt: "2026-09-02T10:10:00Z", dataOrigin: "simulated" },
  { id: "hst-005", targetId: "tgt-003", scanId: "scn-004", hostname: "api.helix-lab.test", ipAddress: "203.0.113.21", state: "up", source: "nmap", observedAt: "2026-09-02T10:11:00Z", dataOrigin: "simulated" },
  { id: "hst-006", targetId: "tgt-004", scanId: "scn-005", hostname: "api.orbital.example", ipAddress: "198.51.100.40", state: "up", osGuess: "Linux (sample)", source: "nmap", observedAt: "2026-08-10T09:10:00Z", dataOrigin: "imported" },
];

const port = (id: string, hostId: string, p: number, service: string, version: string, at: string, origin: DataOrigin, state: Port["state"] = "open"): Port => ({
  id, hostId, port: p, protocol: "tcp", state, service, version, source: "nmap", observedAt: at, dataOrigin: origin,
});

export const seedPorts: Port[] = [
  port("prt-001", "hst-001", 22, "ssh", "OpenSSH 8.9p1", "2026-09-16T13:15:00Z", "imported"),
  port("prt-002", "hst-001", 80, "http", "nginx 1.18.0", "2026-09-16T13:15:00Z", "imported"),
  port("prt-003", "hst-001", 443, "https", "nginx 1.18.0", "2026-09-16T13:15:00Z", "imported"),
  port("prt-004", "hst-001", 3306, "mysql", "MySQL 8.0.x", "2026-09-16T13:15:00Z", "imported"),
  port("prt-005", "hst-002", 443, "https", "nginx 1.18.0", "2026-09-16T13:16:00Z", "imported"),
  port("prt-006", "hst-003", 443, "https", "nginx 1.22.1", "2026-10-20T09:06:00Z", "simulated"),
  port("prt-007", "hst-004", 22, "ssh", "OpenSSH 9.3", "2026-09-02T10:12:00Z", "simulated"),
  port("prt-008", "hst-004", 443, "https", "Caddy 2.x", "2026-09-02T10:12:00Z", "simulated"),
  port("prt-009", "hst-004", 8443, "https-alt", "Node.js Express", "2026-09-02T10:12:00Z", "simulated"),
  port("prt-010", "hst-005", 443, "https", "Caddy 2.x", "2026-09-02T10:13:00Z", "simulated"),
  port("prt-011", "hst-006", 443, "https", "Envoy proxy", "2026-08-10T09:12:00Z", "imported"),
  port("prt-012", "hst-006", 8080, "http-proxy", "Envoy admin (sample)", "2026-08-10T09:12:00Z", "imported", "filtered"),
];

export const seedDns: DnsRecord[] = [
  { id: "dns-001", targetId: "tgt-001", name: "shop.northwind.example", type: "A", value: "192.0.2.10", ttl: 300, source: "dns_utils", observedAt: "2026-09-16T13:20:00Z", dataOrigin: "imported" },
  { id: "dns-002", targetId: "tgt-001", name: "static.northwind.example", type: "A", value: "192.0.2.11", ttl: 300, source: "dns_utils", observedAt: "2026-09-16T13:20:00Z", dataOrigin: "imported" },
  { id: "dns-003", targetId: "tgt-001", name: "northwind.example", type: "MX", value: "10 mail.northwind.example", ttl: 3600, source: "dns_utils", observedAt: "2026-09-16T13:20:00Z", dataOrigin: "imported" },
  { id: "dns-004", targetId: "tgt-001", name: "northwind.example", type: "TXT", value: "\"v=spf1 -all\"", ttl: 3600, source: "dns_utils", observedAt: "2026-09-16T13:20:00Z", dataOrigin: "imported" },
  { id: "dns-005", targetId: "tgt-002", name: "admin.northwind.example", type: "CNAME", value: "lb-staging.northwind.example", ttl: 300, source: "dns_utils", observedAt: "2026-10-20T09:02:00Z", dataOrigin: "simulated" },
  { id: "dns-006", targetId: "tgt-003", name: "portal.helix-lab.test", type: "A", value: "203.0.113.20", ttl: 600, source: "dns_utils", observedAt: "2026-09-02T09:30:00Z", dataOrigin: "simulated" },
  { id: "dns-007", targetId: "tgt-003", name: "api.helix-lab.test", type: "A", value: "203.0.113.21", ttl: 600, source: "dns_utils", observedAt: "2026-09-02T09:30:00Z", dataOrigin: "simulated" },
  { id: "dns-008", targetId: "tgt-004", name: "api.orbital.example", type: "AAAA", value: "2001:db8::40", ttl: 300, source: "dns_utils", observedAt: "2026-08-10T09:05:00Z", dataOrigin: "imported" },
];

const ep = (id: string, targetId: string, method: Endpoint["method"], path: string, statusCode: number, contentType: string, authRequired: boolean, source: Endpoint["source"], at: string, origin: DataOrigin): Endpoint => ({
  id, targetId, method, path, statusCode, contentType, authRequired, source, observedAt: at, dataOrigin: origin,
});

export const seedEndpoints: Endpoint[] = [
  ep("ept-001", "tgt-001", "GET", "/", 200, "text/html", false, "owasp_zap", "2026-09-18T09:10:00Z", "imported"),
  ep("ept-002", "tgt-001", "GET", "/search?q=", 200, "text/html", false, "owasp_zap", "2026-09-18T09:12:00Z", "imported"),
  ep("ept-003", "tgt-001", "GET", "/products?category=", 200, "text/html", false, "owasp_zap", "2026-09-18T09:13:00Z", "imported"),
  ep("ept-004", "tgt-001", "GET", "/uploads/", 200, "text/html", false, "owasp_zap", "2026-09-18T09:20:00Z", "imported"),
  ep("ept-005", "tgt-001", "POST", "/api/cart", 201, "application/json", true, "owasp_zap", "2026-09-18T09:25:00Z", "imported"),
  ep("ept-006", "tgt-001", "POST", "/api/checkout", 201, "application/json", true, "owasp_zap", "2026-09-18T09:26:00Z", "imported"),
  ep("ept-007", "tgt-001", "GET", "/.git/HEAD", 200, "text/plain", false, "owasp_zap", "2026-09-18T09:30:00Z", "imported"),
  ep("ept-008", "tgt-002", "GET", "/admin/reports", 200, "text/html", true, "owasp_zap", "2026-10-20T09:20:00Z", "simulated"),
  ep("ept-009", "tgt-002", "POST", "/login", 302, "text/html", false, "http_inspector", "2026-10-20T09:15:00Z", "simulated"),
  ep("ept-010", "tgt-003", "POST", "/login", 200, "application/json", false, "owasp_zap", "2026-09-02T09:40:00Z", "simulated"),
  ep("ept-011", "tgt-003", "GET", "/account/appointments", 200, "application/json", true, "owasp_zap", "2026-09-02T09:45:00Z", "simulated"),
  ep("ept-012", "tgt-004", "GET", "/v2/orders/{id}", 200, "application/json", true, "owasp_zap", "2026-08-10T09:20:00Z", "imported"),
  ep("ept-013", "tgt-004", "GET", "/v2/profile", 200, "application/json", true, "owasp_zap", "2026-08-10T09:21:00Z", "imported"),
  ep("ept-014", "tgt-004", "GET", "/v2/shipments", 200, "application/json", true, "owasp_zap", "2026-08-10T09:22:00Z", "imported"),
];

export const seedReconRuns: ReconRun[] = [
  { id: "rcn-001", targetId: "tgt-001", tool: "nmap", label: "Imported sample Nmap XML (SCN-0002)", recordsAdded: 7, ranAt: "2026-09-16T13:22:00Z", dataOrigin: "imported" },
  { id: "rcn-002", targetId: "tgt-001", tool: "dns_utils", label: "Imported sample DNS lookup", recordsAdded: 4, ranAt: "2026-09-16T13:20:00Z", dataOrigin: "imported" },
  { id: "rcn-003", targetId: "tgt-001", tool: "owasp_zap", label: "Imported sample ZAP spider endpoints", recordsAdded: 7, ranAt: "2026-09-18T09:30:00Z", dataOrigin: "imported" },
  { id: "rcn-004", targetId: "tgt-003", tool: "nmap", label: "Simulated discovery (SCN-0004)", recordsAdded: 6, ranAt: "2026-09-02T10:13:00Z", dataOrigin: "simulated" },
  { id: "rcn-005", targetId: "tgt-004", tool: "owasp_zap", label: "Imported sample API endpoint inventory", recordsAdded: 3, ranAt: "2026-08-10T09:22:00Z", dataOrigin: "imported" },
];

/* ------------------------------ Assessments ------------------------------ */
function buildAssessment(projectId: string, category: AssessmentCategoryId, assessorId: string, status: Assessment["status"], results: ChecklistResult[], updatedAt: string): Assessment {
  const meta = CATEGORIES.find((c) => c.id === category)!;
  return {
    id: `asm-${projectId.slice(4)}-${category}`,
    projectId,
    category,
    status,
    assessorId,
    updatedAt,
    checklist: meta.checklist.map((item, i) => ({
      id: `chk-${projectId.slice(4)}-${category}-${i + 1}`,
      title: item.title,
      kind: item.kind,
      tool: item.tool,
      result: results[i] ?? "not_tested",
      observation: results[i] === "fail" ? "Issue observed — see linked finding." : results[i] === "pass" ? "Control behaved as expected." : "",
      evidenceNote: "",
    })),
  };
}

export const seedAssessments: Assessment[] = [
  buildAssessment("prj-001", "authentication", "usr-pnat", "in_progress", ["pass", "not_tested", "pass"], "2026-10-28T10:00:00Z"),
  buildAssessment("prj-001", "access_control", "usr-jkim", "in_progress", ["pass", "fail", "fail"], "2026-10-21T10:00:00Z"),
  buildAssessment("prj-001", "injection", "usr-jkim", "in_progress", ["fail", "not_tested", "fail", "not_tested"], "2026-09-25T10:00:00Z"),
  buildAssessment("prj-001", "session", "usr-pnat", "completed", ["fail", "fail", "pass", "pass"], "2026-10-23T10:00:00Z"),
  buildAssessment("prj-001", "exposed_files", "usr-jkim", "in_progress", ["pass", "pass", "fail"], "2026-09-25T10:00:00Z"),
  buildAssessment("prj-001", "info_disclosure", "usr-pnat", "not_started", [], "2026-09-14T10:00:00Z"),
  buildAssessment("prj-001", "config_https", "usr-pnat", "completed", ["pass", "fail", "fail", "pass", "fail"], "2026-09-30T10:00:00Z"),
  buildAssessment("prj-001", "business_logic", "usr-jkim", "in_progress", ["not_tested", "fail"], "2026-10-27T10:00:00Z"),
  buildAssessment("prj-002", "authentication", "usr-pnat", "completed", ["pass", "fail", "fail", "pass", "pass", "pass"], "2026-09-06T10:00:00Z"),
  buildAssessment("prj-002", "session", "usr-mvil", "in_progress", ["fail", "pass"], "2026-10-14T10:00:00Z"),
  buildAssessment("prj-002", "info_disclosure", "usr-mvil", "in_progress", ["pass", "fail"], "2026-09-03T10:00:00Z"),
  buildAssessment("prj-002", "config_https", "usr-pnat", "completed", ["pass", "pass", "pass", "pass", "pass"], "2026-09-03T10:00:00Z"),
  buildAssessment("prj-002", "exposed_files", "usr-mvil", "in_progress", ["fail"], "2026-09-03T10:00:00Z"),
  buildAssessment("prj-002", "access_control", "usr-mvil", "blocked", [], "2026-09-03T10:00:00Z"),
  buildAssessment("prj-003", "access_control", "usr-jkim", "completed", ["fail", "pass", "pass", "fail", "fail"], "2026-09-22T10:00:00Z"),
  buildAssessment("prj-003", "info_disclosure", "usr-jkim", "completed", ["fail", "pass", "pass", "pass"], "2026-09-22T10:00:00Z"),
  buildAssessment("prj-003", "config_https", "usr-jkim", "completed", ["pass", "pass", "pass", "pass", "pass"], "2026-09-22T10:00:00Z"),
  buildAssessment("prj-003", "injection", "usr-jkim", "completed", ["pass", "pass", "pass", "pass", "pass"], "2026-09-22T10:00:00Z"),
];

/* ---------------------------------- AI ----------------------------------- */
export const seedAIAnalyses: AIAnalysis[] = [
  (() => {
    const t = TEMPLATE_BY_KEY.reflected_xss!;
    return {
      id: "ai-001", mode: "vulnerability_explanation", projectId: "prj-001", targetId: "tgt-001", scanId: "scn-001", findingId: "fnd-001",
      title: `Vulnerability explanation — ${t.title}`, interpretation: t.sample.interpretation, explanation: t.sample.explanation,
      suggestedSeverity: t.sample.suggestedSeverity, potentialImpact: t.impact, recommendations: t.sample.remediation, verificationSteps: t.sample.verification,
      reasoning: t.sample.reasoning, evidenceRefs: ["ev-fnd-001-1", "ev-fnd-001-2"], confidenceCaveat: "Sample analysis from the demo adapter. Requires human verification.",
      status: "acknowledged", generatedAt: "2026-09-19T09:00:00Z", generatedBy: "usr-jkim", adapter: "demo",
    } satisfies AIAnalysis;
  })(),
  (() => {
    const t = TEMPLATE_BY_KEY.sqli_error!;
    return {
      id: "ai-002", mode: "risk_prioritization", projectId: "prj-001", targetId: "tgt-001", scanId: "scn-001", findingId: "fnd-002",
      title: `Risk prioritization — ${t.title}`, interpretation: t.sample.priority, explanation: t.sample.explanation,
      suggestedSeverity: t.sample.suggestedSeverity, potentialImpact: t.impact, recommendations: t.sample.remediation, verificationSteps: t.sample.verification,
      reasoning: t.sample.reasoning, evidenceRefs: ["ev-fnd-002-2"], confidenceCaveat: "Sample analysis from the demo adapter. Requires human verification.",
      status: "sent_to_verification", generatedAt: "2026-09-19T09:30:00Z", generatedBy: "usr-jkim", adapter: "demo",
    } satisfies AIAnalysis;
  })(),
];

/* -------------------------------- Reports -------------------------------- */
export const seedReports: Report[] = [
  {
    id: "rpt-001", code: "RPT-0001", title: "Orbital API Gateway — Final Assessment Report", projectId: "prj-003", targetIds: ["tgt-004"], templateId: "technical",
    periodStart: "2026-08-03T00:00:00Z", periodEnd: "2026-09-25T00:00:00Z", findingIds: ["fnd-019", "fnd-020", "fnd-022"], includeUnverified: false,
    sections: ["cover", "assessment_info", "executive_summary", "scope", "methodology", "tools", "findings_summary", "severity_distribution", "detailed_findings", "evidence", "risk_assessment", "remediation", "conclusion", "assessor_info"],
    executiveSummary: "The assessment of the fictional Orbital Logistics API identified one critical broken access control issue, since remediated and retested, along with a medium CORS misconfiguration and a low-severity information disclosure.",
    status: "final", createdBy: "usr-jkim", createdAt: "2026-09-26T09:00:00Z", updatedAt: "2026-09-26T09:00:00Z", generatedFrom: "demonstration_data",
  },
  {
    id: "rpt-002", code: "RPT-0002", title: "Helix Patient Portal — Interim Report (Draft)", projectId: "prj-002", targetIds: ["tgt-003"], templateId: "executive",
    periodStart: "2026-08-24T00:00:00Z", periodEnd: "2026-10-31T00:00:00Z", findingIds: ["fnd-013", "fnd-014"], includeUnverified: true,
    sections: ["cover", "assessment_info", "executive_summary", "scope", "findings_summary", "severity_distribution", "risk_assessment", "unverified_observations", "conclusion", "assessor_info"],
    executiveSummary: "Interim results show weaknesses in authentication controls of the fictional patient portal lab build. Several observations remain under verification.",
    status: "draft", createdBy: "usr-pnat", createdAt: "2026-11-01T09:00:00Z", updatedAt: "2026-11-01T09:00:00Z", generatedFrom: "demonstration_data",
  },
];

/* -------------------------------- Activity ------------------------------- */
const act = (id: string, type: ActivityLog["type"], userId: string, timestamp: string, entityType: ActivityLog["entityType"], entityId: string | undefined, entityLabel: string, description: string): ActivityLog => ({
  id, type, userId, timestamp, entityType, entityId, entityLabel, description,
});

export const seedActivity: ActivityLog[] = [
  act("act-001", "project_created", "usr-jkim", "2026-07-29T10:00:00Z", "project", "prj-003", "AEG-2026-003", "Created project Orbital API Gateway Security Test"),
  act("act-002", "target_registered", "usr-jkim", "2026-07-30T10:00:00Z", "target", "tgt-004", "Orbital Logistics API (QA)", "Registered target with authorization reference QA-SEC-ORB-07"),
  act("act-003", "finding_confirmed", "usr-jkim", "2026-08-11T12:10:00Z", "finding", "fnd-019", "FND-0019", "Confirmed IDOR on order details API after manual reproduction"),
  act("act-004", "remediation_created", "usr-jkim", "2026-08-12T09:00:00Z", "remediation", "rem-004", "REM-0004", "Created remediation task for FND-0019"),
  act("act-005", "project_created", "usr-pnat", "2026-08-20T10:00:00Z", "project", "prj-002", "AEG-2026-002", "Created project Helix Patient Portal (Lab) Review"),
  act("act-006", "target_registered", "usr-pnat", "2026-08-21T10:00:00Z", "target", "tgt-003", "Helix Patient Portal (Lab)", "Registered lab target"),
  act("act-007", "demo_scan_started", "usr-pnat", "2026-09-02T09:03:00Z", "scan", "scn-004", "SCN-0004", "Started demo simulation for patient portal (SIMULATED)"),
  act("act-008", "finding_confirmed", "usr-mvil", "2026-09-03T12:30:00Z", "finding", "fnd-013", "FND-0013", "Confirmed username enumeration on /login"),
  act("act-009", "project_created", "usr-jkim", "2026-09-10T10:00:00Z", "project", "prj-001", "AEG-2026-001", "Created project Northwind Retail Portal Assessment"),
  act("act-010", "target_registered", "usr-jkim", "2026-09-11T10:00:00Z", "target", "tgt-001", "Northwind Storefront (Staging)", "Registered storefront target"),
  act("act-011", "scope_updated", "usr-jkim", "2026-09-12T09:00:00Z", "target", "tgt-001", "Northwind Storefront (Staging)", "Excluded /api/payments/* and /admin/* from storefront scope"),
  act("act-012", "recon_imported", "usr-pnat", "2026-09-16T13:22:00Z", "scan", "scn-002", "SCN-0002", "Imported sample Nmap and DNS results"),
  act("act-013", "finding_confirmed", "usr-jkim", "2026-09-19T12:20:00Z", "finding", "fnd-001", "FND-0001", "Confirmed reflected XSS in /search"),
  act("act-014", "finding_rejected", "usr-pnat", "2026-09-19T12:30:00Z", "finding", "fnd-007", "FND-0007", "Rejected directory listing: path serves intended public assets"),
  act("act-015", "remediation_updated", "usr-jkim", "2026-09-22T10:00:00Z", "remediation", "rem-004", "REM-0004", "Marked resolved after passed retest (manual approval)"),
  act("act-016", "report_generated", "usr-jkim", "2026-09-26T09:00:00Z", "report", "rpt-001", "RPT-0001", "Generated final demo report for Orbital API"),
  act("act-017", "demo_scan_started", "usr-jkim", "2026-10-20T09:01:00Z", "scan", "scn-003", "SCN-0003", "Started demo simulation for admin console (SIMULATED)"),
  act("act-018", "finding_confirmed", "usr-pnat", "2026-10-23T13:00:00Z", "finding", "fnd-012", "FND-0012", "Confirmed session fixation on admin login"),
  act("act-019", "report_generated", "usr-pnat", "2026-11-01T09:00:00Z", "report", "rpt-002", "RPT-0002", "Generated interim draft report for Helix portal"),
  act("act-020", "project_created", "usr-mvil", "2026-11-03T10:00:00Z", "project", "prj-004", "AEG-2026-004", "Created project Campus LMS Staging Assessment"),
  act("act-021", "remediation_updated", "usr-pnat", "2026-11-06T09:00:00Z", "remediation", "rem-002", "REM-0002", "Moved to Awaiting Retest"),
  act("act-022", "settings_changed", "usr-admin", "2026-11-07T15:00:00Z", "settings", undefined, "Assessment defaults", "Set default request rate to 5 req/s"),
];

/* ----------------------------- Notifications ----------------------------- */
export const seedNotifications: Notification[] = [
  { id: "ntf-001", title: "Remediation overdue", message: "REM-0003 (Restrict MySQL to application network) passed its due date.", tone: "critical", createdAt: "2026-11-06T08:00:00Z", read: false, link: "/remediation?task=rem-003" },
  { id: "ntf-002", title: "Retest requested", message: "REM-0002 is awaiting retest on Northwind Storefront.", tone: "warning", createdAt: "2026-11-06T09:00:00Z", read: false, link: "/remediation?task=rem-002" },
  { id: "ntf-003", title: "Findings awaiting verification", message: "7 findings across 3 targets are pending human verification.", tone: "info", createdAt: "2026-11-08T09:00:00Z", read: false, link: "/findings?status=unverified" },
  { id: "ntf-004", title: "Authorization pending", message: "Campus LMS (Local Dev) cannot be assessed until authorization is confirmed.", tone: "warning", createdAt: "2026-11-03T11:00:00Z", read: true, link: "/targets/tgt-005" },
  { id: "ntf-005", title: "Report drafted", message: "RPT-0002 Helix Patient Portal interim report is ready for review.", tone: "success", createdAt: "2026-11-01T09:05:00Z", read: true, link: "/reports/rpt-002" },
];

/* ------------------------------ Integrations ----------------------------- */
export const seedIntegrations: Integration[] = [
  { id: "nmap", name: "Nmap", purpose: "Host discovery, port scanning and service identification.", integrationType: "Isolated scanner worker (CLI)", status: "not_connected", lastUsedAt: "2026-09-16T13:22:00Z", features: ["Host discovery", "TCP/UDP port enumeration", "Service & version detection", "XML output import"], setupSteps: ["Deploy the AEGIS scan worker in an isolated network segment.", "Install Nmap on the worker host (not in the browser).", "Register the worker with the backend using a server-side credential.", "Backend validates every job against the target's approved scope before dispatch."], futureEndpoint: "POST /api/scans/:id/jobs { tool: 'nmap' }" },
  { id: "owasp_zap", name: "OWASP ZAP", purpose: "Web application spidering and passive/active vulnerability checks.", integrationType: "ZAP daemon via backend API proxy", status: "not_connected", lastUsedAt: "2026-09-18T10:41:00Z", features: ["Spider / AJAX spider", "Passive scan rules", "Active scan (rate-limited)", "JSON/XML report import"], setupSteps: ["Run ZAP in daemon mode on the scan worker.", "Store the ZAP API key in backend secret storage only.", "Configure scope contexts from AEGIS target scope.", "Enable rate-limiting and exclusion rules."], futureEndpoint: "POST /api/scans/:id/jobs { tool: 'owasp_zap' }" },
  { id: "dns_utils", name: "DNS Utilities", purpose: "Resolve DNS records for declared in-scope hostnames.", integrationType: "Backend resolver service", status: "not_connected", lastUsedAt: "2026-09-16T13:20:00Z", features: ["A/AAAA/CNAME lookups", "MX/TXT records", "Scope-restricted resolution"], setupSteps: ["Implement resolver service on the backend.", "Restrict lookups to hostnames listed in approved scope."], futureEndpoint: "POST /api/recon/dns" },
  { id: "http_inspector", name: "HTTP Security Inspector", purpose: "Review security headers, cookies, redirects and TLS settings.", integrationType: "Backend inspection worker", status: "not_connected", lastUsedAt: "2026-09-18T10:40:00Z", features: ["Security header checks", "Cookie attribute analysis", "TLS protocol review", "Redirect chain review"], setupSteps: ["Implement inspector on the scan worker.", "Respect target rate limits and excluded paths."], futureEndpoint: "POST /api/scans/:id/jobs { tool: 'http_inspector' }" },
  { id: "ai_service", name: "AI Analysis Service", purpose: "Assist assessors with interpretation, explanation and remediation guidance.", integrationType: "Backend LLM gateway", status: "demo_adapter", lastUsedAt: "2026-09-19T09:30:00Z", features: ["Scan result interpretation", "Vulnerability explanation", "Risk prioritization", "Remediation recommendations", "Security test recommendations", "Assessment summary drafting"], setupSteps: ["Implement an AI gateway endpoint on the backend.", "Keep model API keys server-side; never in the browser.", "Send only minimized, redacted evidence to the model.", "Store outputs as suggestions requiring human verification."], futureEndpoint: "POST /api/ai/analyses" },
];

/* -------------------------------- Settings ------------------------------- */
export const defaultSettings: ApplicationSettings = {
  general: { organizationName: "AEGIS Security Lab (Demo)", timezone: "local", dateFormat: "MMM d, yyyy" },
  appearance: { theme: "light", density: "comfortable", reduceMotion: false },
  table: { pageSize: 10 },
  notifications: { findingUpdates: true, scanEvents: true, remediationDue: true, reportReady: true, toastsEnabled: true },
  security: { requireConfirmBeforeVerify: true, requireEvidenceReview: true, maskSensitiveEvidence: false, idleLockMinutes: 30 },
  assessmentDefaults: { profile: "baseline", requestsPerSecond: 5, timeLimitMinutes: 60, categories: ["authentication", "access_control", "injection", "session", "exposed_files", "config_https"] },
  reports: { defaultTemplate: "technical", includeUnverifiedAppendix: false, showDemoWatermark: true, preparedBy: "AEGIS Security Lab (Demo)" },
  integrations: { backendBaseUrl: "http://localhost:4000/api", aiServiceMode: "demo" },
};
