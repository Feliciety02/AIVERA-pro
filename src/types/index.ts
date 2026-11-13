/**
 * AIVERA domain model.
 *
 * These types are the single source of truth shared by the demo adapter, the
 * Zustand store, and (later) the API adapter that talks to the Node/Express
 * backend. Entities reference each other by stable IDs, never by copies.
 */

export type ID = string;
export type ISODate = string;

/** Where a record came from. Simulated/synthetic data must never be presented as real evidence. */
export type DataOrigin = "synthetic" | "simulated" | "imported" | "user_created" | "real";

/* --------------------------------- Users --------------------------------- */
export type UserRole = "administrator" | "lead" | "assessor" | "remediation_owner" | "viewer";
export type AccountStatus = "active" | "suspended" | "invited";

export interface User {
  id: ID;
  name: string;
  email: string;
  role: UserRole;
  title: string;
  status: AccountStatus;
  assignedProjectIds: ID[];
  createdAt: ISODate;
  lastActiveAt: ISODate;
}

/* -------------------------------- Projects ------------------------------- */
export type ProjectStatus = "draft" | "planning" | "in_progress" | "under_review" | "completed" | "archived";
export type AssessmentType = "web_application" | "api" | "external_perimeter" | "authenticated_webapp" | "retest";

export interface Project {
  id: ID;
  code: string;
  name: string;
  description: string;
  assessmentType: AssessmentType;
  ownerId: ID;
  memberIds: ID[];
  /** Security Lead who signs off findings, approves fixes and approves reports. */
  leadId?: ID;
  /** Default owner for fix tasks created automatically from confirmed findings. */
  remediationOwnerId?: ID;
  status: ProjectStatus;
  /** Status before archiving, used by "Restore". */
  statusBeforeArchive?: ProjectStatus;
  startDate: ISODate;
  dueDate: ISODate;
  objectives: string;
  notes: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  dataOrigin: DataOrigin;
}

/* -------------------------------- Targets -------------------------------- */
export type AssessmentCategoryId =
  | "authentication"
  | "access_control"
  | "injection"
  | "session"
  | "exposed_files"
  | "info_disclosure"
  | "config_https"
  | "business_logic";

export type AuthorizationStatus = "authorized" | "pending" | "expired" | "revoked";
export type TargetEnvironment = "development" | "staging" | "qa" | "lab";
export type AssetType = "web_application" | "rest_api" | "single_page_app" | "admin_portal" | "cms";

export interface TargetScope {
  inScopeHosts: string[];
  allowedPaths: string[];
  excludedPaths: string[];
  allowedCategories: AssessmentCategoryId[];
  allowedActivities: string[];
  restrictedActivities: string[];
}

export interface Target {
  id: ID;
  /** Optional: a target can be registered before it is added to a project. Testing needs a project. */
  projectId?: ID;
  name: string;
  /** Stored as metadata only. The frontend never connects to this URL. */
  url: string;
  description: string;
  assetType: AssetType;
  environment: TargetEnvironment;
  owner: string;
  authorizationStatus: AuthorizationStatus;
  authorizationReference: string;
  authorizationConfirmed: boolean;
  authorizationConfirmedBy?: ID;
  authorizationConfirmedAt?: ISODate;
  scope: TargetScope;
  testingNotes: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  dataOrigin: DataOrigin;
}

/** One scope entry suggested by automatic detection, with where it came from. */
export interface ScopeSuggestion {
  value: string;
  /** e.g. "Web address", "robots.txt", "sitemap.xml", always a real, checkable source. */
  source: string;
  note?: string;
}

/** Result of automatic scope detection. Every value comes from the address or the site's own public files. */
export interface ScopeDetection {
  url: string;
  host: string;
  checkedAt: ISODate;
  /** "address" = parsed from the URL only (demo mode); "server" = DNS + robots.txt + sitemap checked by the AIVERA server. */
  mode: "address" | "server";
  dns?: { status: "resolved" | "not_found" | "skipped" | "blocked"; addresses: string[]; message?: string };
  robots?: { status: "found" | "not_found" | "error" | "skipped"; url: string; message?: string; unsupportedRules: string[] };
  sitemap?: { status: "found" | "not_found" | "error" | "skipped"; url: string; message?: string; urlCount: number; sections: string[] };
  inScopeHosts: ScopeSuggestion[];
  allowedPaths: ScopeSuggestion[];
  excludedPaths: ScopeSuggestion[];
  /** Environment guessed from words in the host name (staging, dev, qa, test, lab). */
  environmentHint?: TargetEnvironment;
}

