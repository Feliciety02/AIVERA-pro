import type {
  AIMode,
  AssessmentCategoryId,
  AssessmentStatus,
  AssessmentType,
  AssetType,
  AuthorizationStatus,
  MitigationStatus,
  ProjectStatus,
  RemediationStatus,
  ReportStatus,
  SignoffStatus,
  ReportSectionKey,
  ScanProfile,
  ScanStatus,
  ScanTool,
  Severity,
  TargetEnvironment,
  UserRole,
  VerificationStatus,
  FindingSource,
  DataOrigin,
} from "@/types";

export const APP_NAME = "AIVERA";
export const APP_TAGLINE = "Intelligent Security. Verified Decisions.";

/* -------------------------------- Severity ------------------------------- */
export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

export const SEVERITY_META: Record<Severity, { label: string; color: string; className: string; rank: number }> = {
  critical: { label: "Critical", color: "var(--sev-critical)", className: "border-transparent bg-transparent text-foreground", rank: 5 },
  high: { label: "High", color: "var(--sev-high)", className: "border-transparent bg-transparent text-foreground", rank: 4 },
  medium: { label: "Medium", color: "var(--sev-medium)", className: "border-transparent bg-transparent text-foreground", rank: 3 },
  low: { label: "Low", color: "var(--sev-low)", className: "border-transparent bg-transparent text-foreground", rank: 2 },
  info: { label: "Info", color: "var(--sev-info)", className: "border-transparent bg-transparent text-muted-foreground", rank: 1 },
};

/** Hex values for contexts that cannot resolve CSS variables (PDF export). */
export const SEVERITY_HEX: Record<Severity, string> = {
  critical: "#EF4444",
  high: "#F97316",
  medium: "#EAB308",
  low: "#3B82F6",
  info: "#64748B",
};

/* ------------------------------- Tone helper ------------------------------ */
export type Tone = "neutral" | "primary" | "cyan" | "warning" | "danger" | "info" | "muted";

/**
 * Flat, borderless tinted chips (Google Cloud / Cloudflare style). "primary" is
 * used for positive states (completed, authorized, resolved), so it maps to green.
 */
export const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-transparent bg-secondary text-secondary-foreground",
  primary: "border-transparent bg-success/12 text-success",
  cyan: "border-transparent bg-cyan/12 text-cyan",
  warning: "border-transparent bg-sev-medium/15 text-warning",
  danger: "border-transparent bg-sev-critical/12 text-sev-critical",
  info: "border-transparent bg-primary/10 text-primary",
  muted: "border-border bg-transparent text-muted-foreground",
};

export interface StatusMeta {
  label: string;
  tone: Tone;
}

export const PROJECT_STATUS: Record<ProjectStatus, StatusMeta> = {
  draft: { label: "Draft", tone: "muted" },
  planning: { label: "Planning", tone: "info" },
  in_progress: { label: "In Progress", tone: "cyan" },
  under_review: { label: "Under Review", tone: "warning" },
  completed: { label: "Completed", tone: "primary" },
  archived: { label: "Archived", tone: "neutral" },
};

