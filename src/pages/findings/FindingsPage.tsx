import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { useShallow } from "zustand/react/shallow";
import { Download, Eye, FileCheck2, FileX2, ShieldAlert, UserPlus } from "lucide-react";
import { ManualFindingDialog } from "@/components/forms/ManualFindingDialog";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { ViewSwitch, useView } from "@/components/shared/ViewSwitch";
import { RisksView } from "@/pages/risks/RisksPage";

const VIEWS = [{ value: "list", label: "All findings" }, { value: "risks", label: "Risk priority" }] as const;
import { AddButton } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Hint } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataTable } from "@/components/shared/DataTable";
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import { EmptyState } from "@/components/shared/states";
import { MiniStat, UserChip } from "@/components/shared/display";
import { SeverityBadge, StatusBadge } from "@/components/security/badges";
import { FindingPreview } from "@/components/security/FindingPreview";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useInitialLoading, useLookups } from "@/hooks";
import { CATEGORY_BY_ID, DATA_ORIGIN, SEVERITIES, SEVERITY_META, SOURCE_LABEL, VERIFICATION_STATUS } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { downloadCSV } from "@/lib/csv";
import { can } from "@/lib/permissions";
import { findingService } from "@/services";
import type { VerificationStatus, VulnerabilityFinding } from "@/types";

const STATUS_TONE: Partial<Record<VerificationStatus, string>> = { pending: "text-sev-medium", needs_review: "text-cyan", confirmed: "text-sev-high" };

const PARAM_KEYS = ["status", "severity", "category", "tool", "origin", "assessor", "project", "target", "scan"] as const;

