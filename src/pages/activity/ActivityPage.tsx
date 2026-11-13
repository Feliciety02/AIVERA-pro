import * as React from "react";
import { Link } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Download, Loader2, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { IS_API, auditService, type AuditVerification } from "@/services";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/shared/DataTable";
import { ALL, DateRangeFilter, FilterBar, FilterSelect, SearchInput, type DateRange } from "@/components/shared/filters";
import { Callout, UserChip } from "@/components/shared/display";
import { ToneBadge } from "@/components/security/badges";
import { useDataStore } from "@/stores/dataStore";
import { useDocumentTitle, useInitialLoading, useLookups } from "@/hooks";
import { ACTIVITY_LABELS, activityIcon } from "@/features/activityMeta";
import { formatDateTime } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import type { ActivityLog, ActivityType, EntityType } from "@/types";

const ENTITY_LINK: Partial<Record<EntityType, (id: string) => string>> = {
  project: (id) => `/projects/${id}`,
  target: (id) => `/targets/${id}`,
  scan: (id) => `/scans/${id}`,
  finding: (id) => `/findings/${id}`,
  report: (id) => `/reports/${id}`,
  remediation: (id) => `/remediation?task=${id}`,
};

export default function ActivityPage() {
  useDocumentTitle("Activity Logs");
  const loading = useInitialLoading();
  const lookups = useLookups();
  const activity = useDataStore((s) => s.activity);
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState(ALL);
  const [userId, setUserId] = React.useState(ALL);
  const [entity, setEntity] = React.useState(ALL);
  const [range, setRange] = React.useState<DateRange>({ from: "2025-01-01", to: new Date().toISOString().slice(0, 10) });

  const rows = React.useMemo(
    () =>
      activity.filter(
        (a) =>
          (type === ALL || a.type === type) &&
          (userId === ALL || a.userId === userId) &&
          (entity === ALL || a.entityType === entity) &&
          a.timestamp.slice(0, 10) >= range.from &&
          a.timestamp.slice(0, 10) <= range.to &&
          (!q || [a.description, a.entityLabel, ACTIVITY_LABELS[a.type]].some((x) => x.toLowerCase().includes(q.toLowerCase()))),
      ),
    [activity, type, userId, entity, range, q],
  );

  const columns: ColumnDef<ActivityLog, unknown>[] = [
    { accessorKey: "timestamp", header: "Timestamp", cell: ({ getValue }) => <span className="whitespace-nowrap font-mono text-[11px]">{formatDateTime(getValue() as string)}</span> },
    {
      accessorKey: "type",
      header: "Event Type",
      cell: ({ row }) => {
        const { icon: Icon, tone } = activityIcon(row.original.type);
        return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs"><Icon className={`size-3.5 ${tone}`} /> {ACTIVITY_LABELS[row.original.type]}</span>;
      },
    },
    { id: "user", header: "User", accessorFn: (a) => lookups.users[a.userId]?.name ?? a.userId, cell: ({ row }) => <UserChip user={lookups.users[row.original.userId]} /> },
    {
      id: "entity",
      header: "Associated Entity",
      accessorFn: (a) => a.entityLabel,
      cell: ({ row }) => {
        const a = row.original;
        const link = a.entityId ? ENTITY_LINK[a.entityType]?.(a.entityId) : undefined;
        return (
          <span className="flex items-center gap-1.5 whitespace-nowrap text-xs">
            <ToneBadge tone="muted">{a.entityType}</ToneBadge>
            {link ? <Link to={link} onClick={(e) => e.stopPropagation()} className="hover:text-primary">{a.entityLabel}</Link> : a.entityLabel}
          </span>
        );
      },
    },
    { accessorKey: "description", header: "Description", enableSorting: false, cell: ({ getValue }) => <span className="block max-w-lg text-xs text-foreground/85">{getValue() as string}</span> },
  ];

  return (
    <ContentContainer wide>
      <PageHeader
        title="Activity Logs"
        description="Every action taken in AIVERA, newest first."
        actions={
          <Button variant="outline" size="sm" disabled={!rows.length} onClick={() => { downloadCSV("aivera-activity.csv", rows, [{ header: "Timestamp", value: (a) => a.timestamp }, { header: "Event", value: (a) => ACTIVITY_LABELS[a.type] }, { header: "User", value: (a) => lookups.users[a.userId]?.name ?? a.userId }, { header: "Entity type", value: (a) => a.entityType }, { header: "Entity", value: (a) => a.entityLabel }, { header: "Description", value: (a) => a.description }]); toast.success(`Exported ${rows.length} log entries`); }}>
            <Download /> Export CSV
          </Button>
        }
      />
      {IS_API ? (
        <LogIntegrity />
      ) : (
        <Callout tone="warning" icon={ShieldAlert} title="Demonstration log, not a secure audit trail">
          In demo mode these entries live in your browser and can be edited or cleared. The full app keeps a tamper-evident log on the server.
        </Callout>
      )}
      <Card>
        <div className="border-b border-border p-3">
          <FilterBar active={type !== ALL || userId !== ALL || entity !== ALL || !!q} onReset={() => { setQ(""); setType(ALL); setUserId(ALL); setEntity(ALL); }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search descriptions" />
            <FilterSelect label="Event types" value={type} onChange={setType} options={(Object.keys(ACTIVITY_LABELS) as ActivityType[]).map((k) => ({ value: k, label: ACTIVITY_LABELS[k] }))} />
            <FilterSelect label="Users" value={userId} onChange={setUserId} options={Object.values(lookups.users).map((u) => ({ value: u.id, label: u.name }))} />
            <FilterSelect label="Entities" value={entity} onChange={setEntity} options={(["project", "target", "scan", "finding", "remediation", "report", "risk", "assessment", "user", "settings", "system"] as EntityType[]).map((e) => ({ value: e, label: e }))} />
            <DateRangeFilter value={range} onChange={setRange} />
          </FilterBar>
        </div>
        <DataTable data={rows} columns={columns} getRowId={(a) => a.id} loading={loading} initialSorting={[{ id: "timestamp", desc: true }]} pageSize={20} caption="Activity log" />
      </Card>
    </ContentContainer>
  );
}

/** Recomputes the server's hash chain and shows whether any entry was changed or removed. */
function LogIntegrity() {
  const [result, setResult] = React.useState<AuditVerification | null>(null);
  const [busy, setBusy] = React.useState(false);
  const check = React.useCallback(async () => {
    setBusy(true);
    try {
      setResult(await auditService.verify());
    } catch {
      setResult(null);
    } finally {
      setBusy(false);
    }
  }, []);
  React.useEffect(() => void check(), [check]);

  const tone = !result ? "info" : result.intact ? "success" : "danger";
  const Icon = !result ? ShieldCheck : result.intact ? ShieldCheck : ShieldX;
  const title = busy && !result ? "Checking the log…" : !result ? "Log integrity not checked" : result.intact ? "Log intact" : "Log has been tampered with";
  return (
    <Callout tone={tone} icon={Icon} title={title}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1">
          {!result
            ? "Each entry is chained to the one before it with a keyed fingerprint (HMAC-SHA256), so any change or deletion shows up here."
            : result.intact
              ? `All ${result.checked} entries match their fingerprints and none are missing. Checked ${formatDateTime(result.verifiedAt)}.`
              : `${result.problem} Entries before #${result.firstBadSeq} are still verified. Restore the database from a backup and investigate.`}
          {result && result.unsealed > 0 && ` ${result.unsealed} new entr${result.unsealed === 1 ? "y is" : "ies are"} waiting to be sealed.`}
        </p>
        <Button size="sm" variant="outline" className="bg-card" disabled={busy} onClick={() => void check()}>
          {busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Check again
        </Button>
      </div>
    </Callout>
  );
}