export const SCAN_STATUS: Record<ScanStatus, StatusMeta> = {
  queued: { label: "Queued", tone: "muted" },
  running: { label: "Running", tone: "cyan" },
  paused: { label: "Paused", tone: "warning" },
  completed: { label: "Completed", tone: "primary" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const VERIFICATION_STATUS: Record<VerificationStatus, StatusMeta> = {
  pending: { label: "Pending Verification", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "danger" },
  rejected: { label: "Rejected", tone: "neutral" },
  needs_review: { label: "Needs Further Review", tone: "info" },
};

export const REMEDIATION_STATUS: Record<RemediationStatus, StatusMeta> = {
  open: { label: "Open", tone: "warning" },
  in_progress: { label: "In Progress", tone: "cyan" },
  awaiting_retest: { label: "Awaiting Retest", tone: "info" },
  pending_approval: { label: "Awaiting Approval", tone: "info" },
  resolved: { label: "Resolved", tone: "primary" },
  accepted_risk: { label: "Accepted Risk", tone: "neutral" },
};

/** Days to fix a confirmed finding, by severity. Used for automatic fix tasks. */
export const REMEDIATION_SLA_DAYS: Record<Severity, number> = { critical: 7, high: 14, medium: 30, low: 90, info: 180 };

export const REPORT_STATUS: Record<ReportStatus, StatusMeta> = {
  draft: { label: "Draft", tone: "muted" },
  in_review: { label: "In Review", tone: "warning" },
  final: { label: "Final", tone: "primary" },
};

export const SIGNOFF_STATUS: Record<SignoffStatus, StatusMeta> = {
  not_required: { label: "Not required", tone: "muted" },
  pending: { label: "Awaiting lead sign-off", tone: "warning" },
  approved: { label: "Signed off", tone: "primary" },
  returned: { label: "Returned by lead", tone: "danger" },
};

export const AUTHORIZATION_STATUS: Record<AuthorizationStatus, StatusMeta> = {
  authorized: { label: "Authorized", tone: "primary" },
  pending: { label: "Authorization Pending", tone: "warning" },
  expired: { label: "Authorization Expired", tone: "danger" },
  revoked: { label: "Revoked", tone: "danger" },
};

export const ASSESSMENT_STATUS: Record<AssessmentStatus, StatusMeta> = {
  not_started: { label: "Not Started", tone: "muted" },
  in_progress: { label: "In Progress", tone: "cyan" },
  completed: { label: "Completed", tone: "primary" },
  blocked: { label: "Blocked", tone: "danger" },
};

export const MITIGATION_STATUS: Record<MitigationStatus, StatusMeta> = {
  not_started: { label: "Not Started", tone: "warning" },
  in_progress: { label: "In Progress", tone: "cyan" },
  mitigated: { label: "Mitigated", tone: "primary" },
  accepted: { label: "Accepted", tone: "neutral" },
};

export const DATA_ORIGIN: Record<DataOrigin, StatusMeta & { description: string }> = {
  synthetic: { label: "Synthetic", tone: "muted", description: "Fictional sample record included with the demo dataset." },
  simulated: { label: "SIMULATED", tone: "warning", description: "Produced by the in-browser demo simulation. No real scan was performed." },
  imported: { label: "Imported", tone: "cyan", description: "Tool output imported from a file (bundled synthetic sample or a report you supplied). Parsed in the browser, AIVERA did not run the tool or contact the host." },
  user_created: { label: "User Entered", tone: "info", description: "Entered manually by a user in this demo session." },
  real: { label: "Live Result", tone: "primary", description: "Reserved for future backend scan results." },
};

/* --------------------------------- Labels -------------------------------- */
export const ASSESSMENT_TYPES: Record<AssessmentType, string> = {
  web_application: "Web Application Assessment",
  authenticated_webapp: "Authenticated Web App Assessment",
  api: "API Security Assessment",
  external_perimeter: "External Perimeter Review",
  retest: "Remediation Retest",
};

export const ASSET_TYPES: Record<AssetType, string> = {
  web_application: "Web Application",
  rest_api: "REST API",
  single_page_app: "Single-Page App",
  admin_portal: "Admin Portal",
  cms: "Content Management System",
};

export const ENVIRONMENTS: Record<TargetEnvironment, string> = {
  development: "Development",
  staging: "Staging",
  qa: "QA / Test",
  lab: "Isolated Lab",
};

export const ROLE_META: Record<UserRole, { label: string; description: string; tone: Tone }> = {
  administrator: { label: "Administrator", description: "Runs the platform: users, roles, settings and integrations. Sees every project and can step in anywhere.", tone: "primary" },
  lead: { label: "Security Lead", description: "Owns projects and approvals: confirms website permission, signs off critical and high findings, approves closing fixes and final reports.", tone: "danger" },
  assessor: { label: "Security Assessor", description: "Does the testing in their projects: scans, verifies findings, retests fixes and drafts reports.", tone: "cyan" },
  remediation_owner: { label: "Remediation Owner", description: "The developer who fixes issues: sees their assigned fixes with the evidence and marks them ready for retest.", tone: "warning" },
  viewer: { label: "Viewer", description: "Reads dashboards and approved reports for the projects they belong to.", tone: "neutral" },
};

export const SCAN_PROFILES: Record<ScanProfile, { label: string; description: string }> = {
  passive: { label: "Passive", description: "Observe responses only. No active probing payloads." },
  baseline: { label: "Baseline", description: "Low-impact checks suitable for shared environments." },
  standard: { label: "Standard", description: "Active checks with attack payloads. Automated runs allow it only on a copy running on this machine." },
  thorough: { label: "Thorough", description: "Deeper coverage for isolated lab environments only." },
};

/* ---------------------------------- Tools -------------------------------- */
export const TOOL_META: Record<ScanTool, { label: string; short: string; description: string; kind: string; categories: AssessmentCategoryId[] }> = {
  nmap: {
    label: "Nmap",
    short: "NMAP",
    kind: "Network discovery",
    description: "Host discovery, port enumeration and service/version identification for in-scope hosts.",
    categories: ["config_https", "info_disclosure"],
  },
  owasp_zap: {
    label: "OWASP ZAP",
    short: "ZAP",
    kind: "Web application scanner",
    description: "Spidering and passive/active web checks for injection, session, access control and configuration issues.",
    categories: ["injection", "session", "access_control", "authentication", "exposed_files", "info_disclosure", "config_https"],
  },
  dns_utils: {
    label: "DNS Utilities",
    short: "DNS",
    kind: "Name resolution",
    description: "Resolves A/AAAA/CNAME/MX/TXT records for declared in-scope hostnames.",
    categories: ["info_disclosure"],
  },
  http_inspector: {
    label: "HTTP Security Inspector",
    short: "HTTP",
    kind: "Header & TLS review",
    description: "Reviews security headers, cookie attributes, redirects and TLS configuration.",
    categories: ["config_https", "session", "info_disclosure"],
  },
};

export const SOURCE_LABEL: Record<FindingSource, string> = {
  nmap: "Nmap",
  owasp_zap: "OWASP ZAP",
  dns_utils: "DNS Utilities",
  http_inspector: "HTTP Inspector",
  manual: "Manual Testing",
};

/* --------------------------- Assessment categories ------------------------ */
export interface CategoryMeta {
  id: AssessmentCategoryId;
  name: string;
  short: string;
  description: string;
  scope: string;
  tools: ScanTool[];
  /** Emphasised in the initial demonstration (6 of 8). */
  primary: boolean;
  owasp: string;
  checklist: { title: string; kind: "automated" | "manual"; tool?: ScanTool }[];
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: "authentication",
    name: "Authentication and Login Security",
    short: "Authentication",
    description: "Evaluates credential handling, login flows, lockout, password policy and multi-factor controls.",
    scope: "Login, registration, password reset and MFA endpoints within the authorized scope.",
    tools: ["owasp_zap", "http_inspector"],
    primary: true,
    owasp: "A07:2021 Identification & Authentication Failures",
    checklist: [
      { title: "Login form served over HTTPS only", kind: "automated", tool: "http_inspector" },
      { title: "Account lockout / rate limiting on failed logins", kind: "manual" },
      { title: "Generic error messages (no username enumeration)", kind: "manual" },
      { title: "Password reset token is single-use and expires", kind: "manual" },
      { title: "Password policy enforced server-side", kind: "manual" },
      { title: "Authentication form autocomplete and caching headers", kind: "automated", tool: "owasp_zap" },
    ],
  },
  {
    id: "access_control",
    name: "Access Control and Authorization",
    short: "Access Control",
    description: "Verifies that users can only access functions and records permitted by their role.",
    scope: "Role-restricted pages, object identifiers in URLs/APIs, and administrative functions.",
    tools: ["owasp_zap"],
    primary: true,
    owasp: "A01:2021 Broken Access Control",
    checklist: [
      { title: "Horizontal access: change object IDs between test accounts", kind: "manual" },
      { title: "Vertical access: low-privilege account requests admin routes", kind: "manual" },
      { title: "Forced browsing to unlinked administrative paths", kind: "automated", tool: "owasp_zap" },
      { title: "Server enforces authorization on API (not just UI)", kind: "manual" },
      { title: "CORS policy restricts credentialed origins", kind: "automated", tool: "owasp_zap" },
    ],
  },
  {
    id: "injection",
    name: "Input Validation and Injection",
    short: "Injection",
    description: "Identifies SQL, command, template and cross-site scripting injection via untrusted input.",
    scope: "Form fields, query parameters, JSON bodies and headers on in-scope paths.",
    tools: ["owasp_zap"],
    primary: true,
    owasp: "A03:2021 Injection",
    checklist: [
      { title: "Reflected XSS in query parameters", kind: "automated", tool: "owasp_zap" },
      { title: "Stored XSS in user-generated content", kind: "manual" },
      { title: "SQL injection indicators in search / filter parameters", kind: "automated", tool: "owasp_zap" },
      { title: "Server-side input validation on JSON APIs", kind: "manual" },
      { title: "Output encoding in templates", kind: "manual" },
    ],
  },
  {
    id: "session",
    name: "Session Management",
    short: "Session",
    description: "Assesses session token generation, cookie attributes, expiry and logout behaviour.",
    scope: "Session cookies, tokens, logout and idle-timeout behaviour for authenticated areas.",
    tools: ["http_inspector", "owasp_zap"],
    primary: true,
    owasp: "A07:2021 Identification & Authentication Failures",
    checklist: [
      { title: "Session cookie has Secure, HttpOnly and SameSite", kind: "automated", tool: "http_inspector" },
      { title: "Session ID rotates after login", kind: "manual" },
      { title: "Logout invalidates the server-side session", kind: "manual" },
      { title: "Idle and absolute session timeouts", kind: "manual" },
    ],
  },
  {
    id: "exposed_files",
    name: "Exposed Files and Directories",
    short: "Exposed Files",
    description: "Finds unintentionally reachable backups, configuration files, VCS folders and directory listings.",
    scope: "Common sensitive paths under the allowed URL paths, excluding declared exclusions.",
    tools: ["owasp_zap"],
    primary: true,
    owasp: "A05:2021 Security Misconfiguration",
    checklist: [
      { title: "Directory listing disabled", kind: "automated", tool: "owasp_zap" },
      { title: "No backup / temp files (.bak, .old, ~) reachable", kind: "automated", tool: "owasp_zap" },
      { title: "Version control metadata (.git/) not exposed", kind: "automated", tool: "owasp_zap" },
      { title: "Environment / config files not reachable", kind: "manual" },
    ],
  },
  {
    id: "info_disclosure",
    name: "Information Disclosure",
    short: "Info Disclosure",
    description: "Detects verbose errors, stack traces, version banners and sensitive data in responses.",
    scope: "Error pages, response headers, HTML comments and API error payloads.",
    tools: ["http_inspector", "nmap", "owasp_zap"],
    primary: false,
    owasp: "A05:2021 Security Misconfiguration",
    checklist: [
      { title: "Server / framework version banners", kind: "automated", tool: "http_inspector" },
      { title: "Verbose error messages / stack traces", kind: "manual" },
      { title: "Sensitive data in HTML comments or JS bundles", kind: "manual" },
      { title: "Service banners on open ports", kind: "automated", tool: "nmap" },
    ],
  },
  {
    id: "config_https",
    name: "Security Configuration and HTTPS",
    short: "Config & HTTPS",
    description: "Reviews TLS configuration, HSTS, security headers and exposed services.",
    scope: "TLS endpoints, HTTP response headers and network services on in-scope hosts.",
    tools: ["http_inspector", "nmap"],
    primary: true,
    owasp: "A05:2021 Security Misconfiguration",
    checklist: [
      { title: "HTTPS enforced with redirect from HTTP", kind: "automated", tool: "http_inspector" },
      { title: "Strict-Transport-Security header present", kind: "automated", tool: "http_inspector" },
      { title: "Content-Security-Policy defined", kind: "automated", tool: "http_inspector" },
      { title: "Legacy TLS versions disabled", kind: "automated", tool: "http_inspector" },
      { title: "Only expected ports are open", kind: "automated", tool: "nmap" },
    ],
  },
  {
    id: "business_logic",
    name: "Business Logic Vulnerabilities",
    short: "Business Logic",
    description: "Manual review of workflow abuse such as price tampering, step skipping and race conditions.",
    scope: "Multi-step workflows (checkout, approvals, transfers) using test accounts only.",
    tools: [],
    primary: false,
    owasp: "A04:2021 Insecure Design",
    checklist: [
      { title: "Workflow steps cannot be skipped or reordered", kind: "manual" },
      { title: "Client-supplied prices / quantities validated server-side", kind: "manual" },
      { title: "Limits enforced under concurrent requests", kind: "manual" },
    ],
  },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<AssessmentCategoryId, CategoryMeta>;

/* ---------------------------------- AI ----------------------------------- */
export const AI_MODES: { id: AIMode; label: string; description: string; needs: "finding" | "scan" | "project" }[] = [
  { id: "scan_interpretation", label: "Scan Result Interpretation", description: "Explain what a tool's output indicates and what deserves attention.", needs: "scan" },
  { id: "vulnerability_explanation", label: "Vulnerability Explanation", description: "Plain-language explanation of a finding and why it matters.", needs: "finding" },
  { id: "risk_prioritization", label: "Risk Prioritization", description: "Suggested priority with reasoning based on severity and exposure.", needs: "finding" },
  { id: "remediation", label: "Remediation Recommendations", description: "Concrete fix guidance for developers and system owners.", needs: "finding" },
  { id: "test_recommendations", label: "Security Test Recommendations", description: "Manual verification steps an assessor should perform.", needs: "finding" },
  { id: "assessment_summary", label: "Assessment Summary Generation", description: "Draft executive summary of a project's verified findings.", needs: "project" },
];

/* -------------------------------- Reports -------------------------------- */
export const REPORT_SECTIONS: { key: ReportSectionKey; label: string; required?: boolean }[] = [
  { key: "cover", label: "Cover Page", required: true },
  { key: "assessment_info", label: "Assessment Information", required: true },
  { key: "executive_summary", label: "Executive Summary" },
  { key: "scope", label: "Scope and Authorization", required: true },
  { key: "methodology", label: "Assessment Methodology" },
  { key: "tools", label: "Security Tools Used" },
  { key: "findings_summary", label: "Findings Summary" },
  { key: "severity_distribution", label: "Severity Distribution" },
  { key: "detailed_findings", label: "Detailed Verified Findings" },
  { key: "evidence", label: "Evidence" },
  { key: "risk_assessment", label: "Risk Assessment" },
  { key: "remediation", label: "Remediation Recommendations" },
  { key: "unverified_observations", label: "Unverified Observations (appendix)" },
  { key: "conclusion", label: "Conclusion" },
  { key: "assessor_info", label: "Assessor Information" },
];

export const REPORT_TEMPLATES = [
  { id: "technical", name: "Technical Assessment Report", description: "Full technical detail with evidence for engineering teams.", sections: REPORT_SECTIONS.map((s) => s.key) },
  {
    id: "executive",
    name: "Executive Summary Report",
    description: "Concise risk-focused report for management stakeholders.",
    sections: ["cover", "assessment_info", "executive_summary", "scope", "findings_summary", "severity_distribution", "risk_assessment", "conclusion", "assessor_info"] as ReportSectionKey[],
  },
  {
    id: "remediation",
    name: "Remediation Status Report",
    description: "Focuses on verified findings and the progress of their fixes.",
    sections: ["cover", "assessment_info", "scope", "findings_summary", "detailed_findings", "remediation", "conclusion", "assessor_info"] as ReportSectionKey[],
  },
];

export const RESTRICTED_ACTIVITY_DEFAULTS = [
  "Denial-of-service or load testing",
  "Social engineering",
  "Destructive payloads / data modification",
  "Testing third-party services",
  "Credential brute forcing beyond agreed limits",
];

export const ALLOWED_ACTIVITY_OPTIONS = [
  "Passive reconnaissance",
  "Port and service discovery",
  "Automated web scanning (rate-limited)",
  "Authenticated testing with provided test accounts",
  "Active scanning (local lab copy only)",
  "Manual verification of findings",
  "Security header review",
];