export default function FindingsPage() {
  useDocumentTitle("Findings");
  const loading = useInitialLoading();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const canVerify = can(user?.role, "verify_findings");
  const lookups = useLookups();
  const { findings, evidence, remediation } = useDataStore(useShallow((s) => ({ findings: s.findings, evidence: s.evidence, remediation: s.remediation })));
  const [params, setParams] = useSearchParams();
  const [q, setQ] = React.useState("");
  const [preview, setPreview] = React.useState<VulnerabilityFinding | null>(null);
  const [manualOpen, setManualOpen] = React.useState(false);
  const get = (k: (typeof PARAM_KEYS)[number]) => params.get(k) ?? ALL;
  const set = (k: (typeof PARAM_KEYS)[number]) => (v: string) => {
    const n = new URLSearchParams(params);
    if (v === ALL) n.delete(k);
    else n.set(k, v);
    setParams(n, { replace: true });
  };

  const evidenceCount = React.useMemo(() => {
    const m: Record<string, { total: number; reviewed: number }> = {};
    evidence.forEach((e) => {
      m[e.findingId] ??= { total: 0, reviewed: 0 };
      m[e.findingId]!.total++;
      if (e.reviewed) m[e.findingId]!.reviewed++;
    });
    return m;
  }, [evidence]);

  const rows = React.useMemo(() => {
    const term = q.toLowerCase();
    const st = get("status");
    return findings.filter(
      (f) =>
        (st === ALL || (st === "unverified" ? f.verificationStatus === "pending" || f.verificationStatus === "needs_review" : f.verificationStatus === st)) &&
        (get("severity") === ALL || f.severity === get("severity")) &&
        (get("category") === ALL || f.category === get("category")) &&
        (get("tool") === ALL || f.sourceTool === get("tool")) &&
        (get("origin") === ALL || f.dataOrigin === get("origin")) &&
        (get("assessor") === ALL || f.assignedAssessorId === get("assessor")) &&
        (get("project") === ALL || f.projectId === get("project")) &&
        (get("target") === ALL || f.targetId === get("target")) &&
        (get("scan") === ALL || f.scanId === get("scan")) &&
        (!term || [f.title, f.code, f.affectedAsset, f.cwe ?? ""].some((x) => x.toLowerCase().includes(term))),
    );
  }, [findings, params, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const assessors = Object.values(lookups.users).filter((u) => can(u.role, "verify_findings") && u.status === "active");

  const columns = React.useMemo<ColumnDef<VulnerabilityFinding, unknown>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Finding",
        cell: ({ row }) => (
          <div className="min-w-60 max-w-md">
            <p className="truncate font-medium">{row.original.title}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              <span className="font-mono">{row.original.code}</span> · {lookups.targets[row.original.targetId]?.name ?? "Unknown website"}
              {row.original.dataOrigin === "simulated" && " · practice"}
            </p>
            {row.original.possiblyFixedAt && <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">Possibly fixed: not seen in latest scan</p>}
            {/* On a phone the other columns are off screen, so the two that matter sit here too. */}
            <div className="mt-1 flex flex-wrap gap-1.5 sm:hidden">
              <SeverityBadge severity={row.original.severity} />
              <StatusBadge status={row.original.verificationStatus} map={VERIFICATION_STATUS} />
            </div>
          </div>
        ),
      },
      { id: "severity", header: "Severity", accessorFn: (f) => SEVERITY_META[f.severity].rank, cell: ({ row }) => <SeverityBadge severity={row.original.severity} /> },
      { accessorKey: "verificationStatus", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.verificationStatus} map={VERIFICATION_STATUS} /> },
      { id: "assessor", header: "Tester", accessorFn: (f) => lookups.users[f.assignedAssessorId]?.name ?? "", cell: ({ row }) => <UserChip user={lookups.users[row.original.assignedAssessorId]} /> },
      { accessorKey: "discoveredAt", header: "Found", cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDate(getValue() as string)}</span> },
      {
        id: "quick",
        header: () => <span className="sr-only">Quick view</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <Hint label="Quick view">
            <Button variant="ghost" size="icon-sm" aria-label={`Quick view ${row.original.code}`} onClick={(e) => { e.stopPropagation(); setPreview(row.original); }}>
              <Eye />
            </Button>
          </Hint>
        ),
      },
    ],
    [lookups, evidenceCount],
  );

  const exportRows = (list: VulnerabilityFinding[], name: string) => {
    downloadCSV(name, list, [
      { header: "Finding ID", value: (f) => f.code },
      { header: "Title", value: (f) => f.title },
      { header: "Target", value: (f) => lookups.targets[f.targetId]?.name },
      { header: "Affected asset", value: (f) => f.affectedAsset },
      { header: "Category", value: (f) => CATEGORY_BY_ID[f.category].name },
      { header: "Severity", value: (f) => SEVERITY_META[f.severity].label },
      { header: "Source tool", value: (f) => SOURCE_LABEL[f.sourceTool] },
      { header: "Evidence items", value: (f) => evidenceCount[f.id]?.total ?? 0 },
      { header: "Verification status", value: (f) => VERIFICATION_STATUS[f.verificationStatus].label },
      { header: "Data origin", value: (f) => DATA_ORIGIN[f.dataOrigin].label },
      { header: "Assessor", value: (f) => lookups.users[f.assignedAssessorId]?.name },
      { header: "Discovered", value: (f) => f.discoveredAt },
      { header: "CWE", value: (f) => f.cwe },
    ]);
    toast.success(`Exported ${list.length} finding(s) to CSV`);
  };

  const view = useView(VIEWS);
  const active = PARAM_KEYS.some((k) => params.has(k)) || !!q;
  const scopeChips = (["project", "target", "scan"] as const).filter((k) => params.has(k));

  return (
    <ContentContainer wide>
      <PageHeader
        title="Findings"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => exportRows(rows, "aivera-findings.csv")} disabled={!rows.length}>
              <Download /> Export CSV
            </Button>
            {canVerify && (
              <AddButton onClick={() => setManualOpen(true)}>Add manual finding</AddButton>
            )}
          </>
        }
      />
      <ViewSwitch options={VIEWS} label="Findings view" />
      {view === "risks" ? (
        <RisksView />
      ) : (
        <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["pending", "needs_review", "confirmed", "rejected"] as VerificationStatus[]).map((s) => (
          <button key={s} type="button" aria-pressed={get("status") === s} onClick={() => set("status")(get("status") === s ? ALL : s)} className={cn("rounded-2xl text-left transition-shadow hover:shadow-md", get("status") === s && "ring-2 ring-primary")}>
            <MiniStat label={VERIFICATION_STATUS[s].label} value={findings.filter((f) => f.verificationStatus === s).length} tone={STATUS_TONE[s]} />
          </button>
        ))}
      </div>
      <Card>
        <div className="space-y-2 border-b border-border p-3">
          <FilterBar active={active} onReset={() => { setQ(""); setParams({}, { replace: true }); }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search findings" />
            <FilterSelect label="Statuses" value={get("status")} onChange={set("status")} options={[{ value: "unverified", label: "Waiting for a decision" }, ...(Object.keys(VERIFICATION_STATUS) as VerificationStatus[]).map((k) => ({ value: k, label: VERIFICATION_STATUS[k].label }))]} />
            <FilterSelect label="Severities" value={get("severity")} onChange={set("severity")} options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_META[s].label }))} />
            <FilterSelect label="Testers" value={get("assessor")} onChange={set("assessor")} options={assessors.map((u) => ({ value: u.id, label: u.name }))} />
          </FilterBar>
          {scopeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              Scoped to:
              {scopeChips.map((k) => (
                <button key={k} type="button" onClick={() => set(k)(ALL)} className="rounded border border-primary/30 bg-primary/8 px-1.5 py-0.5 text-primary hover:bg-primary/15">
                  {k}: {k === "project" ? lookups.projects[params.get(k)!]?.code : k === "target" ? lookups.targets[params.get(k)!]?.name : params.get(k)} ✕
                </button>
              ))}
            </div>
          )}
        </div>
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(f) => f.id}
          loading={loading}
          selectable
          onRowClick={(f) => navigate(`/findings/${f.id}`)}
          initialSorting={[{ id: "discoveredAt", desc: true }]}
          caption="Findings register"
          bulkActions={(selected, clear) => (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7" disabled={!canVerify}>
                    <UserPlus /> Assign to…
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Assign {selected.length} finding(s)</DropdownMenuLabel>
                  {assessors.map((u) => (
                    <DropdownMenuItem key={u.id} onSelect={async () => { await findingService.assign(selected.map((s) => s.id), u.id); toast.success(`Assigned ${selected.length} finding(s) to ${u.name}`); clear(); }}>
                      {u.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" variant="outline" className="h-7" onClick={() => exportRows(selected, "aivera-findings-selected.csv")}>
                <Download /> Export selected
              </Button>
            </>
          )}
          empty={<EmptyState icon={ShieldAlert} title="No findings match" description="Clear the filters, or scan a website to find some." action={<Button size="sm" variant="outline" asChild><Link to="/scans/new">New scan</Link></Button>} />}
        />
      </Card>

        </>
      )}

      <Sheet open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <SheetContent>
          {preview && (
            <>
              <SheetHeader>
                <SheetTitle>{preview.title}</SheetTitle>
                <SheetDescription className="font-mono">{preview.code} · {preview.affectedAsset}</SheetDescription>
              </SheetHeader>
              <SheetBody>
                <FindingPreview
                  finding={preview}
                  task={remediation.find((t) => t.findingId === preview.id && t.status !== "accepted_risk") ?? remediation.find((t) => t.findingId === preview.id)}
                  website={lookups.targets[preview.targetId]?.name}
                  evidence={evidenceCount[preview.id]?.total ?? 0}
                />
              </SheetBody>
              <SheetFooter>
                <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
                <Button onClick={() => navigate(`/findings/${preview.id}`)}>
                  {preview.verificationStatus === "pending" || preview.verificationStatus === "needs_review" ? <><FileCheck2 /> Open & verify</> : <><FileX2 /> Open finding</>}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
      <ManualFindingDialog open={manualOpen} onOpenChange={setManualOpen} defaults={{ projectId: params.get("project") ?? undefined, targetId: params.get("target") ?? undefined }} />
    </ContentContainer>
  );
}