/** A target that belongs to a project, required for scans, imports and findings. */
export type ProjectTarget = Target & { projectId: ID };

/* ------------------------------ Assessments ------------------------------ */
export type AssessmentStatus = "not_started" | "in_progress" | "completed" | "blocked";
export type ChecklistResult = "not_tested" | "pass" | "fail" | "not_applicable";

export interface ChecklistItem {
  id: ID;
  title: string;
  kind: "automated" | "manual";
  tool?: ScanTool;
  result: ChecklistResult;
  observation: string;
  evidenceNote: string;
  updatedAt?: ISODate;
  updatedBy?: ID;
}

/** A category-level assessment within a project (e.g. "Session Management" for project P). */
export interface Assessment {
  id: ID;
  projectId: ID;
  category: AssessmentCategoryId;
  status: AssessmentStatus;
  assessorId: ID;
  checklist: ChecklistItem[];
  updatedAt: ISODate;
}

/* ---------------------------------- Scans -------------------------------- */
export type ScanTool = "nmap" | "owasp_zap" | "dns_utils" | "http_inspector";
export type ScanStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type ScanProfile = "passive" | "baseline" | "standard" | "thorough";
export type OutputFormat = "json" | "xml" | "html";

export interface ScanConfig {
  tools: ScanTool[];
  categories: AssessmentCategoryId[];
  profile: ScanProfile;
  timeLimitMinutes: number;
  requestsPerSecond: number;
  maxConcurrency: number;
  outputFormat: OutputFormat;
  respectExclusions: boolean;
  scopeConfirmed: boolean;
  /** Send the target's stored test-account session (automated runs only). */
  authenticated?: boolean;
}

export interface Scan {
  id: ID;
  code: string;
  name: string;
  projectId: ID;
  targetId: ID;
  status: ScanStatus;
  progress: number;
  /** Human-readable current stage of a (simulated) run. */
  stage?: string;
  config: ScanConfig;
  createdBy: ID;
  createdAt: ISODate;
  startedAt?: ISODate;
  completedAt?: ISODate;
  errorMessage?: string;
  /** "simulated" for demo runs, "imported" for sample tool output; "real" reserved for the backend. */
  dataOrigin: Extract<DataOrigin, "simulated" | "imported" | "real">;
}

export interface ScanResult {
  id: ID;
  scanId: ID;
  tool: ScanTool;
  summary: string;
  itemsFound: number;
  /** Sample tool output (synthetic). */
  rawOutput: string;
  recordedAt: ISODate;
  dataOrigin: DataOrigin;
}

/* ----------------------------- Reconnaissance ---------------------------- */
export interface Host {
  id: ID;
  targetId: ID;
  scanId?: ID;
  hostname: string;
  ipAddress: string;
  state: "up" | "down" | "unknown";
  osGuess?: string;
  source: ScanTool;
  observedAt: ISODate;
  dataOrigin: DataOrigin;
}

export interface Port {
  id: ID;
  hostId: ID;
  port: number;
  protocol: "tcp" | "udp";
  state: "open" | "filtered" | "closed";
  service: string;
  version: string;
  source: ScanTool;
  observedAt: ISODate;
  dataOrigin: DataOrigin;
}

export interface DnsRecord {
  id: ID;
  targetId: ID;
  name: string;
  type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS";
  value: string;
  ttl: number;
  source: ScanTool;
  observedAt: ISODate;
  dataOrigin: DataOrigin;
}

export interface Endpoint {
  id: ID;
  targetId: ID;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  statusCode: number;
  contentType: string;
  authRequired: boolean;
  source: ScanTool;
  observedAt: ISODate;
  dataOrigin: DataOrigin;
}

export interface ReconRun {
  id: ID;
  targetId: ID;
  tool: ScanTool;
  label: string;
  recordsAdded: number;
  ranAt: ISODate;
  dataOrigin: DataOrigin;
}

/* -------------------------------- Findings ------------------------------- */
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type VerificationStatus = "pending" | "confirmed" | "rejected" | "needs_review";
export type FindingSource = ScanTool | "manual";

export type EvidenceType = "http_request" | "http_response" | "tool_output" | "header_dump" | "manual_note";

export interface Evidence {
  id: ID;
  findingId: ID;
  type: EvidenceType;
  title: string;
  content: string;
  source: FindingSource;
  capturedAt: ISODate;
  reviewed: boolean;
  reviewedBy?: ID;
  dataOrigin: DataOrigin;
}

