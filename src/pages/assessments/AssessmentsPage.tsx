import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { useShallow } from "zustand/react/shallow";
import { ArrowRight, Bot, Hand } from "lucide-react";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Callout } from "@/components/shared/display";
import { StatusBadge, ToneBadge, ToolBadge } from "@/components/security/badges";
import { CardsSkeleton } from "@/components/shared/states";
import { useDataStore } from "@/stores/dataStore";
import { useDocumentTitle, useInitialLoading, useLookups } from "@/hooks";
import { ASSESSMENT_STATUS, CATEGORIES } from "@/lib/constants";
import { percent } from "@/lib/utils";

export default function AssessmentsPage() {
  useDocumentTitle("Vulnerability Assessment");
  const loading = useInitialLoading();
  const lookups = useLookups();
  const [params, setParams] = useSearchParams();
  const { projects, assessments, findings, evidence } = useDataStore(useShallow((s) => ({ projects: s.projects, assessments: s.assessments, findings: s.findings, evidence: s.evidence })));
  const active = projects.filter((p) => p.status !== "archived");
  const projectId = params.get("project") ?? active[0]?.id ?? "";
  const project = lookups.projects[projectId];

  const cards = React.useMemo(
    () =>
      CATEGORIES.map((c) => {
        const a = assessments.find((x) => x.projectId === projectId && x.category === c.id);
        const fs = findings.filter((f) => f.projectId === projectId && f.category === c.id);
        const ev = evidence.filter((e) => fs.some((f) => f.id === e.findingId));
        const done = a ? a.checklist.filter((i) => i.result !== "not_tested").length : 0;
        return { c, a, fs, ev, done, total: a?.checklist.length ?? c.checklist.length };
      }),
    [assessments, findings, evidence, projectId],
  );

  return (
    <ContentContainer wide>
      <PageHeader
        title="Vulnerability Assessment"
        description="Guided, category-based assessment with checklists that separate automated checks from manual testing."
        actions={
          <Select value={projectId} onValueChange={(v) => setParams({ project: v }, { replace: true })}>
            <SelectTrigger className="h-9 w-72" aria-label="Project">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {active.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <Callout title="Automated vs. manual">
        <span className="inline-flex items-center gap-1"><Bot className="size-3.5" /> Automated checks</span> map to a tool (results are imported or simulated in this phase).{" "}
        <span className="inline-flex items-center gap-1"><Hand className="size-3.5" /> Manual tests</span> are performed and documented by the assessor. Six categories are emphasised for the initial demonstration; two are marked <ToneBadge tone="muted">Extended</ToneBadge>.
      </Callout>
      {loading ? (
        <CardsSkeleton count={8} className="xl:grid-cols-4" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {cards.map(({ c, a, fs, ev, done, total }) => {
            const confirmed = fs.filter((f) => f.verificationStatus === "confirmed").length;
            const reviewed = ev.filter((e) => e.reviewed).length;
            const automated = c.checklist.filter((i) => i.kind === "automated").length;
            return (
              <Link key={c.id} to={`/assessments/${c.id}?project=${projectId}`} className="group rounded-lg focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none">
                <Card className="flex h-full flex-col p-4 transition-colors group-hover:border-primary/35">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold leading-snug group-hover:text-primary">{c.name}</h3>
                    {a ? <StatusBadge status={a.status} map={ASSESSMENT_STATUS} /> : <ToneBadge tone="muted">Not started</ToneBadge>}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{c.description}</p>
                  <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground/80"><span className="font-medium text-foreground/70">Scope:</span> {c.scope}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {c.tools.length ? c.tools.map((t) => <ToolBadge key={t} tool={t} />) : <ToolBadge tool="manual" />}
                    {!c.primary && <ToneBadge tone="muted">Extended</ToneBadge>}
                  </div>
                  <div className="mt-auto space-y-3 pt-4">
                    <div>
                      <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                        <span>{total} tests · {automated} automated / {total - automated} manual</span>
                        <span className="tabular-nums">{done}/{total}</span>
                      </div>
                      <Progress value={percent(done, total)} />
                    </div>
                    <dl className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-md bg-muted/40 py-1.5"><dt className="text-[10px] text-muted-foreground">Findings</dt><dd className="text-sm font-semibold tabular-nums">{fs.length}</dd></div>
                      <div className="rounded-md bg-muted/40 py-1.5"><dt className="text-[10px] text-muted-foreground">Confirmed</dt><dd className="text-sm font-semibold tabular-nums text-sev-high">{confirmed}</dd></div>
                      <div className="rounded-md bg-muted/40 py-1.5"><dt className="text-[10px] text-muted-foreground">Evidence</dt><dd className="text-sm font-semibold tabular-nums">{reviewed}/{ev.length}</dd></div>
                    </dl>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Assessor: <span className="text-foreground">{a ? lookups.users[a.assessorId]?.name : project ? lookups.users[project.ownerId]?.name : "N/A"}</span></span>
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </ContentContainer>
  );
}
