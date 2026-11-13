/**
 * Centralised service layer. UI code calls these typed functions for every write.
 *
 *  - Demo mode (default): backed by the in-browser Demo Adapter (Zustand + localStorage).
 *  - API mode (`VITE_DATA_MODE=api`, `npm run dev:full`): every write goes to the
 *    AIVERA backend, which validates permissions, scope and business rules, then the
 *    store is refreshed from the database.
 *
 * In neither mode does the browser contact a target, run a scanner or call a model.
 */
import { toast } from "sonner";
import type { AIAnalysis, ApplicationSettings, ID, Project, RemediationStatus, RemediationTask, Report, Scan, ScopeDetection, Target, TargetScope, User, VerificationStatus } from "@/types";
import { detectFromAddress } from "@/features/scopeDetection";
import { useDataStore, type DataActions, type ManualFindingInput } from "@/stores/dataStore";
import { parseToolOutput, type ImportFormat, type ParseResult } from "@/features/imports/parsers";
import { useSessionStore } from "@/stores/sessionStore";
import { delay } from "@/lib/utils";
import { startSimulation, stopSimulation } from "@/features/simulation/runner";
import { aiService, type AIAnalysisRequest } from "./ai/aiService";
import { DATA_MODE } from "./api/contracts";
import { api } from "./api/http";
import { refresh } from "./api/sync";

export const IS_API = DATA_MODE === "api";
const store = () => useDataStore.getState();
const LATENCY = 280;

type Args<K extends keyof DataActions> = Parameters<DataActions[K]>;

/** Runs an API call, then refreshes the cache from the database. */
async function mutate<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await api<T>(path, { body: body ?? {}, method });
  // The change is already saved at this point. If reloading the data fails, say so instead of
  // reporting the save itself as failed.
  await refresh().catch(() => toast.warning("Saved, but the page couldn't refresh. Reload to see the latest data."));
  return res;
}

export const authService = {
  /** Creates a pending viewer account; an administrator must activate it before sign-in works. */
  async signUp(input: { name: string; email: string; password: string }) {
    if (!IS_API) throw new Error("Creating an account needs the AIVERA server. Run the full app (npm run dev:full).");
    await api("/auth/register", { body: input, silent: true });
  },
  async signIn(email: string, password: string) {
    await api("/auth/login", { body: { email, password }, silent: true });
    await refresh();
  },
  async signOut() {
    if (IS_API) {
      await api("/auth/logout", { body: {}, silent: true }).catch(() => undefined);
      useDataStore.setState({ projects: [], targets: [], findings: [], activity: [], notifications: [] });
    }
    useSessionStore.getState().signOut();
  },
};

export const projectService = {
  async create(input: Args<"createProject">[0]): Promise<Project> {
    if (IS_API) return mutate<Project>("/projects", input);
    await delay(LATENCY);
    return store().createProject(input);
  },
  async update(id: ID, patch: Args<"updateProject">[1]) {
    if (IS_API) return void (await mutate(`/projects/${id}`, patch, "PATCH"));
    await delay(LATENCY);
    store().updateProject(id, patch);
  },
  async archive(id: ID) {
    if (IS_API) return void (await mutate(`/projects/${id}/archive`));
    await delay(LATENCY);
    store().archiveProject(id);
  },
  async restore(id: ID) {
    if (IS_API) return void (await mutate(`/projects/${id}/restore`));
    await delay(LATENCY);
    store().restoreProject(id);
  },
};

export const targetService = {
  /**
   * Suggests scope from real sources. API mode: the AIVERA server looks up DNS and reads the
   * site's robots.txt and sitemap.xml (after permission is confirmed). Demo mode: parsed from
   * the address only, the browser never contacts the target.
   */
  async detectScope(url: string): Promise<ScopeDetection> {
    if (IS_API) return api<ScopeDetection>("/targets/detect-scope", { body: { url, authorizationConfirmed: true } });
    await delay(LATENCY);
    return detectFromAddress(url);
  },
  /** Saves metadata only. The URL is validated syntactically and never contacted. */
  async register(input: Args<"createTarget">[0]): Promise<Target> {
    if (IS_API) return mutate<Target>("/targets", input);
    await delay(LATENCY);
    return store().createTarget(input);
  },
  /** Gives a website saved without a project a project of its own (full app). */
  async createOwnProject(id: ID): Promise<{ projectId: ID; code: string }> {
    if (!IS_API) throw new Error("Creating a project for a website needs the full app with the AIVERA server.");
    return mutate(`/targets/${id}/own-project`);
  },
  async update(id: ID, patch: Args<"updateTarget">[1]) {
    if (IS_API) return void (await mutate(`/targets/${id}`, patch, "PATCH"));
    await delay(LATENCY);
    store().updateTarget(id, patch);
  },
  async updateScope(id: ID, scope: TargetScope) {
    if (IS_API) return void (await mutate(`/targets/${id}/scope`, scope, "PUT"));
    await delay(LATENCY);
    store().updateScope(id, scope);
  },
  async delete(id: ID) {
    if (IS_API) return void (await mutate(`/targets/${id}`, undefined, "DELETE"));
    await delay(LATENCY);
    store().deleteTarget(id);
  },
};