export type SignoffStatus = "not_required" | "pending" | "approved" | "returned";

export interface VulnerabilityFinding {
  id: ID;
  code: string;
  title: string;
  description: string;
  projectId: ID;
  targetId: ID;
  scanId?: ID;
  category: AssessmentCategoryId;
  /** Severity as reported by the source tool / initial triage. */
  severity: Severity;
  affectedAsset: string;
  parameter?: string;
  sourceTool: FindingSource;
  verificationStatus: VerificationStatus;
  /** Second sign-off by a Security Lead, required for confirmed critical and high findings. */
  signoffStatus: SignoffStatus;
  signoffBy?: ID;
  signoffAt?: ISODate;
  signoffNote?: string;
  assignedAssessorId: ID;
  discoveredAt: ISODate;
  updatedAt: ISODate;
  impact: string;
  remediation: string;
  cwe?: string;
  owasp?: string;
  /** Links to the deterministic sample AI library in demo mode. */
  templateKey: string;
  dataOrigin: DataOrigin;
}

export interface Verification {
  id: ID;
  findingId: ID;
  fromStatus: VerificationStatus;
  toStatus: VerificationStatus;
  assessorId: ID;
  notes: string;
  decisionReason: string;
  evidenceReviewed: boolean;
  decidedAt: ISODate;
}

/* ---------------------------------- AI ----------------------------------- */
export type AIMode =
  | "scan_interpretation"
  | "vulnerability_explanation"
  | "risk_prioritization"
  | "remediation"
  | "test_recommendations"
  | "assessment_summary";

export type AIAnalysisStatus = "generated" | "sent_to_verification" | "acknowledged";

export interface AIAnalysis {
  id: ID;
  mode: AIMode;
  projectId: ID;
  targetId?: ID;
  scanId?: ID;
  findingId?: ID;
  title: string;
  interpretation: string;
  explanation: string;
  suggestedSeverity?: Severity;
  potentialImpact: string;
  recommendations: string[];
  verificationSteps: string[];
  reasoning: string[];
  evidenceRefs: ID[];
  confidenceCaveat: string;
  status: AIAnalysisStatus;
  generatedAt: ISODate;
  generatedBy: ID;
  /** Which adapter produced this. "demo" responses are predefined samples, not LLM output. */
  adapter: "demo" | "api";
  /** Model that generated the analysis (API adapter only), e.g. "gemini-3.8-flash". */
  model?: string;
  /** Exact redacted context sent to the model, kept for audit and the oral defense. */
  sentContext?: string;
  /** Number of values redacted before sending. */
  redactionCount?: number;
}

/* --------------------------------- Risks --------------------------------- */
export type LikertScore = 1 | 2 | 3 | 4 | 5;
export type RiskLevel = "critical" | "high" | "medium" | "low";
export type MitigationStatus = "not_started" | "in_progress" | "mitigated" | "accepted";

