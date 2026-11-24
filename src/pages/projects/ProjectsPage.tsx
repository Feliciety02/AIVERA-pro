import * as React from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Archive, FolderKanban, MoreHorizontal, Pencil, RotateCcw, Eye } from "lucide-react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { AddButton } from "@/components/shared/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable } from "@/components/shared/DataTable";
import { ALL, FilterBar, FilterSelect, SearchInput } from "@/components/shared/filters";
import { EmptyState } from "@/components/shared/states";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { IconChip, UserChip } from "@/components/shared/display";
import { StatusBadge, ToneBadge } from "@/components/security/badges";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useInitialLoading, useLookups } from "@/hooks";
import { ASSESSMENT_TYPES, PROJECT_STATUS } from "@/lib/constants";
import { formatRelative } from "@/lib/format";
import { can } from "@/lib/permissions";
import { projectService } from "@/services";
import type { Project, ProjectStatus } from "@/types";

export default function ProjectsPage() {
  useDocumentTitle("Projects");
  const loading = useInitialLoading();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const canManage = can(user?.role, "manage_projects");
  const lookups = useLookups();
  const { projects, targets, findings } = useDataStore(useShallow((s) => ({ projects: s.projects, targets: s.targets, findings: s.findings })));
  const [params, setParams] = useSearchParams();
  const [q, setQ] = React.useState("");
  const status = params.get("status") ?? ALL;
  const [owner, setOwner] = React.useState(ALL);
  const [type, setType] = React.useState(ALL);
  const [showArchived, setShowArchived] = React.useState(status === "archived");
  const [archiveTarget, setArchiveTarget] = React.useState<Project | null>(null);

  const setStatus = (v: string) => {
    const next = new URLSearchParams(params);
    if (v === ALL) next.delete("status");
    else next.set("status", v);
    setParams(next, { replace: true });
    if (v === "archived") setShowArchived(true);
  };

  const rows = React.useMemo(() => {
    const term = q.toLowerCase();
    return projects.filter(
      (p) =>
        (showArchived || p.status !== "archived" || status === "archived") &&
        (status === ALL || p.status === status) &&
        (owner === ALL || p.ownerId === owner) &&
        (type === ALL || p.assessmentType === type) &&
        (!term || [p.name, p.code, p.description, ...targets.filter((t) => t.projectId === p.id).flatMap((t) => [t.name, t.url])].some((f) => f.toLowerCase().includes(term))),
    );
  }, [projects, targets, q, status, owner, type, showArchived]);

  const columns = React.useMemo<ColumnDef<Project, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Project",
        cell: ({ row }) => (
          <div className="flex min-w-56 max-w-sm items-center gap-3">
            <IconChip icon={FolderKanban} />
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.name}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{row.original.code}</p>
            </div>
          </div>
        ),
      },
      {
        id: "websites",
        header: "Websites",
        accessorFn: (p) => targets.filter((t) => t.projectId === p.id).length,
        cell: ({ row }) => {
          const sites = targets.filter((t) => t.projectId === row.original.id);
          if (!sites.length) return <span className="text-xs text-muted-foreground">None yet</span>;
          return (
            <div className="max-w-56">
              <p className="truncate text-sm">{sites[0].name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{sites.length > 1 ? `and ${sites.length - 1} more` : sites[0].url}</p>
            </div>
          );
        },
      },
      { id: "owner", header: "Owner", accessorFn: (p) => lookups.users[p.ownerId]?.name ?? "", cell: ({ row }) => <UserChip user={lookups.users[row.original.ownerId]} /> },
      {
        id: "findings",
        header: "To verify",
        accessorFn: (p) => findings.filter((f) => f.projectId === p.id && (f.verificationStatus === "pending" || f.verificationStatus === "needs_review")).length,
        cell: ({ getValue }) => (getValue() as number) ? <ToneBadge tone="warning">{getValue() as number}</ToneBadge> : <span className="text-xs text-muted-foreground">0</span>,
      },
      { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} map={PROJECT_STATUS} /> },
      { accessorKey: "updatedAt", header: "Updated", cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatRelative(getValue() as string)}</span> },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${p.name}`} onClick={(e) => e.stopPropagation()}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onSelect={() => navigate(`/projects/${p.id}`)}>
                  <Eye /> View details
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canManage || p.status === "archived"} onSelect={() => navigate(`/projects/${p.id}/edit`)}>
                  <Pencil /> Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {p.status === "archived" ? (
                  <DropdownMenuItem
                    disabled={!canManage}
                    onSelect={async () => {
                      await projectService.restore(p.id);
                      toast.success(`Restored ${p.code}`);
                    }}
                  >
                    <RotateCcw /> Restore
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem variant="destructive" disabled={!canManage} onSelect={() => setArchiveTarget(p)}>
                    <Archive /> Archive
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [lookups.users, targets, findings, navigate, canManage],
  );

  const assessors = Object.values(lookups.users).filter((u) => can(u.role, "verify_findings"));
  const filtersActive = status !== ALL || owner !== ALL || type !== ALL || !!q;


  return (
    <ContentContainer>
      <PageHeader
        title="Projects"
        actions={
          canManage && (
            <AddButton to="/projects/new">New project</AddButton>
          )
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center lg:justify-between">
          <FilterBar
            active={filtersActive}
            onReset={() => {
              setQ("");
              setStatus(ALL);
              setOwner(ALL);
              setType(ALL);
            }}
          >
            <SearchInput value={q} onChange={setQ} placeholder="Search projects or websites" />
            <FilterSelect label="Statuses" value={status} onChange={setStatus} options={(Object.keys(PROJECT_STATUS) as ProjectStatus[]).map((k) => ({ value: k, label: PROJECT_STATUS[k].label }))} />
            <FilterSelect label="Testers" value={owner} onChange={setOwner} options={assessors.map((u) => ({ value: u.id, label: u.name }))} />
            <FilterSelect label="Types" value={type} onChange={setType} options={Object.entries(ASSESSMENT_TYPES).map(([value, label]) => ({ value, label }))} />
          </FilterBar>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-[var(--primary)]" />
            Show archived
          </label>
        </div>
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(p) => p.id}
          loading={loading}
          onRowClick={(p) => navigate(`/projects/${p.id}`)}
          initialSorting={[{ id: "updatedAt", desc: true }]}
          caption="Assessment projects"
          empty={
            <EmptyState
              icon={FolderKanban}
              title={projects.length ? "No projects match these filters" : "No projects yet"}
              description={projects.length ? "Try clearing filters or showing archived projects." : "Create a project, then add the websites you have permission to test."}
              action={canManage && !projects.length ? <AddButton to="/projects/new">New project</AddButton> : undefined}
            />
          }
        />
      </Card>
      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(o) => !o && setArchiveTarget(null)}
        title={`Archive ${archiveTarget?.code}?`}
        description={
          <>
            <strong className="text-foreground">{archiveTarget?.name}</strong> will be hidden from active views. Targets, findings and reports are kept and the project can be restored at any time.
          </>
        }
        confirmLabel="Archive project"
        destructive
        onConfirm={async () => {
          if (!archiveTarget) return;
          await projectService.archive(archiveTarget.id);
          toast.success(`Archived ${archiveTarget.code}`, {
            action: { label: "Undo", onClick: () => void projectService.restore(archiveTarget.id) },
          });
        }}
      />
    </ContentContainer>
  );
}