export const scanService = {
  async automatedCapabilities(): Promise<{ enabled: boolean; tools: string[]; profiles: string[] }> {
    if (!IS_API) return { enabled: false, tools: [], profiles: [] };
    return api("/scans/automated/capabilities");
  },
  async startRealAssessment(input: Args<"createSimulatedScan">[0]): Promise<Scan> {
    if (!IS_API) throw new Error("Automated assessments require API mode.");
    const { id } = await mutate<{ id: string; code: string }>("/scans/automated", input);
    const scan = store().scans.find((item) => item.id === id);
    if (!scan) throw new Error("Assessment was queued but its scan record could not be loaded.");
    return scan;
  },
  /** Creates a SIMULATED scan. Demo mode animates it in-browser; API mode generates it on the server. */
  async runDemoSimulation(input: Args<"createSimulatedScan">[0], onDone?: (count: number) => void): Promise<Scan> {
    if (IS_API) {
      const res = await mutate<{ scan: Scan; findingCount: number }>("/scans/simulate", input);
      onDone?.(res.findingCount);
      return res.scan;
    }
    await delay(LATENCY);
    const scan = store().createSimulatedScan(input);
    startSimulation(scan.id, onDone);
    return scan;
  },
  async cancel(id: ID) {
    stopSimulation(id);
    store().cancelScan(id);
  },
  /** Demo mode only: simulations run step by step in the browser and can be paused and continued. */
  async pause(id: ID) {
    stopSimulation(id);
    store().pauseScan(id);
  },
  async resume(id: ID, onDone?: (count: number) => void) {
    store().resumeScan(id);
    startSimulation(id, onDone);
  },
  /** Removes all SIMULATED practice data (scans, findings and everything attached). Real data is kept. */
  async removeSimulatedData(): Promise<{ scans: number; findings: number }> {
    if (IS_API) return mutate<{ scans: number; findings: number }>("/simulated-data/reset", {});
    for (const s of store().scans.filter((x) => x.dataOrigin === "simulated")) stopSimulation(s.id);
    return store().removeSimulatedData();
  },
};

export const reconService = {
  /** Demo mode only: adds clearly-labelled sample records. */
  async importSample(targetId: ID): Promise<number> {
    await delay(500);
    return store().importSampleRecon(targetId);
  },
};

export interface ImportOutcome {
  scanId: ID;
  scanCode: string;
  findingCount: number;
  skippedCount: number;
}

/**
 * Imports tool output (Nmap XML / ZAP JSON) that the assessor produced elsewhere.
 * The browser parses it for the preview; in API mode the server parses it again
 * and re-enforces scope before anything is stored.
 */
export const importService = {
  parse(format: ImportFormat, text: string): ParseResult {
    return parseToolOutput(format, text);
  },
  async importFor(targetId: ID, parsed: ParseResult, raw: string, fileName: string): Promise<ImportOutcome> {
    if (IS_API) {
      const r = await mutate<{ scanId: ID; scanCode: string; findings: number; skipped: string[] }>("/imports", { targetId, format: parsed.format, raw, fileName });
      return { scanId: r.scanId, scanCode: r.scanCode, findingCount: r.findings, skippedCount: r.skipped.length };
    }
    await delay(400);
    const bundle = store().importToolOutput({ parsed, targetId, raw, fileName });
    if (!bundle) throw new Error("Imports are only allowed for authorized targets with confirmed authorization.");
    return { scanId: bundle.scan.id, scanCode: bundle.scan.code, findingCount: bundle.findings.length, skippedCount: bundle.skipped.length };
  },
};

export const verificationService = {
  async record(input: { findingId: ID; toStatus: VerificationStatus; notes: string; decisionReason: string; evidenceReviewed: boolean }) {
    if (IS_API) {
      const { findingId, ...body } = input;
      return void (await mutate(`/findings/${findingId}/verifications`, body));
    }
    await delay(LATENCY);
    store().recordVerification(input);
  },
};