export interface Risk {
  id: ID;
  findingId: ID;
  title: string;
  likelihood: LikertScore;
  impact: LikertScore;
  ownerId: ID;
  mitigationStatus: MitigationStatus;
  reviewDate: ISODate;
  notes: string;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/* ------------------------------ Remediation ------------------------------ */
export type RemediationStatus = "open" | "in_progress" | "awaiting_retest" | "pending_approval" | "resolved" | "accepted_risk";
export type RetestResult = "not_required" | "pending" | "passed" | "failed";

export interface RemediationHistoryEntry {
  at: ISODate;
  by: ID;
  from?: RemediationStatus;
  to: RemediationStatus;
  note: string;
}

export interface RemediationTask {
  id: ID;
  code: string;
  findingId: ID;
  title: string;
  description: string;
  recommendation: string;
  ownerId: ID;
  priority: Severity;
  status: RemediationStatus;
  dueDate: ISODate;
  retestRequired: boolean;
  retestResult: RetestResult;
  /** Assessor who should run the retest (set automatically when the fix is ready). */
  retestAssigneeId?: ID;
  approvedBy?: ID;
  approvedAt?: ISODate;
  createdAt: ISODate;
  updatedAt: ISODate;
  history: RemediationHistoryEntry[];
}

/* -------------------------------- Reports -------------------------------- */
export type ReportStatus = "draft" | "in_review" | "final";
export type ReportSectionKey =
  | "cover"
  | "assessment_info"
  | "executive_summary"
  | "scope"
  | "methodology"
  | "tools"
  | "findings_summary"
  | "severity_distribution"
  | "detailed_findings"
  | "evidence"
  | "risk_assessment"
  | "remediation"
  | "unverified_observations"
  | "conclusion"
  | "assessor_info";

export interface Report {
  id: ID;
  code: string;
  title: string;
  projectId: ID;
  targetIds: ID[];
  templateId: string;
  periodStart: ISODate;
  periodEnd: ISODate;
  findingIds: ID[];
  includeUnverified: boolean;
  sections: ReportSectionKey[];
  executiveSummary: string;
  status: ReportStatus;
  /** Lead who approved the final version, and any note sent back with a returned draft. */
  approvedBy?: ID;
  approvedAt?: ISODate;
  reviewNote?: string;
  createdBy: ID;
  createdAt: ISODate;
  updatedAt: ISODate;
  /** Provenance is resolved from the selected scans and findings when rendered. */
  generatedFrom: "demonstration_data" | "database_records";
}

/* -------------------------------- Activity ------------------------------- */
export type ActivityType =
  | "project_created"
  | "project_updated"
  | "project_archived"
  | "project_restored"
  | "target_registered"
  | "scope_detected"
  | "target_updated"
  | "scope_updated"
  | "demo_scan_started"
  | "demo_scan_completed"
  | "demo_scan_cancelled"
  | "demo_scan_paused"
  | "demo_scan_resumed"
  | "simulated_data_removed"
  | "scan_queued"
  | "tool_output_captured"
  | "scan_failed"
  | "scan_credential_updated"
  | "recon_imported"
  | "tool_output_imported"
  | "finding_recorded"
  | "evidence_added"
  | "finding_reviewed"
  | "finding_confirmed"
  | "finding_rejected"
  | "finding_needs_review"
  | "evidence_reviewed"
  | "ai_analysis_generated"
  | "assessment_updated"
  | "risk_updated"
  | "remediation_created"
  | "remediation_updated"
  | "report_generated"
  | "report_exported"
  | "user_updated"
  | "settings_changed"
  | "demo_login"
  | "user_login"
  | "user_signup"
  | "user_logout"
  | "demo_reset";

export type EntityType = "project" | "target" | "scan" | "finding" | "remediation" | "report" | "risk" | "assessment" | "user" | "settings" | "system";

export interface ActivityLog {
  id: ID;
  type: ActivityType;
  userId: ID;
  timestamp: ISODate;
  entityType: EntityType;
  entityId?: ID;
  entityLabel: string;
  description: string;
}

/* ----------------------------- Notifications ----------------------------- */
export interface Notification {
  id: ID;
  /** Set when the notification is for one person; empty means everyone. */
  userId?: ID;
  title: string;
  message: string;
  tone: "info" | "success" | "warning" | "critical";
  createdAt: ISODate;
  read: boolean;
  link?: string;
}

/* ------------------------------ Integrations ----------------------------- */
export type IntegrationStatus = "not_connected" | "demo_adapter" | "connected" | "error";

export interface Integration {
  id: ScanTool | "ai_service";
  name: string;
  purpose: string;
  integrationType: string;
  status: IntegrationStatus;
  lastUsedAt?: ISODate;
  features: string[];
  setupSteps: string[];
  futureEndpoint: string;
}

/* -------------------------------- Settings ------------------------------- */
export type ThemePreference = "dark" | "light" | "system";

export interface ApplicationSettings {
  general: { organizationName: string; timezone: string; dateFormat: "MMM d, yyyy" | "yyyy-MM-dd" | "dd/MM/yyyy" };
  appearance: { theme: ThemePreference; density: "comfortable" | "compact"; reduceMotion: boolean };
  table: { pageSize: number };
  notifications: { findingUpdates: boolean; scanEvents: boolean; remediationDue: boolean; reportReady: boolean; toastsEnabled: boolean };
  security: { requireConfirmBeforeVerify: boolean; requireEvidenceReview: boolean; maskSensitiveEvidence: boolean; idleLockMinutes: number };
  assessmentDefaults: { profile: ScanProfile; requestsPerSecond: number; timeLimitMinutes: number; categories: AssessmentCategoryId[] };
  reports: { defaultTemplate: string; includeUnverifiedAppendix: boolean; showDemoWatermark: boolean; preparedBy: string };
  integrations: { backendBaseUrl: string; aiServiceMode: "demo" | "api" };
}
