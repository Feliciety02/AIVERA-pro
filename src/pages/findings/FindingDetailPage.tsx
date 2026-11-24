import * as React from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { ArrowRight, ChevronLeft, ChevronRight, CircleHelp, Loader2, ShieldAlert, ShieldCheck, Sparkles, Undo2, Wrench } from "lucide-react";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/misc";
import { KeyValue, UserChip } from "@/components/shared/display";
import { Collapsible, ContentCard, DetailLayout, FactList, SidePanel } from "@/components/shared/DetailLayout";
import { NotFoundState, EmptyState } from "@/components/shared/states";
import { SeverityBadge, StatusBadge, ToneBadge } from "@/components/security/badges";
import { EvidenceViewer } from "@/components/security/EvidenceViewer";
import { AddEvidenceForm } from "@/components/security/AddEvidenceForm";
import { VerificationDialog } from "@/components/security/VerificationDialog";
import { SignoffPanel } from "@/components/security/SignoffPanel";
import { RemediationForm } from "@/components/forms/RemediationForm";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useLookups } from "@/hooks";
import { CATEGORY_BY_ID, DATA_ORIGIN, MITIGATION_STATUS, REMEDIATION_STATUS, SEVERITY_META, SOURCE_LABEL, VERIFICATION_STATUS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { riskLevel, riskScore, RISK_LEVEL_META } from "@/lib/risk";
import { can, deniedReason } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { analysisService, findingService } from "@/services";
import type { VerificationStatus } from "@/types";
import { awaitsReview } from "@/features/scanLifecycle";

/** Findings the AI was already asked about in this browser session, so it runs once per finding. */
const aiRequested = new Set<string>();

/** Uses the same words as the buttons. */
const SAVED_TEXT: Record<VerificationStatus, string> = { confirmed: "Saved: real problem.", rejected: "Saved: false alarm.", needs_review: "Saved: not sure.", pending: "Decision undone." };

/** First sentence only: the page shows a verdict, not an essay. */
const firstSentence = (t: string) => (t.match(/^.*?[.!?](\s|$)/)?.[0] ?? t).trim();

/**
 * Review layout: what you read on the left (summary, evidence), what you decide on the right.
 * The decision panel holds one recommendation and one primary button; it stays in view while
 * the evidence scrolls.
 */
export default function FindingDetailPage() {
  const { findingId } = useParams();
  const user = useCurrentUser();
  const canVerify = can(user?.role, "verify_findings");
  const canAI = can(user?.role, "use_ai");
  const canRemediate = can(user?.role, "manage_remediation");
  const lookups = useLookups();
  const finding = useDataStore((s) => s.findings.find((f) => f.id === findingId));
  useDocumentTitle(finding?.code ?? "Finding");
  const all = useDataStore(useShallow((s) => ({ evidence: s.evidence, verifications: s.verifications, analyses: s.aiAnalyses, remediation: s.remediation, risks: s.risks, findings: s.findings })));
  const [decision, setDecision] = React.useState<VerificationStatus | null>(null);
  const [remOpen, setRemOpen] = React.useState(false);
  const [aiState, setAiState] = React.useState<"idle" | "running" | "failed">("idle");
  const [justSaved, setJustSaved] = React.useState<VerificationStatus | null>(null);
  const [aliasCheckedId, setAliasCheckedId] = React.useState<string | null>(null);
  const navigate = useNavigate();

  const evidence = React.useMemo(() => all.evidence.filter((e) => e.findingId === finding?.id), [all.evidence, finding?.id]);
  const analysis = React.useMemo(
    () => all.analyses.filter((a) => a.findingId === finding?.id).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0],
    [all.analyses, finding?.id],
  );

  React.useEffect(() => {
    if (finding || !findingId) return;
    void findingService.resolveAlias(findingId).then((canonicalId) => {
      if (canonicalId) navigate(`/findings/${canonicalId}`, { replace: true });
      else setAliasCheckedId(findingId);
    });
  }, [finding, findingId, navigate]);

  // Links to one evidence item (/findings/:id#ev-…) scroll straight to it.
  const hasFinding = !!finding;
  React.useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!hasFinding || !id) return;
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    return () => clearTimeout(t);
  }, [findingId, hasFinding]);

  // A new finding starts without the "decision saved" banner.
  React.useEffect(() => {
    setJustSaved(null);
    setAiState("idle");
  }, [findingId]);

  // The AI check runs by itself the first time a finding is opened. Nothing to click.
  React.useEffect(() => {
    const project = finding ? lookups.projects[finding.projectId] : undefined;
    if (!finding || !project || !canAI || analysis || aiRequested.has(finding.id)) return;
    aiRequested.add(finding.id);
    setAiState("running");
    analysisService
      .analyze({ mode: "risk_prioritization", project, finding, evidence })
      .then(() => setAiState("idle"))
      .catch(() => setAiState("failed"));
  }, [finding?.id, canAI, analysis]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!finding)
    return (
      <ContentContainer>
        {aliasCheckedId === findingId
          ? <NotFoundState entity="Finding" backTo="/findings" backLabel="Back to findings" />
          : <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Opening finding…</div>}
      </ContentContainer>
    );

  const history = all.verifications.filter((v) => v.findingId === finding.id).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
  const tasks = all.remediation.filter((r) => r.findingId === finding.id);
  const openTask = tasks.find((t) => t.status !== "resolved" && t.status !== "accepted_risk");
  // Once a lead signs a finding off, its decision is locked until the lead returns it.
  const locked = finding.signoffStatus === "approved";
  const risk = all.risks.find((r) => r.findingId === finding.id);
  const target = lookups.targets[finding.targetId];
  const project = lookups.projects[finding.projectId];
  const cat = CATEGORY_BY_ID[finding.category];
  const current = finding.verificationStatus;
  const decided = current === "confirmed" || current === "rejected";

  // Review order: by finding code. "To review" = no final decision yet.
  const ordered = all.findings.filter((f) => f.targetId === finding.targetId).sort((a, b) => a.code.localeCompare(b.code));
  const index = ordered.findIndex((f) => f.id === finding.id);
  const prev = index > 0 ? ordered[index - 1] : undefined;
  const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : undefined;
  const toReview = ordered.filter(awaitsReview);
  const nextToReview = [...ordered.slice(index + 1), ...ordered.slice(0, Math.max(index, 0))].find((f) => f.id !== finding.id && awaitsReview(f));
  const goTo = (id: string) => navigate(`/findings/${id}`);

  const aiSeverity = analysis?.suggestedSeverity;
  const aiLine = analysis ? firstSentence(analysis.interpretation || analysis.explanation) : "";
  // Fixed order, colour = meaning: red means "this is a problem", green means "this is safe".
  const choices = [
    { status: "confirmed" as const, label: "Real problem", change: "Change to real problem", icon: ShieldAlert, solid: "destructive" as const, outline: "destructive-outline" as const },
    { status: "rejected" as const, label: "False alarm", change: "Change to false alarm", icon: ShieldCheck, solid: "success" as const, outline: "success-outline" as const },
  ];
  const blockedReason = locked ? "Signed off by the lead. Ask the lead to return it to change the decision." : deniedReason(user?.role);
  const canDecide = canVerify && !locked;
  const reviewed = evidence.filter((e) => e.reviewed).length;

  const decisionPanel = (
    <SidePanel
      tone="primary"
      title={decided ? "Decision" : "Is this a real problem?"}
      footer={
        <div className="flex items-center justify-between gap-2" data-tour="finding-nav">
          <span className="text-muted-foreground">{toReview.length ? `${toReview.length} left to review` : "All reviewed"}</span>
          <span className="flex items-center gap-0.5" aria-label="Finding navigation">
            <Button size="icon-sm" variant="ghost" disabled={!prev} onClick={() => prev && goTo(prev.id)} aria-label={prev ? `Previous finding ${prev.code}` : "No previous finding"}>
              <ChevronLeft />
            </Button>
            <span className="px-1 tabular-nums text-muted-foreground">{index + 1} / {ordered.length}</span>
            <Button size="icon-sm" variant="ghost" disabled={!next} onClick={() => next && goTo(next.id)} aria-label={next ? `Next finding ${next.code}` : "No next finding"}>
              <ChevronRight />
            </Button>
          </span>
        </div>
      }
    >
      {justSaved && (
        <div role="status" className="rounded-xl bg-success/10 px-3.5 py-2.5 text-sm">
          <p className="font-medium">{SAVED_TEXT[justSaved]}</p>
          {nextToReview ? (
            <Button size="sm" className="mt-2 w-full" onClick={() => goTo(nextToReview.id)}>
              Next to review <ArrowRight />
            </Button>
          ) : (
            <Button size="sm" className="mt-2 w-full" asChild>
              <Link to="/findings?status=confirmed">All decided. Plan fixes <ArrowRight /></Link>
            </Button>
          )}
        </div>
      )}

      {decided ? (
        <div className="flex items-start gap-3">
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", current === "confirmed" ? "bg-destructive/12 text-destructive" : "bg-success/12 text-success")}>
            {current === "confirmed" ? <ShieldAlert className="size-5" /> : <ShieldCheck className="size-5" />}
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-semibold">{current === "confirmed" ? "Confirmed as a real problem" : "Rejected as a false alarm"}</p>
            {history[0] && <p className="text-xs text-muted-foreground">by {lookups.users[history[0].assessorId]?.name ?? "unknown"}, {formatDateTime(history[0].decidedAt)}</p>}
            {history[0]?.decisionReason && <p className="mt-1.5 text-xs">{history[0].decisionReason}</p>}
          </div>
        </div>
      ) : (
        canAI &&
        (aiState !== "idle" || analysis) && (
          <div className="rounded-xl bg-muted/50 px-3.5 py-3 text-sm" aria-live="polite">
            <p className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/12 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                <Sparkles className="size-3" aria-hidden /> AI result
              </span>
              <span className="text-[11px] text-muted-foreground">AI-generated, may be wrong. You decide.</span>
            </p>
            {aiState === "running" ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" aria-hidden /> AI is checking this finding…
              </p>
            ) : aiState === "failed" && !analysis ? (
              <p className="mt-1.5 text-xs text-muted-foreground">The AI could not check this one. Decide from the evidence.</p>
            ) : (
              <>
                {aiSeverity && (
                  <p className="mt-1.5 font-semibold">
                    Rates it {SEVERITY_META[aiSeverity].label}
                    {aiSeverity !== finding.severity && <span className="text-xs font-normal text-warning"> (tool said {SEVERITY_META[finding.severity].label})</span>}
                  </p>
                )}
                {aiLine && <p className="mt-0.5 text-xs text-muted-foreground">{aiLine}</p>}
              </>
            )}
          </div>
        )
      )}

      <div className="space-y-2" role="group" aria-label="Record your decision">
        <div className={cn("grid gap-2", !decided && "grid-cols-2")}>
        {choices
          .filter((c) => c.status !== current)
          .map((c) => {
            const button = (
              <Button
                className={cn("w-full", !decided && "h-11")}
                size={decided ? "sm" : "default"}
                variant={decided ? c.outline : c.solid}
                disabled={!canDecide}
                onClick={() => setDecision(c.status)}
              >
                <c.icon /> {decided ? c.change : c.label}
              </Button>
            );
            return canDecide ? (
              <React.Fragment key={c.status}>{button}</React.Fragment>
            ) : (
              <Hint key={c.status} label={blockedReason}>
                <span tabIndex={0} className="block">{button}</span>
              </Hint>
            );
          })}
        </div>
        {canDecide && (
          <div className="flex gap-2">
            {current !== "needs_review" ? (
              <Button variant="warning-outline" size="sm" className="flex-1" onClick={() => setDecision("needs_review")}>
                <CircleHelp /> Not sure
              </Button>
            ) : (
              <span className="flex h-8 flex-1 items-center justify-center gap-1.5 text-xs text-warning">
                <CircleHelp className="size-3.5" aria-hidden /> Flagged as not sure
              </span>
            )}
            {current !== "pending" && (
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => setDecision("pending")}>
                <Undo2 /> Undo
              </Button>
            )}
          </div>
        )}
      </div>
    </SidePanel>
  );

  return (
    <ContentContainer wide>
      <PageHeader
        eyebrow={
          <>
            <Link to="/findings" className="hover:text-foreground">Findings</Link>
            <span>/</span>
            <span className="font-mono">{finding.code}</span>
          </>
        }
        title={finding.title}
        meta={
          <>
            <SeverityBadge severity={finding.severity} />
            <StatusBadge status={current} map={VERIFICATION_STATUS} />
            <span className="text-xs text-muted-foreground">
              on <Link to={`/targets/${finding.targetId}`} className="font-medium text-foreground hover:text-primary">{target?.name}</Link>
            </span>
          </>
        }
      />

      <DetailLayout
        aside={
          <>
            <section aria-label="Is this a real problem?">{decisionPanel}</section>
            {current === "confirmed" && canRemediate && (
              <SidePanel title="Fix">
                <p className="text-sm text-muted-foreground">
                  {openTask ? `Task ${openTask.code} is ${REMEDIATION_STATUS[openTask.status].label.toLowerCase()}.` : "Confirmed problems need a fix task so someone owns the repair."}
                </p>
                {openTask ? (
                  <Button size="sm" variant="outline" className="w-full" asChild>
                    <Link to={`/remediation?task=${openTask.id}`}><Wrench /> Open fix task</Link>
                  </Button>
                ) : (
                  <Button size="sm" className="w-full" onClick={() => setRemOpen(true)}>
                    <Wrench /> Create fix task
                  </Button>
                )}
              </SidePanel>
            )}
            <SignoffPanel finding={finding} history={history} />
            <SidePanel title="Details">
              <FactList
                items={[
                  { label: "Location", value: <span className="font-mono text-xs">{finding.affectedAsset}</span> },
                  finding.parameter ? { label: "Parameter", value: <span className="font-mono text-xs">{finding.parameter}</span> } : null,
                  { label: "Category", value: cat.name },
                  {
                    label: "Found by",
                    value: (
                      <>
                        {SOURCE_LABEL[finding.sourceTool]}
                        {finding.dataOrigin !== "real" && <span className="text-muted-foreground"> · {DATA_ORIGIN[finding.dataOrigin].label}</span>}
                      </>
                    ),
                  },
                  { label: "Found on", value: formatDate(finding.discoveredAt) },
                  { label: "Assessor", value: <UserChip user={lookups.users[finding.assignedAssessorId]} /> },
                  project ? { label: "Project", value: <Link to={`/projects/${project.id}`} className="hover:text-primary">{project.code}</Link> } : null,
                  finding.scanId ? { label: "Scan", value: <Link to={`/scans/${finding.scanId}`} className="font-mono text-xs hover:text-primary">{finding.scanId}</Link> } : null,
                  risk
                    ? { label: "Risk score", value: <span style={{ color: RISK_LEVEL_META[riskLevel(risk)].color }} className="font-semibold">{riskScore(risk.likelihood, risk.impact)} · {RISK_LEVEL_META[riskLevel(risk)].label}</span> }
                    : null,
                  finding.cwe || finding.owasp ? { label: "References", value: [finding.cwe, finding.owasp].filter(Boolean).join(" · ") } : null,
                ]}
              />
            </SidePanel>
          </>
        }
        main={
          <>
            <ContentCard title="Summary">
              <p className="text-sm leading-relaxed">{finding.description}</p>
              {finding.remediation && (
                <p className="mt-3 rounded-xl bg-muted/50 px-3.5 py-2.5 text-sm leading-relaxed">
                  <span className="font-medium">How to fix: </span>
                  {firstSentence(finding.remediation)}
                </p>
              )}
            </ContentCard>

            <ContentCard title="Evidence" count={evidence.length} action={evidence.length > 0 && <span className="text-xs text-muted-foreground">{reviewed} of {evidence.length} reviewed</span>}>
              <EvidenceViewer evidence={evidence} canReview={canVerify} />
              {canVerify && <div className="mt-4"><AddEvidenceForm findingId={finding.id} /></div>}
            </ContentCard>

            <Collapsible title="More details" hint="Impact, full fix, tasks and history">
              <div className="space-y-5">
                <div className="grid gap-4 text-sm leading-relaxed md:grid-cols-2">
                  <KeyValue label="Possible impact">{finding.impact}</KeyValue>
                  <KeyValue label="How to fix">{finding.remediation}</KeyValue>
                </div>
                {risk && (
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    Risk register: <StatusBadge status={risk.mitigationStatus} map={MITIGATION_STATUS} /> next review {formatDate(risk.reviewDate)}
                  </p>
                )}
                {tasks.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Fix tasks</p>
                    <ul className="divide-y divide-border rounded-xl border border-border">
                      {tasks.map((t) => (
                        <li key={t.id}>
                          <Link to={`/remediation?task=${t.id}`} className="flex items-center gap-3 px-3 py-2 hover:text-primary">
                            <span className="font-mono text-xs">{t.code}</span>
                            <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                            <StatusBadge status={t.status} map={REMEDIATION_STATUS} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Decision history</p>
                  {history.length === 0 ? (
                    <EmptyState compact title="No decisions yet" />
                  ) : (
                    <ol className="space-y-2">
                      {history.map((v) => (
                        <li key={v.id} className="rounded-xl border border-border p-3 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={v.fromStatus} map={VERIFICATION_STATUS} />
                            <span className="text-muted-foreground">→</span>
                            <StatusBadge status={v.toStatus} map={VERIFICATION_STATUS} />
                            <span className="text-muted-foreground">by {lookups.users[v.assessorId]?.name ?? "unknown"}</span>
                            <span className="ml-auto text-muted-foreground">{formatDateTime(v.decidedAt)}</span>
                          </div>
                          {v.decisionReason && <p className="mt-1.5">{v.decisionReason}</p>}
                          {v.notes && <p className="mt-1 text-muted-foreground">{v.notes}</p>}
                          {!v.evidenceReviewed && <ToneBadge tone="muted" className="mt-1.5">Evidence review not recorded</ToneBadge>}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
                {canAI && aiState === "failed" && <p className="text-xs text-muted-foreground">The AI check could not run this time. The decision does not depend on it.</p>}
                {canAI && <p className="text-[11px] text-muted-foreground">AI advice is generated with secrets removed. It never makes the decision.</p>}
              </div>
            </Collapsible>
          </>
        }
      />

      <VerificationDialog finding={finding} status={decision} open={!!decision} onOpenChange={(o) => !o && setDecision(null)} onSaved={setJustSaved} />
      <RemediationForm finding={finding} open={remOpen} onOpenChange={setRemOpen} />
    </ContentContainer>
  );
}