export interface AuditVerification {
  intact: boolean;
  checked: number;
  unsealed: number;
  problem?: string;
  firstBadSeq?: number;
  head?: { seq: number; hash: string };
  verifiedAt: string;
}

/** Tamper-evident activity log (full app only). */
export const auditService = {
  verify(): Promise<AuditVerification> {
    if (!IS_API) return Promise.reject(new Error("Log verification needs the full app with the AIVERA server."));
    return api<AuditVerification>("/audit/verify");
  },
};

/** The stored test-account session is write-only: only its header name and label come back. */
export interface ScanCredentialStatus { configured: boolean; headerName?: string; label?: string; updatedAt?: string }

const needsServer = () => Promise.reject(new Error("This needs the full app with the AIVERA server."));

/** Signed-in scan sessions (full app only). */
export const automationService = {
  credential(targetId: ID): Promise<ScanCredentialStatus> {
    if (!IS_API) return Promise.resolve({ configured: false });
    return api<ScanCredentialStatus>(`/targets/${targetId}/scan-credential`, { silent: true });
  },
  saveCredential(targetId: ID, body: { headerName: string; value: string; label: string }): Promise<ScanCredentialStatus> {
    if (!IS_API) return needsServer();
    return mutate<ScanCredentialStatus>(`/targets/${targetId}/scan-credential`, body, "PUT");
  },
  removeCredential(targetId: ID): Promise<ScanCredentialStatus> {
    if (!IS_API) return needsServer();
    return mutate<ScanCredentialStatus>(`/targets/${targetId}/scan-credential`, {}, "DELETE");
  },
};

export const findingService = {
  async resolveAlias(id: ID): Promise<ID | null> {
    if (!IS_API) return null;
    const response = await api<{ canonicalId: ID }>(`/findings/${id}/alias`, { silent: true }).catch(() => null);
    return response?.canonicalId ?? null;
  },
  async assign(ids: ID[], assessorId: ID) {
    if (IS_API) return void (await mutate("/findings/assign", { ids, assessorId }));
    await delay(LATENCY);
    store().assignFindings(ids, assessorId);
  },
  async markEvidenceReviewed(evidenceId: ID, reviewed: boolean) {
    if (IS_API) return void (await mutate(`/evidence/${evidenceId}`, { reviewed }, "PATCH"));
    store().markEvidenceReviewed(evidenceId, reviewed);
  },
  /** Records a finding observed during manual testing. Always starts as pending verification. */
  async createManual(input: ManualFindingInput): Promise<{ id: ID; code: string }> {
    if (IS_API) return mutate<{ id: ID; code: string }>("/findings/manual", input);
    await delay(LATENCY);
    return store().createManualFinding(input);
  },
  /** A lead signs off a confirmed critical or high finding, or returns it for another look. */
  signoff(findingId: ID, decision: "approve" | "return", note: string): Promise<void> {
    if (!IS_API) return needsServer();
    return mutate(`/findings/${findingId}/signoff`, { decision, note });
  },
  async addEvidence(findingId: ID, title: string, content: string) {
    if (IS_API) return void (await mutate(`/findings/${findingId}/evidence`, { title, content }));
    await delay(150);
    store().addManualEvidence(findingId, title, content);
  },
};

export const analysisService = {
  adapterLabel: IS_API ? "Server-side analysis service" : aiService.label,
  async analyze(req: Omit<AIAnalysisRequest, "requestedBy">): Promise<AIAnalysis> {
    if (IS_API) return mutate<AIAnalysis>("/ai/analyses", { mode: req.mode, projectId: req.project.id, findingId: req.finding?.id, scanId: req.scan?.id });
    const analysis = await aiService.analyze({ ...req, requestedBy: useSessionStore.getState().userId ?? "usr-admin" });
    store().addAnalysis(analysis);
    return analysis;
  },
  async sendToVerification(analysisId: ID) {
    if (IS_API) return void (await mutate(`/ai/analyses/${analysisId}`, { status: "sent_to_verification" }, "PATCH"));
    store().setAnalysisStatus(analysisId, "sent_to_verification");
  },
};

