import * as React from "react";
import { Link, useNavigate } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, ShieldAlert, Target as TargetIcon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/shared/DataTable";
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import { EmptyState } from "@/components/shared/states";
import { Callout, MiniStat } from "@/components/shared/display";
import { StatusBadge, OriginBadge } from "@/components/security/badges";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useInitialLoading, useLookups } from "@/hooks";
import { ASSET_TYPES, AUTHORIZATION_STATUS, ENVIRONMENTS } from "@/lib/constants";
import { formatRelative } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { AuthorizationStatus, Target } from "@/types";

export default function TargetsPage() {
  useDocumentTitle("Target Management");
  const loading = useInitialLoading();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const lookups = useLookups();
  const { targets, findings } = useDataStore(useShallow((s) => ({ targets: s.targets, findings: s.findings })));
  const [q, setQ] = React.useState("");
  const [auth, setAuth] = React.useState(ALL);
  const [env, setEnv] = React.useState(ALL);
  const [project, setProject] = React.useState(ALL);

  const rows = React.useMemo(() => {
    const term = q.toLowerCase();
    return targets.filter(
      (t) =>
        (auth === ALL || t.authorizationStatus === auth) &&
        (env === ALL || t.environment === env) &&
        (project === ALL || t.projectId === project) &&
        (!term || [t.name, t.url, t.owner].some((f) => f.toLowerCase().includes(term))),
    );
  }, [targets, q, auth, env, project]);

  const columns = React.useMemo<ColumnDef<Target, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Target",
        cell: ({ row }) => (
          <div className="min-w-52">
            <p className="font-medium">{row.original.name}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{row.original.url}</p>
          </div>
        ),
      },
      { id: "project", header: "Project", accessorFn: (t) => (t.projectId && lookups.projects[t.projectId]?.code) || "—", cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
      { accessorKey: "assetType", header: "Asset type", cell: ({ row }) => <span className="text-xs">{ASSET_TYPES[row.original.assetType]}</span> },
      { accessorKey: "environment", header: "Environment", cell: ({ row }) => <span className="text-xs">{ENVIRONMENTS[row.original.environment]}</span> },
      { accessorKey: "authorizationStatus", header: "Authorization", cell: ({ row }) => <StatusBadge status={row.original.authorizationStatus} map={AUTHORIZATION_STATUS} /> },
      { id: "scope", header: "Scope", accessorFn: (t) => t.scope.inScopeHosts.length, cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.scope.inScopeHosts.length} hosts · {row.original.scope.excludedPaths.length} exclusions</span> },
      { id: "findings", header: "Findings", accessorFn: (t) => findings.filter((f) => f.targetId === t.id).length },
      { id: "origin", header: "Origin", accessorFn: (t) => t.dataOrigin, cell: ({ row }) => <OriginBadge origin={row.original.dataOrigin} /> },
      { accessorKey: "updatedAt", header: "Updated", cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatRelative(getValue() as string)}</span> },
    ],
    [lookups.projects, findings],
  );

  const authorized = targets.filter((t) => t.authorizationStatus === "authorized" && t.authorizationConfirmed).length;

  return (
    <ContentContainer>
      <PageHeader
        title="Target & Scope Management"
        description="Register web applications that are approved for assessment and define exactly what may be tested."
        actions={
          can(user?.role, "manage_targets") && (
            <Button size="sm" asChild>
              <Link to="/targets/new">
                <Plus /> Register target
              </Link>
            </Button>
          )
        }
      />
      <Callout tone="warning" icon={ShieldAlert} title="Authorized targets only">
        Only websites with written permission from their owner may be registered and tested. Registering saves the details. The only contact with the website is the optional “Detect scope” check (DNS, robots.txt and sitemap.xml), done by the AIVERA server after you confirm permission — no crawling or scanning.
      </Callout>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Registered" value={targets.length} />
        <MiniStat label="Authorized & confirmed" value={authorized} tone="text-primary" />
        <MiniStat label="Pending authorization" value={targets.filter((t) => t.authorizationStatus === "pending").length} tone="text-sev-medium" />
        <MiniStat label="Expired / revoked" value={targets.filter((t) => t.authorizationStatus === "expired" || t.authorizationStatus === "revoked").length} tone="text-sev-critical" />
      </div>
      <Card>
        <div className="border-b border-border p-3">
          <FilterBar active={auth !== ALL || env !== ALL || project !== ALL || !!q} onReset={() => { setQ(""); setAuth(ALL); setEnv(ALL); setProject(ALL); }}>
            <SearchInput value={q} onChange={setQ} placeholder="Search name, URL, owner" />
            <FilterSelect label="Authorization" value={auth} onChange={setAuth} options={(Object.keys(AUTHORIZATION_STATUS) as AuthorizationStatus[]).map((k) => ({ value: k, label: AUTHORIZATION_STATUS[k].label }))} />
            <FilterSelect label="Environments" value={env} onChange={setEnv} options={Object.entries(ENVIRONMENTS).map(([value, label]) => ({ value, label }))} />
            <FilterSelect label="Projects" value={project} onChange={setProject} options={Object.values(lookups.projects).map((p) => ({ value: p.id, label: p.code }))} />
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
    </ContentContainer>
  );
}
