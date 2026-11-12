/**
 * Single source of truth for all demo entities.
 *
 * Persisted to localStorage (key `aegis-demo-state`) with versioned
 * initialisation: when SEED_VERSION changes, state is re-seeded. Every mutating
 * action records an entry in the (demonstration) activity log.
 *
 * Pages should not call these actions directly for writes, they go through
 * the service layer in `src/services`, which will later be backed by the API.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ActivityLog,
  ActivityType,
  AIAnalysis,
  ApplicationSettings,
  Assessment,
  AssessmentCategoryId,
  ChecklistItem,
  DnsRecord,
  Endpoint,
  EntityType,
  Evidence,
  Host,
  ID,
  Integration,
  Notification,
  Port,
  Project,
  ReconRun,
  RemediationStatus,
  RemediationTask,
  Report,
  Risk,
  Scan,
  ScanResult,
  Target,
  TargetScope,
  User,
  Verification,
  VerificationStatus,
  VulnerabilityFinding,
} from "@/types";
import * as seed from "@/data/seed";
import { createId } from "@/lib/utils";
import { nowISO } from "@/lib/format";
import { CATEGORIES } from "@/lib/constants";
import { defaultRiskInputs } from "@/lib/risk";
import { generateSimulation } from "@/features/simulation/generator";
import type { ParseResult } from "@/features/imports/parsers";
import { buildImport, type ImportBundle } from "@/features/imports/buildImport";
import { awaitsReview, uniqueFindings } from "@/features/scanLifecycle";
import { useSessionStore } from "./sessionStore";
import { DATA_MODE } from "@/services/api/contracts";

export interface DataState {
  users: User[];
  projects: Project[];
  targets: Target[];
  assessments: Assessment[];
  scans: Scan[];
  scanResults: ScanResult[];
  hosts: Host[];
  ports: Port[];
  dnsRecords: DnsRecord[];
  endpoints: Endpoint[];
  reconRuns: ReconRun[];
  findings: VulnerabilityFinding[];
  evidence: Evidence[];
  verifications: Verification[];
  aiAnalyses: AIAnalysis[];
  risks: Risk[];
  remediation: RemediationTask[];
  reports: Report[];
  activity: ActivityLog[];
  notifications: Notification[];
  integrations: Integration[];
  settings: ApplicationSettings;
  seededAt: string;
}

type ProjectInput = Omit<Project, "id" | "code" | "createdAt" | "updatedAt" | "dataOrigin" | "statusBeforeArchive">;
type TargetInput = Omit<Target, "id" | "createdAt" | "updatedAt" | "dataOrigin" | "authorizationConfirmedBy" | "authorizationConfirmedAt">;
export type SimulatedRemoval = { scans: number; findings: number };
type ScanInput = Pick<Scan, "name" | "projectId" | "targetId" | "config">;
type TaskInput = Pick<RemediationTask, "findingId" | "title" | "description" | "recommendation" | "ownerId" | "priority" | "dueDate" | "retestRequired">;
type ReportInput = Omit<Report, "id" | "code" | "createdAt" | "updatedAt" | "createdBy" | "generatedFrom">;
export type ManualFindingInput = Pick<VulnerabilityFinding, "title" | "description" | "targetId" | "category" | "severity" | "affectedAsset" | "impact" | "remediation"> & {
  parameter?: string;
  cwe?: string;
  evidenceTitle: string;
  evidenceContent: string;
  checklistRef?: { assessmentId: ID; itemId: ID };
};

export interface DataActions {
  // projects
  createProject: (input: ProjectInput) => Project;
  updateProject: (id: ID, patch: Partial<ProjectInput>) => void;
  archiveProject: (id: ID) => void;
  restoreProject: (id: ID) => void;
  // targets
  createTarget: (input: TargetInput) => Target;
  updateTarget: (id: ID, patch: Partial<TargetInput>) => void;
  updateScope: (id: ID, scope: TargetScope) => void;
  deleteTarget: (id: ID) => void;
  // scans
  createSimulatedScan: (input: ScanInput) => Scan;
  setScanProgress: (id: ID, progress: number, stage: string) => void;
  completeSimulatedScan: (id: ID) => number;
  cancelScan: (id: ID) => void;
  pauseScan: (id: ID) => void;
  resumeScan: (id: ID) => void;
  /** Deletes every SIMULATED record and anything attached to it. Real data is untouched. */
  removeSimulatedData: () => SimulatedRemoval;
  // recon
  importSampleRecon: (targetId: ID) => number;
  // tool output import (parsed client-side; never runs the tool)
  importToolOutput: (input: { parsed: ParseResult; targetId: ID; raw: string; fileName: string }) => ImportBundle | null;
  // manual testing
  createManualFinding: (input: ManualFindingInput) => VulnerabilityFinding;
  addManualEvidence: (findingId: ID, title: string, content: string) => Evidence | undefined;
  // findings
  recordVerification: (input: { findingId: ID; toStatus: VerificationStatus; notes: string; decisionReason: string; evidenceReviewed: boolean }) => void;
  assignFindings: (ids: ID[], assessorId: ID) => void;
  markEvidenceReviewed: (evidenceId: ID, reviewed: boolean) => void;
  // AI
  addAnalysis: (analysis: AIAnalysis) => void;
  setAnalysisStatus: (id: ID, status: AIAnalysis["status"]) => void;
  // assessments
  ensureAssessment: (projectId: ID, category: AssessmentCategoryId) => Assessment;
  updateChecklistItem: (assessmentId: ID, itemId: ID, patch: Partial<Pick<ChecklistItem, "result" | "observation" | "evidenceNote">>) => void;
  updateAssessment: (assessmentId: ID, patch: Partial<Pick<Assessment, "status" | "assessorId">>) => void;
  // risks
  ensureRisk: (findingId: ID) => Risk | undefined;
  updateRisk: (id: ID, patch: Partial<Omit<Risk, "id" | "findingId" | "createdAt">>) => void;
  // remediation
  createTask: (input: TaskInput) => RemediationTask;
  updateTaskStatus: (id: ID, to: RemediationStatus, note: string) => { ok: boolean; reason?: string };
  recordRetest: (id: ID, result: "passed" | "failed", note: string) => void;
  updateTask: (id: ID, patch: Partial<TaskInput>) => void;
  // reports
  createReport: (input: ReportInput) => Report;
  updateReport: (id: ID, patch: Partial<ReportInput>) => void;
  logReportExport: (id: ID, format: string) => void;
  // users & settings
  updateUser: (id: ID, patch: Partial<Pick<User, "role" | "status" | "title" | "assignedProjectIds">>) => void;
  updateSettings: <K extends keyof ApplicationSettings>(section: K, patch: Partial<ApplicationSettings[K]>) => void;
  // notifications
  pushNotification: (n: Omit<Notification, "id" | "createdAt" | "read">) => void;
  markNotificationRead: (id: ID) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;
  // activity
  log: (type: ActivityType, entityType: EntityType, entityId: ID | undefined, entityLabel: string, description: string) => void;
  resetDemo: () => void;
}