export const assessmentService = {
  async ensure(projectId: ID, category: Args<"ensureAssessment">[1]) {
    if (IS_API) return void (await mutate("/assessments", { projectId, category }));
    store().ensureAssessment(projectId, category);
  },
  async updateItem(...[assessmentId, itemId, patch]: Args<"updateChecklistItem">) {
    if (IS_API) return void (await mutate(`/assessments/${assessmentId}/items/${itemId}`, patch, "PATCH"));
    store().updateChecklistItem(assessmentId, itemId, patch);
  },
  async update(...[assessmentId, patch]: Args<"updateAssessment">) {
    if (IS_API) return void (await mutate(`/assessments/${assessmentId}`, patch, "PATCH"));
    store().updateAssessment(assessmentId, patch);
  },
};

export const riskService = {
  async update(id: ID, patch: Args<"updateRisk">[1]) {
    if (IS_API) return void (await mutate(`/risks/${id}`, patch, "PATCH"));
    await delay(150);
    store().updateRisk(id, patch);
  },
};

export const remediationService = {
  async create(input: Args<"createTask">[0]): Promise<RemediationTask> {
    if (IS_API) return mutate<RemediationTask>("/remediation", input);
    await delay(LATENCY);
    return store().createTask(input);
  },
  async update(id: ID, patch: Args<"updateTask">[1]) {
    if (IS_API) return void (await mutate(`/remediation/${id}`, patch, "PATCH"));
    await delay(LATENCY);
    store().updateTask(id, patch);
  },
  async setStatus(id: ID, to: RemediationStatus, note: string) {
    if (IS_API) return void (await mutate(`/remediation/${id}/status`, { to, note }));
    await delay(LATENCY);
    const res = store().updateTaskStatus(id, to, note);
    if (!res.ok) throw new Error(res.reason);
  },
  async recordRetest(id: ID, result: "passed" | "failed", note: string) {
    if (IS_API) return void (await mutate(`/remediation/${id}/retest`, { result, note }));
    await delay(LATENCY);
    store().recordRetest(id, result, note);
  },
};

export const reportService = {
  async create(input: Args<"createReport">[0]): Promise<Report> {
    if (IS_API) return mutate<Report>("/reports", input);
    await delay(600);
    return store().createReport(input);
  },
  async update(id: ID, patch: Args<"updateReport">[1]) {
    if (IS_API) return void (await mutate(`/reports/${id}`, patch, "PATCH"));
    store().updateReport(id, patch);
  },
  /** Author sends a draft to the lead. */
  submit(id: ID): Promise<void> {
    if (!IS_API) return needsServer();
    return mutate(`/reports/${id}/submit`);
  },
  /** A lead who did not write it makes it final. */
  approve(id: ID, note = ""): Promise<void> {
    if (!IS_API) return needsServer();
    return mutate(`/reports/${id}/approve`, { note });
  },
  /** A lead sends it back to the author as a draft, with what to change. */
  sendBack(id: ID, note: string): Promise<void> {
    if (!IS_API) return needsServer();
    return mutate(`/reports/${id}/return`, { note });
  },
  logExport(id: ID, format: string) {
    if (IS_API) return void api(`/reports/${id}/export`, { body: { format }, silent: true }).catch(() => undefined);
    store().logReportExport(id, format);
  },
};

export const userService = {
  async update(id: ID, patch: Partial<Pick<User, "role" | "status" | "title" | "assignedProjectIds">>) {
    if (IS_API) return void (await mutate(`/users/${id}`, patch, "PATCH"));
    await delay(LATENCY);
    store().updateUser(id, patch);
  },
};

export const notificationService = {
  markRead(id: ID) {
    store().markNotificationRead(id);
    if (IS_API) void api(`/notifications/${id}/read`, { body: {}, silent: true }).catch(() => undefined);
  },
  markAllRead() {
    store().markAllNotificationsRead();
    if (IS_API) void api("/notifications/read-all", { body: {}, silent: true }).catch(() => undefined);
  },
  clear() {
    store().clearNotifications();
    if (IS_API) void api("/notifications", { method: "DELETE", silent: true }).catch(() => undefined);
  },
  async test() {
    if (IS_API) return void (await mutate("/notifications/test"));
    store().pushNotification({ title: "Test notification", message: "Notifications are working (demo).", tone: "info" });
  },
};

export const settingsService = {
  /** Applied locally at once (e.g. theme), then persisted to the server in API mode. */
  update<K extends keyof ApplicationSettings>(section: K, patch: Partial<ApplicationSettings[K]>) {
    store().updateSettings(section, patch);
    if (IS_API) void api(`/settings/${section}`, { method: "PATCH", body: patch }).catch(() => refresh().catch(() => undefined));
  },
  async resetDemo() {
    if (IS_API) {
      await api("/admin/reset-demo", { body: {} });
      useSessionStore.getState().signOut();
      return;
    }
    store().resetDemo();
  },
};
