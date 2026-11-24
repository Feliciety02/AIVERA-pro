import * as React from "react";
import { useNavigate } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Target as TargetIcon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { ViewSwitch, useView } from "@/components/shared/ViewSwitch";
import { DiscoveryView } from "@/pages/reconnaissance/ReconPage";

const VIEWS = [{ value: "list", label: "Websites" }, { value: "discovery", label: "Discovery" }] as const;
import { AddButton } from "@/components/shared/actions";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/shared/DataTable";
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import { EmptyState } from "@/components/shared/states";
import { IconChip } from "@/components/shared/display";
import { StatusBadge } from "@/components/security/badges";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useInitialLoading, useLookups } from "@/hooks";
import { AUTHORIZATION_STATUS } from "@/lib/constants";
import { formatRelative } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { AuthorizationStatus, Target } from "@/types";

export default function TargetsPage() {
  useDocumentTitle("Websites");
  const loading = useInitialLoading();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const lookups = useLookups();
  const { targets, findings } = useDataStore(useShallow((s) => ({ targets: s.targets, findings: s.findings })));
  const [q, setQ] = React.useState("");
  const [auth, setAuth] = React.useState(ALL);
  const [project, setProject] = React.useState(ALL);

  const rows = React.useMemo(() => {
    const term = q.toLowerCase();
    return targets.filter(
      (t) =>
        (auth === ALL || t.authorizationStatus === auth) &&
        (project === ALL || t.projectId === project) &&
        (!term || [t.name, t.url, t.owner].some((f) => f.toLowerCase().includes(term))),
    );
  }, [targets, q, auth, project]);

  const columns = React.useMemo<ColumnDef<Target, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Website",
        cell: ({ row }) => (
          <div className="flex min-w-52 items-center gap-3">
            <IconChip>{row.original.name.trim().charAt(0).toUpperCase() || "?"}</IconChip>
            <div className="min-w-0">
              <p className="font-medium">{row.original.name}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{row.original.url}</p>
            </div>
          </div>
        ),
      },
      { id: "project", header: "Project", accessorFn: (t) => (t.projectId && lookups.projects[t.projectId]?.name) || "", cell: ({ getValue }) => <span className="block max-w-56 truncate text-sm">{(getValue() as string) || <span className="text-muted-foreground">None</span>}</span> },
      { accessorKey: "authorizationStatus", header: "Permission", cell: ({ row }) => <StatusBadge status={row.original.authorizationStatus} map={AUTHORIZATION_STATUS} /> },
      { id: "findings", header: user?.role === "remediation_owner" ? "Confirmed problems" : "Findings", accessorFn: (t) => findings.filter((f) => f.targetId === t.id && (user?.role !== "remediation_owner" || f.verificationStatus === "confirmed")).length, cell: ({ getValue }) => <span className="tabular-nums">{getValue() as number}</span> },
      { accessorKey: "updatedAt", header: "Updated", cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatRelative(getValue() as string)}</span> },
    ],
    [lookups.projects, findings, user?.role],
  );

  const isOwner = user?.role === "remediation_owner";
  const chosenView = useView(VIEWS);
  const view = isOwner ? "list" : chosenView;

  return (
    <ContentContainer wide={view === "discovery"}>
      <PageHeader
        title={user?.role === "remediation_owner" ? "My websites" : "Websites"}
        actions={
          can(user?.role, "manage_targets") && (
            <AddButton to="/targets/new">Add website</AddButton>
          )
        }
      />
      {!isOwner && <ViewSwitch options={VIEWS} label="Websites view" />}
      {view === "discovery" ? (
        <DiscoveryView />
      ) : (
        <>
      <Card>
        <div className="border-b border-border p-3">
          <FilterBar active={auth !== ALL || project !== ALL || !!q} onReset={() => { setQ(""); setAuth(ALL); setProject(ALL); }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search name, URL, owner" />
            <FilterSelect label="Permission" value={auth} onChange={setAuth} options={(Object.keys(AUTHORIZATION_STATUS) as AuthorizationStatus[]).map((k) => ({ value: k, label: AUTHORIZATION_STATUS[k].label }))} />
            <FilterSelect label="Projects" value={project} onChange={setProject} options={Object.values(lookups.projects).map((p) => ({ value: p.id, label: p.name }))} />
          </FilterBar>
        </div>
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(t) => t.id}
          loading={loading}
          onRowClick={(t) => navigate(`/targets/${t.id}`)}
          caption="Registered targets"
          empty={<EmptyState icon={TargetIcon} title="No targets match" description="Adjust filters or register a new authorized target." />}
        />
      </Card>
        </>
      )}
    </ContentContainer>
  );
}