export type DataStore = DataState & DataActions;

export function createSeedState(): DataState {
  // structuredClone guarantees seed constants are never mutated by the store.
  return structuredClone({
    users: seed.seedUsers,
    projects: seed.seedProjects,
    targets: seed.seedTargets,
    assessments: seed.seedAssessments,
    scans: seed.seedScans,
    scanResults: seed.seedScanResults,
    hosts: seed.seedHosts,
    ports: seed.seedPorts,
    dnsRecords: seed.seedDns,
    endpoints: seed.seedEndpoints,
    reconRuns: seed.seedReconRuns,
    findings: seed.seedFindings,
    evidence: seed.seedEvidence,
    verifications: seed.seedVerifications,
    aiAnalyses: seed.seedAIAnalyses,
    risks: seed.seedRisks,
    remediation: seed.seedRemediation,
    reports: seed.seedReports,
    activity: seed.seedActivity,
    notifications: seed.seedNotifications,
    integrations: seed.seedIntegrations,
    settings: seed.defaultSettings,
    seededAt: nowISO(),
  });
}

/** Next AUTH-YYYY-NNNN authorization record number. */
export function nextAuthReference(existing: string[]): string {
  const prefix = `AUTH-${new Date().getFullYear()}-`;
  const max = existing.reduce((m, r) => (r.startsWith(prefix) ? Math.max(m, Number(r.slice(prefix.length)) || 0) : m), 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

function nextCode(prefix: string, codes: string[], pad = 4): string {
  const max = codes.reduce((m, c) => {
    const n = Number.parseInt(c.split("-").pop() ?? "0", 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(pad, "0")}`;
}

const currentUser = () => useSessionStore.getState().userId ?? "usr-admin";

const VERIFICATION_ACTIVITY: Record<VerificationStatus, ActivityType> = {
  confirmed: "finding_confirmed",
  rejected: "finding_rejected",
  needs_review: "finding_needs_review",
  pending: "finding_reviewed",
};

export const useDataStore = create<DataStore>()(
  persist(
    (set, get) => ({
      ...createSeedState(),

      log: (type, entityType, entityId, entityLabel, description) =>
        set((s) => ({
          activity: [{ id: createId("act"), type, userId: currentUser(), timestamp: nowISO(), entityType, entityId, entityLabel, description }, ...s.activity].slice(0, 500),
        })),

      pushNotification: (n) =>
        set((s) => ({ notifications: [{ ...n, id: createId("ntf"), createdAt: nowISO(), read: false }, ...s.notifications].slice(0, 100) })),
      markNotificationRead: (id) => set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
      markAllNotificationsRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
      clearNotifications: () => set({ notifications: [] }),

      /* ------------------------------ Projects ------------------------------ */
      createProject: (input) => {
        const year = new Date().getFullYear();
        const code = nextCode(`AIV-${year}`, get().projects.filter((p) => p.code.startsWith(`AIV-${year}`)).map((p) => p.code), 3);
        const now = nowISO();
        const project: Project = { ...input, id: createId("prj"), code, createdAt: now, updatedAt: now, dataOrigin: "user_created" };
        set((s) => ({ projects: [project, ...s.projects] }));
        get().log("project_created", "project", project.id, project.code, `Created project ${project.name}`);
        return project;
      },
      updateProject: (id, patch) => {
        set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: nowISO() } : p)) }));
        const p = get().projects.find((x) => x.id === id);
        if (p) get().log("project_updated", "project", id, p.code, `Updated project ${p.name}`);
      },
      archiveProject: (id) => {
        set((s) => ({ projects: s.projects.map((p) => (p.id === id && p.status !== "archived" ? { ...p, statusBeforeArchive: p.status, status: "archived", updatedAt: nowISO() } : p)) }));
        const p = get().projects.find((x) => x.id === id);
        if (p) get().log("project_archived", "project", id, p.code, `Archived project ${p.name}`);
      },
      restoreProject: (id) => {
        set((s) => ({ projects: s.projects.map((p) => (p.id === id && p.status === "archived" ? { ...p, status: p.statusBeforeArchive ?? "planning", statusBeforeArchive: undefined, updatedAt: nowISO() } : p)) }));
        const p = get().projects.find((x) => x.id === id);
        if (p) get().log("project_restored", "project", id, p.code, `Restored project ${p.name}`);
      },

      /* ------------------------------- Targets ------------------------------ */
      createTarget: (input) => {
        const now = nowISO();
        const target: Target = {
          ...input,
          projectId: input.projectId || undefined,
          authorizationReference: input.authorizationReference || nextAuthReference(get().targets.map((t) => t.authorizationReference)),
          id: createId("tgt"),
          authorizationConfirmedBy: input.authorizationConfirmed ? currentUser() : undefined,
          authorizationConfirmedAt: input.authorizationConfirmed ? now : undefined,
          createdAt: now,
          updatedAt: now,
          dataOrigin: "user_created",
        };
        set((s) => ({ targets: [target, ...s.targets] }));
        get().log("target_registered", "target", target.id, target.name, `Registered target ${target.name} (details saved, no scan started)`);
        return target;
      },
      updateTarget: (id, patch) => {
        set((s) => ({
          targets: s.targets.map((t) => {
            if (t.id !== id) return t;
            const confirmedNow = patch.authorizationConfirmed && !t.authorizationConfirmed;
            return {
              ...t,
              ...patch,
              authorizationConfirmedBy: confirmedNow ? currentUser() : t.authorizationConfirmedBy,
              authorizationConfirmedAt: confirmedNow ? nowISO() : t.authorizationConfirmedAt,
              updatedAt: nowISO(),
            };
          }),
        }));
        const t = get().targets.find((x) => x.id === id);
        if (t) get().log("target_updated", "target", id, t.name, `Updated target ${t.name}`);
      },
      updateScope: (id, scope) => {
        set((s) => ({ targets: s.targets.map((t) => (t.id === id ? { ...t, scope, updatedAt: nowISO() } : t)) }));
        const t = get().targets.find((x) => x.id === id);
        if (t) get().log("scope_updated", "target", id, t.name, `Updated scope: ${scope.inScopeHosts.length} host(s), ${scope.excludedPaths.length} exclusion(s)`);
      },
      deleteTarget: (id) => {
        const s = get();
        const target = s.targets.find((t) => t.id === id);
        if (!target) return;
        if (s.scans.some((scan) => scan.targetId === id && ["queued", "running", "paused"].includes(scan.status))) throw new Error("Wait for the active scan to finish before deleting this target.");
        const scanIds = new Set(s.scans.filter((scan) => scan.targetId === id).map((scan) => scan.id));
        const findingIds = new Set(s.findings.filter((finding) => finding.targetId === id).map((finding) => finding.id));
        const hostIds = new Set(s.hosts.filter((host) => host.targetId === id).map((host) => host.id));
        set((state) => ({
          targets: state.targets.filter((item) => item.id !== id),
          scans: state.scans.filter((item) => item.targetId !== id),
          scanResults: state.scanResults.filter((item) => !scanIds.has(item.scanId)),
          findings: state.findings.filter((item) => item.targetId !== id),
          evidence: state.evidence.filter((item) => !findingIds.has(item.findingId)),
          verifications: state.verifications.filter((item) => !findingIds.has(item.findingId)),
          aiAnalyses: state.aiAnalyses.filter((item) => item.targetId !== id && !findingIds.has(item.findingId ?? "") && !scanIds.has(item.scanId ?? "")),
          risks: state.risks.filter((item) => !findingIds.has(item.findingId)),
          remediation: state.remediation.filter((item) => !findingIds.has(item.findingId)),
          hosts: state.hosts.filter((item) => item.targetId !== id),
          ports: state.ports.filter((item) => !hostIds.has(item.hostId)),
          dnsRecords: state.dnsRecords.filter((item) => item.targetId !== id),
          endpoints: state.endpoints.filter((item) => item.targetId !== id),
          reconRuns: state.reconRuns.filter((item) => item.targetId !== id),
          notifications: state.notifications.filter((item) => item.link !== `/targets/${id}` && !scanIds.has(item.link?.split("/scans/")[1] ?? "") && !findingIds.has(item.link?.split("/findings/")[1] ?? "")),
          reports: state.reports.filter((report) => report.targetIds.some((targetId) => targetId !== id)).map((report) => ({ ...report, targetIds: report.targetIds.filter((targetId) => targetId !== id), findingIds: report.findingIds.filter((findingId) => !findingIds.has(findingId)) })),
        }));
        get().log("target_updated", "target", id, target.name, `Deleted target ${target.name} and its assessment records`);
      },

      pauseScan: (id) => {
        set((s) => ({ scans: s.scans.map((sc) => (sc.id === id && sc.status === "running" ? { ...sc, status: "paused", stage: `Paused at ${sc.progress}%` } : sc)) }));
        const sc = get().scans.find((x) => x.id === id);
        if (sc) get().log("demo_scan_paused", "scan", id, sc.code, `Paused demo simulation at ${sc.progress}%`);
      },
      resumeScan: (id) => {
        set((s) => ({ scans: s.scans.map((sc) => (sc.id === id && sc.status === "paused" ? { ...sc, status: "running", stage: "Resuming" } : sc)) }));
        const sc = get().scans.find((x) => x.id === id);
        if (sc) get().log("demo_scan_resumed", "scan", id, sc.code, `Resumed demo simulation from ${sc.progress}%`);
      },
      removeSimulatedData: () => {
        const s = get();
        const sim = <T extends { dataOrigin?: string }>(x: T) => x.dataOrigin === "simulated";
        const scanIds = new Set(s.scans.filter(sim).map((x) => x.id));
        const findingIds = new Set(s.findings.filter((f) => sim(f) || (f.scanId && scanIds.has(f.scanId))).map((f) => f.id));
        const hostIds = new Set(s.hosts.filter((h) => sim(h) || (h.scanId && scanIds.has(h.scanId))).map((h) => h.id));
        const taskIds = new Set(s.remediation.filter((t) => findingIds.has(t.findingId)).map((t) => t.id));
        const counts: SimulatedRemoval = { scans: scanIds.size, findings: findingIds.size };
        set({
          scans: s.scans.filter((x) => !scanIds.has(x.id)),
          scanResults: s.scanResults.filter((x) => !scanIds.has(x.scanId) && !sim(x)),
          findings: s.findings.filter((x) => !findingIds.has(x.id)),
          evidence: s.evidence.filter((x) => !findingIds.has(x.findingId) && !sim(x)),
          verifications: s.verifications.filter((x) => !findingIds.has(x.findingId)),
          risks: s.risks.filter((x) => !findingIds.has(x.findingId)),
          remediation: s.remediation.filter((x) => !taskIds.has(x.id)),
          aiAnalyses: s.aiAnalyses.filter((x) => !(x.findingId && findingIds.has(x.findingId)) && !(x.scanId && scanIds.has(x.scanId))),
          hosts: s.hosts.filter((x) => !hostIds.has(x.id)),
          ports: s.ports.filter((x) => !hostIds.has(x.hostId) && !sim(x)),
          dnsRecords: s.dnsRecords.filter((x) => !sim(x)),
          endpoints: s.endpoints.filter((x) => !sim(x)),
          reconRuns: s.reconRuns.filter((x) => !sim(x)),
        });
        get().log("simulated_data_removed", "settings", undefined, "Simulated data", `Removed ${counts.scans} simulated scan(s) and ${counts.findings} simulated finding(s). Real data was not changed.`);
        return counts;
      },

      /* -------------------------------- Scans ------------------------------- */
      createSimulatedScan: (input) => {
        if (get().scans.some((scan) => scan.targetId === input.targetId && ["queued", "running", "paused"].includes(scan.status))) throw new Error("A scan is already in progress for this target.");
        if (get().findings.some((finding) => finding.targetId === input.targetId && awaitsReview(finding))) throw new Error("Finish reviewing this target's pending findings before scanning again.");
        const now = nowISO();
        const scan: Scan = {
          ...input,
          id: createId("scn"),
          code: nextCode("SCN", get().scans.map((s) => s.code)),
          status: "running",
          progress: 0,
          stage: "Queued for simulation",
          createdBy: currentUser(),
          createdAt: now,
          startedAt: now,
          dataOrigin: "simulated",
        };
        set((s) => ({ scans: [scan, ...s.scans] }));
        get().log("demo_scan_started", "scan", scan.id, scan.code, `Started demo simulation "${scan.name}" (SIMULATED, no network activity)`);
        return scan;
      },
      setScanProgress: (id, progress, stage) =>
        set((s) => ({ scans: s.scans.map((sc) => (sc.id === id && sc.status === "running" ? { ...sc, progress, stage } : sc)) })),
      completeSimulatedScan: (id) => {
        const state = get();
        const scan = state.scans.find((s) => s.id === id);
        const target = scan && state.targets.find((t) => t.id === scan.targetId);
        if (!scan || !target || scan.status !== "running") return 0;
        const now = nowISO();
        const startIndex = Number(nextCode("FND", state.findings.map((finding) => finding.code)).slice(4));
        const project = state.projects.find((p) => p.id === scan.projectId);
        const out = generateSimulation(scan, target, startIndex, project?.ownerId ?? currentUser(), now);
        const novel = uniqueFindings(out.findings, state.findings.filter((finding) => finding.targetId === target.id));
        const novelIds = new Set(novel.map((finding) => finding.id));
        set((s) => ({
          scans: s.scans.map((sc) => (sc.id === id ? { ...sc, status: "completed", progress: 100, stage: "Simulation complete", completedAt: now } : sc)),
          findings: [...novel, ...s.findings],
          evidence: [...out.evidence.filter((item) => novelIds.has(item.findingId)), ...s.evidence],
          scanResults: [...out.results, ...s.scanResults],
          hosts: [...out.hosts, ...s.hosts],
          ports: [...out.ports, ...s.ports],
          dnsRecords: [...out.dns, ...s.dnsRecords],
          endpoints: [...out.endpoints, ...s.endpoints],
          reconRuns: out.hosts.length || out.endpoints.length || out.dns.length
            ? [{ id: createId("rcn"), targetId: target.id, tool: scan.config.tools[0]!, label: `Simulated discovery (${scan.code})`, recordsAdded: out.hosts.length + out.ports.length + out.dns.length + out.endpoints.length, ranAt: now, dataOrigin: "simulated" }, ...s.reconRuns]
            : s.reconRuns,
          integrations: s.integrations.map((i) => (scan.config.tools.includes(i.id as never) ? { ...i, lastUsedAt: now } : i)),
        }));
        get().log("demo_scan_completed", "scan", id, scan.code, `Demo simulation produced ${novel.length} new finding(s), ${out.findings.length - novel.length} previously recorded`);
        if (get().settings.notifications.scanEvents)
          get().pushNotification({ title: "Demo simulation finished", message: `${scan.code}: ${novel.length} new findings require verification.`, tone: "info", link: `/scans/${id}` });
        return novel.length;
      },
      cancelScan: (id) => {
        set((s) => ({ scans: s.scans.map((sc) => (sc.id === id && (sc.status === "running" || sc.status === "queued" || sc.status === "paused") ? { ...sc, status: "cancelled", stage: "Cancelled by user", completedAt: nowISO() } : sc)) }));
        const sc = get().scans.find((x) => x.id === id);
        if (sc) get().log("demo_scan_cancelled", "scan", id, sc.code, `Cancelled demo simulation ${sc.name}`);
      },

      /* -------------------------------- Recon ------------------------------- */
      importSampleRecon: (targetId) => {
        const target = get().targets.find((t) => t.id === targetId);
        if (!target) return 0;
        const host = (() => {
          try {
            return new URL(target.url).hostname;
          } catch {
            return target.url;
          }
        })();
        const now = nowISO();
        const tag = createId("imp");
        const hostId = `hst-${tag}`;
        const ip = host === "localhost" ? "127.0.0.1" : "198.51.100.77";
        const hosts: Host[] = [{ id: hostId, targetId, hostname: host, ipAddress: ip, state: "up", osGuess: "Linux (sample)", source: "nmap", observedAt: now, dataOrigin: "imported" }];
        const ports: Port[] = [
          { id: `prt-${tag}-1`, hostId, port: 443, protocol: "tcp", state: "open", service: "https", version: "nginx (sample)", source: "nmap", observedAt: now, dataOrigin: "imported" },
          { id: `prt-${tag}-2`, hostId, port: 8080, protocol: "tcp", state: "filtered", service: "http-proxy", version: "unknown (sample)", source: "nmap", observedAt: now, dataOrigin: "imported" },
        ];
        const dns: DnsRecord[] = [{ id: `dns-${tag}`, targetId, name: host, type: "A", value: ip, ttl: 300, source: "dns_utils", observedAt: now, dataOrigin: "imported" }];
        const endpoints: Endpoint[] = target.scope.allowedPaths.slice(0, 4).map((p, i) => ({
          id: `ept-${tag}-${i}`, targetId, method: "GET", path: p.replace("*", ""), statusCode: 200, contentType: "text/html", authRequired: false, source: "owasp_zap", observedAt: now, dataOrigin: "imported",
        }));
        const count = hosts.length + ports.length + dns.length + endpoints.length;
        set((s) => ({
          hosts: [...hosts, ...s.hosts],
          ports: [...ports, ...s.ports],
          dnsRecords: [...dns, ...s.dnsRecords],
          endpoints: [...endpoints, ...s.endpoints],
          reconRuns: [{ id: createId("rcn"), targetId, tool: "nmap", label: "Imported demo sample bundle", recordsAdded: count, ranAt: now, dataOrigin: "imported" }, ...s.reconRuns],
        }));
        get().log("recon_imported", "target", targetId, target.name, `Imported ${count} sample reconnaissance records (synthetic, no lookup performed)`);
        return count;
      },

      importToolOutput: ({ parsed, targetId, raw, fileName }) => {
        const state = get();
        const target = state.targets.find((t) => t.id === targetId);
        if (!target || !target.projectId || target.authorizationStatus !== "authorized" || !target.authorizationConfirmed) return null;
        if (state.scans.some((scan) => scan.targetId === targetId && ["queued", "running", "paused"].includes(scan.status))) throw new Error("A scan is already in progress for this target.");
        if (state.findings.some((finding) => finding.targetId === targetId && awaitsReview(finding))) throw new Error("Finish reviewing this target's pending findings before importing another scan.");
        const project = state.projects.find((p) => p.id === target.projectId);
        const scanId = createId("scn");
        const now = nowISO();
        const bundle = buildImport(parsed, { ...target, projectId: target.projectId }, {
          scanId,
          scanCode: nextCode("SCN", state.scans.map((s) => s.code)),
          findingStartIndex: Number(nextCode("FND", state.findings.map((finding) => finding.code)).slice(4)),
          createdBy: currentUser(),
          assessorId: project?.ownerId ?? currentUser(),
          now,
          raw,
          fileName,
        });
        const novel = uniqueFindings(bundle.findings, state.findings.filter((finding) => finding.targetId === targetId));
        const novelIds = new Set(novel.map((finding) => finding.id));
        bundle.findings = novel;
        bundle.evidence = bundle.evidence.filter((item) => novelIds.has(item.findingId));
        set((s) => ({
          scans: [bundle.scan, ...s.scans],
          scanResults: [bundle.result, ...s.scanResults],
          hosts: [...bundle.hosts, ...s.hosts],
          ports: [...bundle.ports, ...s.ports],
          endpoints: [...bundle.endpoints, ...s.endpoints],
          findings: [...bundle.findings, ...s.findings],
          evidence: [...bundle.evidence, ...s.evidence],
          reconRuns: [{ id: createId("rcn"), targetId, tool: bundle.result.tool, label: `Imported ${fileName} (${bundle.scan.code})`, recordsAdded: bundle.hosts.length + bundle.ports.length + bundle.endpoints.length, ranAt: now, dataOrigin: "imported" }, ...s.reconRuns],
          integrations: s.integrations.map((i) => (i.id === bundle.result.tool ? { ...i, lastUsedAt: now } : i)),
        }));
        get().log("tool_output_imported", "scan", scanId, bundle.scan.code, `Imported ${fileName} for ${target.name}: ${bundle.findings.length} finding(s) pending verification, ${bundle.skipped.length} out-of-scope item(s) skipped`);
        if (get().settings.notifications.scanEvents)
          get().pushNotification({ title: "Tool output imported", message: `${bundle.scan.code}: ${bundle.findings.length} finding(s) await verification.`, tone: "info", link: `/scans/${scanId}` });
        return bundle;
      },

      createManualFinding: (input) => {
        const state = get();
        const target = state.targets.find((t) => t.id === input.targetId)!;
        if (!target.projectId) throw new Error("Add this target to a project before recording findings.");
        const projectId = target.projectId;
        const now = nowISO();
        const id = createId("fnd");
        const finding: VulnerabilityFinding = {
          id,
          code: nextCode("FND", state.findings.map((finding) => finding.code)),
          title: input.title,
          description: input.description,
          projectId,
          targetId: target.id,
          category: input.category,
          severity: input.severity,
          affectedAsset: input.affectedAsset,
          parameter: input.parameter || undefined,
          sourceTool: "manual",
          verificationStatus: "pending",
          assignedAssessorId: currentUser(),
          discoveredAt: now,
          updatedAt: now,
          impact: input.impact,
          remediation: input.remediation,
          cwe: input.cwe || undefined,
          owasp: CATEGORIES.find((c) => c.id === input.category)?.owasp,
          templateKey: "manual",
          dataOrigin: "user_created",
        };
        const ev: Evidence = { id: `ev-${id}-1`, findingId: id, type: "manual_note", title: input.evidenceTitle, content: input.evidenceContent, source: "manual", capturedAt: now, reviewed: false, dataOrigin: "user_created" };
        set((s) => ({
          findings: [finding, ...s.findings],
          evidence: [ev, ...s.evidence],
          assessments: input.checklistRef
            ? s.assessments.map((a) =>
                a.id === input.checklistRef!.assessmentId
                  ? { ...a, updatedAt: now, checklist: a.checklist.map((c) => (c.id === input.checklistRef!.itemId ? { ...c, result: "fail", evidenceNote: [c.evidenceNote, finding.code].filter(Boolean).join(" · "), updatedAt: now, updatedBy: currentUser() } : c)) }
                  : a,
              )
            : s.assessments,
        }));
        get().log("finding_recorded", "finding", id, finding.code, `Recorded manual finding "${finding.title}" (pending verification)`);
        return finding;
      },

      addManualEvidence: (findingId, title, content) => {
        const f = get().findings.find((x) => x.id === findingId);
        if (!f) return undefined;
        const n = get().evidence.filter((e) => e.findingId === findingId).length + 1;
        const ev: Evidence = { id: `ev-${findingId}-m${n}-${Date.now().toString(36)}`, findingId, type: "manual_note", title, content, source: "manual", capturedAt: nowISO(), reviewed: false, dataOrigin: "user_created" };
        set((s) => ({ evidence: [...s.evidence, ev] }));
        get().log("evidence_added", "finding", findingId, f.code, `Added manual evidence "${title}"`);
        return ev;
      },

      /* ------------------------------ Findings ------------------------------ */
      recordVerification: ({ findingId, toStatus, notes, decisionReason, evidenceReviewed }) => {
        const finding = get().findings.find((f) => f.id === findingId);
        if (!finding) return;
        const now = nowISO();
        const v: Verification = { id: createId("ver"), findingId, fromStatus: finding.verificationStatus, toStatus, assessorId: currentUser(), notes, decisionReason, evidenceReviewed, decidedAt: now };
        set((s) => ({
          verifications: [v, ...s.verifications],
          findings: s.findings.map((f) => (f.id === findingId ? { ...f, verificationStatus: toStatus, updatedAt: now } : f)),
          evidence: evidenceReviewed ? s.evidence.map((e) => (e.findingId === findingId ? { ...e, reviewed: true, reviewedBy: currentUser() } : e)) : s.evidence,
        }));
        get().log(VERIFICATION_ACTIVITY[toStatus], "finding", findingId, finding.code, `Marked "${finding.title}" as ${toStatus.replace("_", " ")}. Reason: ${decisionReason || "N/A"}`);
        if (toStatus === "confirmed") get().ensureRisk(findingId);
        if (get().settings.notifications.findingUpdates && toStatus === "confirmed" && (finding.severity === "critical" || finding.severity === "high"))
          get().pushNotification({ title: `${finding.severity === "critical" ? "Critical" : "High"} vulnerability confirmed`, message: `${finding.code} ${finding.title}`, tone: "critical", link: `/findings/${findingId}` });
      },
      assignFindings: (ids, assessorId) => {
        set((s) => ({ findings: s.findings.map((f) => (ids.includes(f.id) ? { ...f, assignedAssessorId: assessorId, updatedAt: nowISO() } : f)) }));
        const user = get().users.find((u) => u.id === assessorId);
        get().log("finding_reviewed", "finding", ids[0], `${ids.length} finding(s)`, `Assigned ${ids.length} finding(s) to ${user?.name ?? assessorId}`);
      },
      markEvidenceReviewed: (evidenceId, reviewed) => {
        set((s) => ({ evidence: s.evidence.map((e) => (e.id === evidenceId ? { ...e, reviewed, reviewedBy: reviewed ? currentUser() : undefined } : e)) }));
        const e = get().evidence.find((x) => x.id === evidenceId);
        if (e && reviewed) get().log("evidence_reviewed", "finding", e.findingId, e.title, "Marked evidence item as reviewed");
      },

      /* --------------------------------- AI --------------------------------- */
      addAnalysis: (analysis) => {
        set((s) => ({ aiAnalyses: [analysis, ...s.aiAnalyses], integrations: s.integrations.map((i) => (i.id === "ai_service" ? { ...i, lastUsedAt: analysis.generatedAt } : i)) }));
        get().log("ai_analysis_generated", analysis.findingId ? "finding" : "project", analysis.findingId ?? analysis.projectId, analysis.title, "Generated sample AI analysis (demo adapter, not an LLM)");
      },
      setAnalysisStatus: (id, status) => set((s) => ({ aiAnalyses: s.aiAnalyses.map((a) => (a.id === id ? { ...a, status } : a)) })),

      /* ----------------------------- Assessments ---------------------------- */
      ensureAssessment: (projectId, category) => {
        const existing = get().assessments.find((a) => a.projectId === projectId && a.category === category);
        if (existing) return existing;
        const meta = CATEGORIES.find((c) => c.id === category)!;
        const project = get().projects.find((p) => p.id === projectId);
        const a: Assessment = {
          id: createId("asm"),
          projectId,
          category,
          status: "not_started",
          assessorId: project?.ownerId ?? currentUser(),
          updatedAt: nowISO(),
          checklist: meta.checklist.map((c, i) => ({ id: createId(`chk${i}`), title: c.title, kind: c.kind, tool: c.tool, result: "not_tested", observation: "", evidenceNote: "" })),
        };
        set((s) => ({ assessments: [...s.assessments, a] }));
        return a;
      },
      updateChecklistItem: (assessmentId, itemId, patch) => {
        set((s) => ({
          assessments: s.assessments.map((a) =>
            a.id === assessmentId
              ? {
                  ...a,
                  status: a.status === "not_started" ? "in_progress" : a.status,
                  updatedAt: nowISO(),
                  checklist: a.checklist.map((c) => (c.id === itemId ? { ...c, ...patch, updatedAt: nowISO(), updatedBy: currentUser() } : c)),
                }
              : a,
          ),
        }));
      },
      updateAssessment: (assessmentId, patch) => {
        set((s) => ({ assessments: s.assessments.map((a) => (a.id === assessmentId ? { ...a, ...patch, updatedAt: nowISO() } : a)) }));
        const a = get().assessments.find((x) => x.id === assessmentId);
        if (a) get().log("assessment_updated", "assessment", a.id, CATEGORIES.find((c) => c.id === a.category)?.name ?? a.category, `Updated assessment ${patch.status ? `status to ${patch.status.replace("_", " ")}` : "details"}`);
      },

      /* -------------------------------- Risks ------------------------------- */
      ensureRisk: (findingId) => {
        const existing = get().risks.find((r) => r.findingId === findingId);
        if (existing) return existing;
        const f = get().findings.find((x) => x.id === findingId);
        if (!f) return undefined;
        const now = nowISO();
        const base = defaultRiskInputs(f.severity);
        const risk: Risk = {
          id: createId("rsk"), findingId, title: f.title, ...base, ownerId: f.assignedAssessorId, mitigationStatus: "not_started",
          reviewDate: new Date(Date.now() + 30 * 86400_000).toISOString(), notes: "Demo risk rating derived from severity (likelihood × impact). Not a CVSS score.", createdAt: now, updatedAt: now,
        };
        set((s) => ({ risks: [risk, ...s.risks] }));
        return risk;
      },
      updateRisk: (id, patch) => {
        set((s) => ({ risks: s.risks.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: nowISO() } : r)) }));
        const r = get().risks.find((x) => x.id === id);
        if (r) get().log("risk_updated", "risk", id, r.title, `Updated risk record (L${r.likelihood} × I${r.impact})`);
      },

      /* ----------------------------- Remediation ---------------------------- */
      createTask: (input) => {
        const now = nowISO();
        const task: RemediationTask = {
          ...input,
          id: createId("rem"),
          code: nextCode("REM", get().remediation.map((r) => r.code)),
          status: "open",
          retestResult: input.retestRequired ? "pending" : "not_required",
          createdAt: now,
          updatedAt: now,
          history: [{ at: now, by: currentUser(), to: "open", note: "Task created." }],
        };
        set((s) => ({ remediation: [task, ...s.remediation] }));
        const f = get().findings.find((x) => x.id === input.findingId);
        get().log("remediation_created", "remediation", task.id, task.code, `Created remediation task for ${f?.code ?? input.findingId}`);
        return task;
      },
      updateTask: (id, patch) => {
        set((s) => ({
          remediation: s.remediation.map((r) =>
            r.id === id
              ? { ...r, ...patch, retestResult: patch.retestRequired === undefined ? r.retestResult : patch.retestRequired ? (r.retestResult === "not_required" ? "pending" : r.retestResult) : "not_required", updatedAt: nowISO() }
              : r,
          ),
        }));
        const r = get().remediation.find((x) => x.id === id);
        if (r) get().log("remediation_updated", "remediation", id, r.code, "Updated remediation task details");
      },
      updateTaskStatus: (id, to, note) => {
        const task = get().remediation.find((r) => r.id === id);
        if (!task) return { ok: false, reason: "Task not found" };
        // Business rule: "Resolved" needs a human approval and, when required, a passed retest.
        if (to === "resolved" && task.retestRequired && task.retestResult !== "passed")
          return { ok: false, reason: "A passed retest is required before this task can be resolved." };
        const now = nowISO();
        set((s) => ({
          remediation: s.remediation.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: to,
                  updatedAt: now,
                  approvedBy: to === "resolved" || to === "accepted_risk" ? currentUser() : r.approvedBy,
                  approvedAt: to === "resolved" || to === "accepted_risk" ? now : r.approvedAt,
                  retestResult: to === "awaiting_retest" && r.retestRequired ? "pending" : r.retestResult,
                  history: [...r.history, { at: now, by: currentUser(), from: r.status, to, note }],
                }
              : r,
          ),
        }));
        get().log("remediation_updated", "remediation", id, task.code, `Status ${task.status.replace("_", " ")} → ${to.replace("_", " ")}${note ? `, ${note}` : ""}`);
        if (to === "resolved") {
          const risk = get().risks.find((r) => r.findingId === task.findingId);
          if (risk) get().updateRisk(risk.id, { mitigationStatus: "mitigated" });
        }
        return { ok: true };
      },
      recordRetest: (id, result, note) => {
        const now = nowISO();
        set((s) => ({
          remediation: s.remediation.map((r) =>
            r.id === id
              ? { ...r, retestResult: result, status: result === "failed" ? "in_progress" : r.status, updatedAt: now, history: [...r.history, { at: now, by: currentUser(), from: r.status, to: result === "failed" ? "in_progress" : r.status, note: `Manual retest ${result}. ${note}` }] }
              : r,
          ),
        }));
        const r = get().remediation.find((x) => x.id === id);
        if (r) get().log("remediation_updated", "remediation", id, r.code, `Recorded manual retest result: ${result}`);
      },

      /* ------------------------------- Reports ------------------------------ */
      createReport: (input) => {
        const now = nowISO();
        const report: Report = { ...input, id: createId("rpt"), code: nextCode("RPT", get().reports.map((r) => r.code)), createdAt: now, updatedAt: now, createdBy: currentUser(), generatedFrom: "demonstration_data" };
        set((s) => ({ reports: [report, ...s.reports] }));
        get().log("report_generated", "report", report.id, report.code, `Generated demo report "${report.title}"`);
        if (get().settings.notifications.reportReady) get().pushNotification({ title: "Demo report generated", message: `${report.code} ${report.title}`, tone: "success", link: `/reports/${report.id}` });
        return report;
      },
      updateReport: (id, patch) => set((s) => ({ reports: s.reports.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: nowISO() } : r)) })),
      logReportExport: (id, format) => {
        const r = get().reports.find((x) => x.id === id);
        if (r) get().log("report_exported", "report", id, r.code, `Exported demo report as ${format}`);
      },

      /* ---------------------------- Users/Settings --------------------------- */
      updateUser: (id, patch) => {
        set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) }));
        const u = get().users.find((x) => x.id === id);
        if (u) get().log("user_updated", "user", id, u.name, `Updated user ${u.name}${patch.role ? ` (role → ${patch.role})` : ""}${patch.status ? ` (status → ${patch.status})` : ""}`);
      },
      updateSettings: (section, patch) => {
        set((s) => ({ settings: { ...s.settings, [section]: { ...s.settings[section], ...patch } } }));
        get().log("settings_changed", "settings", undefined, String(section), `Changed ${String(section)} settings: ${Object.keys(patch).join(", ")}`);
      },

      resetDemo: () => {
        set({ ...createSeedState() });
        get().log("demo_reset", "system", undefined, "Demo data", "Reset all demo data to the initial synthetic dataset");
      },
    }),
    {
      // API mode: the database is the source of truth, so nothing is cached in localStorage.
      name: DATA_MODE === "api" ? "aegis-api-cache" : "aegis-demo-state",
      version: seed.SEED_VERSION,
      skipHydration: DATA_MODE === "api",
      storage: createJSONStorage(() => localStorage),
      // Versioned initialisation: incompatible persisted data is replaced with a fresh seed.
      migrate: () => createSeedState() as unknown as DataStore,
      partialize: (state) => {
        if (DATA_MODE === "api") return {} as unknown as DataStore;
        const { ...data } = state;
        return Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v !== "function")) as unknown as DataStore;
      },
    },
  ),
);

/* ------------------------------- Selectors ------------------------------- */
export const selectUserById = (id: ID | undefined) => (s: DataState) => s.users.find((u) => u.id === id);
