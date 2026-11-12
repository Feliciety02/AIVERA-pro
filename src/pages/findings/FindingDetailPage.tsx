import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { ArrowRight, Bot, ChevronLeft, ChevronRight, Loader2, Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger, Hint } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard, KeyValue, UserChip } from "@/components/shared/display";
import { NotFoundState, EmptyState } from "@/components/shared/states";
import { SeverityBadge, StatusBadge, ToolBadge, OriginBadge, ToneBadge } from "@/components/security/badges";
import { EvidenceViewer } from "@/components/security/EvidenceViewer";
import { AddEvidenceForm } from "@/components/security/AddEvidenceForm";
import { AIAnalysisPanel } from "@/components/security/AIAnalysisPanel";
import { AINotice } from "@/components/security/AINotice";
import { VerificationDialog } from "@/components/security/VerificationDialog";
import { RemediationForm } from "@/components/forms/RemediationForm";
import { RecentActivity } from "@/components/dashboard/widgets";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useLookups } from "@/hooks";
import { AI_MODES, CATEGORY_BY_ID, MITIGATION_STATUS, REMEDIATION_STATUS, VERIFICATION_STATUS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { riskLevel, riskScore, RISK_LEVEL_META } from "@/lib/risk";
import { can, deniedReason } from "@/lib/permissions";
import { analysisService, findingService } from "@/services";
import type { AIMode, VerificationStatus } from "@/types";
import { awaitsReview } from "@/features/scanLifecycle";

const FINDING_MODES = AI_MODES.filter((m) => m.needs === "finding");

export default function FindingDetailPage() {
  const { findingId } = useParams();
  const [params, setParams] = useSearchParams();
  const user = useCurrentUser();
  const canVerify = can(user?.role, "verify_findings");
  const canAI = can(user?.role, "use_ai");
  const canRemediate = can(user?.role, "manage_remediation");
  const lookups = useLookups();
  const finding = useDataStore((s) => s.findings.find((f) => f.id === findingId));
  useDocumentTitle(finding?.code ?? "Finding");
  const all = useDataStore(useShallow((s) => ({ evidence: s.evidence, verifications: s.verifications, analyses: s.aiAnalyses, activity: s.activity, remediation: s.remediation, risks: s.risks, projects: s.projects })));
  const [decision, setDecision] = React.useState<VerificationStatus | null>(null);
  const [remOpen, setRemOpen] = React.useState(false);
  const [mode, setMode] = React.useState<AIMode>("vulnerability_explanation");
  const [generating, setGenerating] = React.useState(false);
  const [justSaved, setJustSaved] = React.useState<VerificationStatus | null>(null);
  const [aliasCheckedId, setAliasCheckedId] = React.useState<string | null>(null);
  const navigate = useNavigate();
  const allFindings = useDataStore((s) => s.findings);
  const tab = params.get("tab") ?? "overview";

  React.useEffect(() => {
    if (finding || !findingId) return;
    void findingService.resolveAlias(findingId).then((canonicalId) => {
      if (canonicalId) navigate(`/findings/${canonicalId}`, { replace: true });
      else setAliasCheckedId(findingId);
    });
  }, [finding, findingId, navigate]);

  // A new finding starts without the "decision saved" banner.
  React.useEffect(() => setJustSaved(null), [findingId]);

  React.useEffect(() => {
    if (window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
  }, [tab]);

  if (!finding)
    return (
      <ContentContainer>
        {aliasCheckedId === findingId
          ? <NotFoundState entity="Finding" backTo="/findings" backLabel="Back to findings" />
          : <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Opening finding…</div>}
      </ContentContainer>
    );

  const evidence = all.evidence.filter((e) => e.findingId === finding.id);
  const history = all.verifications.filter((v) => v.findingId === finding.id).sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
  const analyses = all.analyses.filter((a) => a.findingId === finding.id);
  const activity = all.activity.filter((a) => a.entityId === finding.id);
  const tasks = all.remediation.filter((r) => r.findingId === finding.id);
  const risk = all.risks.find((r) => r.findingId === finding.id);
  const target = lookups.targets[finding.targetId];
  const project = lookups.projects[finding.projectId];
  const cat = CATEGORY_BY_ID[finding.category];

  // Review order: by finding code. "To review" = no final decision yet.
  const ordered = allFindings.filter((f) => f.targetId === finding.targetId).sort((a, b) => a.code.localeCompare(b.code));
  const index = ordered.findIndex((f) => f.id === finding.id);
  const prev = index > 0 ? ordered[index - 1] : undefined;
  const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : undefined;
  const toReview = ordered.filter(awaitsReview);
  // Next undecided finding after this one, wrapping around to the start.
  const nextToReview = [...ordered.slice(index + 1), ...ordered.slice(0, Math.max(index, 0))].find((f) => f.id !== finding.id && awaitsReview(f));
  const goTo = (id: string) => navigate(`/findings/${id}`);

  const generate = async () => {
    if (!project) return;
    setGenerating(true);
    try {
      await analysisService.analyze({ mode, project, finding, evidence });
      toast.success("Sample AI analysis ready", { description: "Demo adapter, predefined sample, not a language model." });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const decisionButtons: { status: VerificationStatus; label: string }[] = [
    { status: "confirmed", label: "Confirm" },
    { status: "rejected", label: "Reject" },
    { status: "needs_review", label: "Review later" },
  ];
  const current = finding.verificationStatus;

  return (
    <ContentContainer>
      <PageHeader
        eyebrow={
          <>
            <span className="font-mono">{finding.code}</span>
            <span>·</span>
            <Link to={`/projects/${finding.projectId}`} className="hover:text-foreground">{project?.code}</Link>
            <span>·</span>
            <Link to={`/targets/${finding.targetId}`} className="hover:text-foreground">{target?.name}</Link>
          </>
        }
        title={finding.title}
        meta={
          <>
            <SeverityBadge severity={finding.severity} />
            <StatusBadge status={finding.verificationStatus} map={VERIFICATION_STATUS} />
            <ToolBadge tool={finding.sourceTool} />
            <OriginBadge origin={finding.dataOrigin} />
            {finding.cwe && <ToneBadge tone="muted">{finding.cwe}</ToneBadge>}
          </>
        }
        actions={
          canAI && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/ai-analyst?finding=${finding.id}`}>
                <Bot /> Open in AI Analyst
              </Link>
            </Button>
          )
        }
      />

      <section aria-label="Your decision" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        {justSaved && (
          <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-success/8 px-4 py-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <span className="font-medium">Saved as {VERIFICATION_STATUS[justSaved].label}.</span>{" "}
              <span className="text-muted-foreground">{nextToReview ? `${toReview.length} left to review.` : "Every finding has a decision."}</span>
            </span>
            {nextToReview ? (
              <Button size="sm" className="rounded-full" onClick={() => goTo(nextToReview.id)}>
                Next to review <ArrowRight />
              </Button>
            ) : (
              <Button size="sm" className="rounded-full" asChild>
                <Link to="/findings?status=confirmed">Plan fixes</Link>
              </Button>
            )}
          </div>
        )}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Your decision</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {history[0] ? (
                <>
                  Last set by {lookups.users[history[0].assessorId]?.name ?? "unknown"}, {formatDateTime(history[0].decidedAt)}
                  {canVerify && current !== "pending" && (
                    <>
                      {" · "}
                      <button type="button" className="font-medium text-primary hover:underline" onClick={() => setDecision("pending")}>
                        Undo
                      </button>
                    </>
                  )}
                </>
              ) : (
                "Check the evidence below, then choose."
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Record your decision">
            {decisionButtons.map((b) => {
              const active = current === b.status;
              const button = (
                <Button
                  size="sm"
                  variant={active ? "default" : "outline"}
                  className="min-w-24 rounded-full"
                  disabled={!canVerify || active}
                  aria-pressed={active}
                  onClick={() => setDecision(b.status)}
                >
                  {b.label}
                </Button>
              );
              return canVerify ? (
                <React.Fragment key={b.status}>{button}</React.Fragment>
              ) : (
                <Hint key={b.status} label={deniedReason(user?.role)}>
                  <span tabIndex={0}>{button}</span>
                </Hint>
              );
            })}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3 text-xs" data-tour="finding-nav">
          <Link to={`/findings?target=${finding.targetId}&status=unverified`} className="text-muted-foreground hover:text-foreground">
            {toReview.length ? `${toReview.length} left to review` : "All reviewed"}
          </Link>
          <div className="flex items-center gap-1" aria-label="Finding navigation">
            <Button size="sm" variant="ghost" disabled={!prev} onClick={() => prev && goTo(prev.id)} aria-label={prev ? `Previous finding ${prev.code}` : "No previous finding"}>
              <ChevronLeft /> Previous
            </Button>
            <Button size="sm" variant="ghost" disabled={!next} onClick={() => next && goTo(next.id)} aria-label={next ? `Next finding ${next.code}` : "No next finding"}>
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      </section>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="evidence">Technical Evidence ({evidence.length})</TabsTrigger>
          <TabsTrigger value="ai">AI Analysis ({analyses.length})</TabsTrigger>
          <TabsTrigger value="history">Verification History ({history.length})</TabsTrigger>
          <TabsTrigger value="remediation">Risk & Remediation</TabsTrigger>
          <TabsTrigger value="activity">Related Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <SectionCard title="Technical description">
              <p className="text-sm leading-relaxed">{finding.description}</p>
            </SectionCard>
            <SectionCard title="Potential impact">
              <p className="text-sm leading-relaxed">{finding.impact}</p>
            </SectionCard>
            <SectionCard title="Remediation recommendations" actions={canRemediate && finding.verificationStatus === "confirmed" && <Button size="sm" variant="outline" onClick={() => setRemOpen(true)}><Wrench /> Create task</Button>}>
              <p className="text-sm leading-relaxed">{finding.remediation}</p>
            </SectionCard>
          </div>
          <SectionCard title="Finding overview">
            <dl className="space-y-4">
              <KeyValue label="Affected asset" mono>{finding.affectedAsset}</KeyValue>
              {finding.parameter && <KeyValue label="Parameter" mono>{finding.parameter}</KeyValue>}
              <KeyValue label="Security category">
                <Link className="hover:text-primary" to={`/assessments/${cat.id}?project=${finding.projectId}`}>{cat.name}</Link>
              </KeyValue>
              <KeyValue label="Severity (reported)"><SeverityBadge severity={finding.severity} /></KeyValue>
              <KeyValue label="Source tool"><ToolBadge tool={finding.sourceTool} /></KeyValue>
              {finding.scanId && <KeyValue label="Source scan"><Link to={`/scans/${finding.scanId}`} className="font-mono text-xs hover:text-primary">{finding.scanId}</Link></KeyValue>}
              <KeyValue label="References">{finding.cwe} · {finding.owasp}</KeyValue>
              <KeyValue label="Assigned assessor"><UserChip user={lookups.users[finding.assignedAssessorId]} /></KeyValue>
              <KeyValue label="Discovered">{formatDateTime(finding.discoveredAt)}</KeyValue>
              <KeyValue label="Data origin"><OriginBadge origin={finding.dataOrigin} /></KeyValue>
            </dl>
          </SectionCard>
        </TabsContent>

        <TabsContent value="evidence">
          <SectionCard title="Technical evidence" description="Review each item before making a decision. Toggle “Reviewed” to record your review.">
            <EvidenceViewer evidence={evidence} canReview={canVerify} />
            {canVerify && <div className="mt-4"><AddEvidenceForm findingId={finding.id} /></div>}
          </SectionCard>
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <AINotice />
          {canAI && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={mode} onValueChange={(v) => setMode(v as AIMode)}>
                <SelectTrigger className="h-9 sm:w-72" aria-label="Analysis mode"><SelectValue /></SelectTrigger>
                <SelectContent>{FINDING_MODES.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
              <Button onClick={generate} disabled={generating}>
                {generating ? <Loader2 className="animate-spin" /> : <Sparkles />} Generate sample analysis
              </Button>
            </div>
          )}
          {analyses.length === 0 ? (
            <EmptyState icon={Bot} title="No AI analyses yet" description="Generate a sample analysis to see interpretation, impact and verification guidance." />
          ) : (
            analyses.map((a) => <AIAnalysisPanel key={a.id} analysis={a} finding={finding} canSend={canAI} />)
          )}
        </TabsContent>

        <TabsContent value="history">
          <SectionCard title="Verification history" description="Every human decision on this finding">
            {history.length === 0 ? (
              <EmptyState compact title="No decisions recorded" description="This finding is awaiting its first verification decision." />
            ) : (
              <ol className="space-y-3">
                {history.map((v) => (
                  <li key={v.id} className="rounded-xl border border-border p-3.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <StatusBadge status={v.fromStatus} map={VERIFICATION_STATUS} />
                      <span className="text-muted-foreground">→</span>
                      <StatusBadge status={v.toStatus} map={VERIFICATION_STATUS} />
                      <span className="ml-auto text-muted-foreground">{formatDateTime(v.decidedAt)}</span>
                    </div>
                    <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                      <KeyValue label="Assessor"><UserChip user={lookups.users[v.assessorId]} /></KeyValue>
                      <KeyValue label="Evidence review">{v.evidenceReviewed ? "Evidence reviewed" : "Not recorded"}</KeyValue>
                      <KeyValue label="Decision reason">{v.decisionReason || "N/A"}</KeyValue>
                      <KeyValue label="Verification notes" className="sm:col-span-3"><span className="text-xs text-foreground/85">{v.notes || "N/A"}</span></KeyValue>
                    </dl>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="remediation" className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Risk record" description="Demo risk score = likelihood × impact (not CVSS)" actions={<Button size="sm" variant="ghost" asChild><Link to="/risks">Risk register</Link></Button>}>
            {risk ? (
              <dl className="grid grid-cols-2 gap-4">
                <KeyValue label="Demo risk score">
                  <span className="text-lg font-semibold" style={{ color: RISK_LEVEL_META[riskLevel(risk)].color }}>{riskScore(risk.likelihood, risk.impact)} · {RISK_LEVEL_META[riskLevel(risk)].label}</span>
                </KeyValue>
                <KeyValue label="Likelihood × impact">L{risk.likelihood} × I{risk.impact}</KeyValue>
                <KeyValue label="Owner"><UserChip user={lookups.users[risk.ownerId]} /></KeyValue>
                <KeyValue label="Mitigation"><StatusBadge status={risk.mitigationStatus} map={MITIGATION_STATUS} /></KeyValue>
                <KeyValue label="Review date">{formatDate(risk.reviewDate)}</KeyValue>
              </dl>
            ) : (
              <EmptyState compact title="No risk record" description="A risk record is created automatically when the finding is confirmed by an assessor." />
            )}
          </SectionCard>
          <SectionCard title="Remediation tasks" actions={canRemediate && finding.verificationStatus === "confirmed" && <Button size="sm" onClick={() => setRemOpen(true)}><Wrench /> Create task</Button>}>
            {finding.verificationStatus !== "confirmed" && <p className="mb-3 text-[11px] text-muted-foreground">Remediation tasks can be created once the finding is confirmed.</p>}
            {tasks.length === 0 ? (
              <EmptyState compact title="No remediation tasks" />
            ) : (
              <ul className="divide-y divide-border">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <Link to={`/remediation?task=${t.id}`} className="flex items-center gap-3 py-2.5 hover:text-primary">
                      <span className="font-mono text-xs">{t.code}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                      <StatusBadge status={t.status} map={REMEDIATION_STATUS} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="activity">
          <SectionCard title="Related activity">
            <RecentActivity items={activity} users={lookups.users} limit={50} />
          </SectionCard>
        </TabsContent>
      </Tabs>

      <VerificationDialog finding={finding} status={decision} open={!!decision} onOpenChange={(o) => !o && setDecision(null)} onSaved={setJustSaved} />
      <RemediationForm finding={finding} open={remOpen} onOpenChange={setRemOpen} />
    </ContentContainer>
  );
}
