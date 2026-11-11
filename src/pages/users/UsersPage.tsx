import * as React from "react";
import { DIALOG_GUIDES } from "@/features/dialogGuides";
import { DialogGuide } from "@/components/shared/DialogGuide";
import type { ColumnDef } from "@tanstack/react-table";
import { useShallow } from "zustand/react/shallow";
import { Check, Minus, ShieldAlert, UserCog } from "lucide-react";
import { toast } from "sonner";
import { ContentContainer, PageHeader } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DataTable } from "@/components/shared/DataTable";
import { Callout, KeyValue, MiniStat, SectionCard, UserChip } from "@/components/shared/display";
import { ToneBadge } from "@/components/security/badges";
import { ChoiceCard } from "@/components/forms/fields";
import { NAV } from "@/components/layout/nav";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser, useDocumentTitle, useInitialLoading, useLookups } from "@/hooks";
import { ROLE_META } from "@/lib/constants";
import { can, PERMISSION_LABELS, permissionsFor, type Permission } from "@/lib/permissions";
import { formatDate, formatRelative } from "@/lib/format";
import { userService } from "@/services";
import type { AccountStatus, User, UserRole } from "@/types";

const ROLES: UserRole[] = ["administrator", "assessor", "viewer"];
const STATUS_TONE: Record<AccountStatus, "primary" | "warning" | "danger"> = { active: "primary", invited: "warning", suspended: "danger" };

function UserEditor({ user, onClose, isSelf }: { user: User; onClose: () => void; isSelf: boolean }) {
  const projects = useDataStore((s) => s.projects);
  const activity = useDataStore((s) => s.activity);
  const [role, setRole] = React.useState(user.role);
  const [status, setStatus] = React.useState(user.status);
  const [assigned, setAssigned] = React.useState(user.assignedProjectIds);
  const mine = activity.filter((a) => a.userId === user.id);
  return (
    <>
      <SheetBody className="space-y-5">
        {!isSelf && <DialogGuide guideKey="userEditor" steps={DIALOG_GUIDES.userEditor} inSheet />}
        <dl className="grid grid-cols-2 gap-4">
          <KeyValue label="Email">{user.email}</KeyValue>
          <KeyValue label="Title">{user.title}</KeyValue>
          <KeyValue label="Created">{formatDate(user.createdAt)}</KeyValue>
          <KeyValue label="Last active">{formatRelative(user.lastActiveAt)}</KeyValue>
        </dl>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Role</p>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)} disabled={isSelf}>
              <SelectTrigger aria-label="Role"><SelectValue /></SelectTrigger>
              <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_META[r].label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium">Account status</p>
            <Select value={status} onValueChange={(v) => setStatus(v as AccountStatus)} disabled={isSelf}>
              <SelectTrigger aria-label="Account status"><SelectValue /></SelectTrigger>
              <SelectContent>{(["active", "invited", "suspended"] as AccountStatus[]).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {isSelf && <p className="text-[11px] text-muted-foreground">You cannot change your own role or status in the demo.</p>}
        <div className="space-y-2" data-guide="user-projects">
          <p className="text-xs font-medium">Assigned projects</p>
          <div className="space-y-1.5">
            {projects.map((p) => (
              <ChoiceCard key={p.id} checked={assigned.includes(p.id)} onToggle={() => setAssigned(assigned.includes(p.id) ? assigned.filter((x) => x !== p.id) : [...assigned, p.id])} title={p.name} description={p.code} />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium">Activity summary</p>
          <p className="text-xs text-muted-foreground">{mine.length} logged action(s). Most recent: {mine[0] ? `${mine[0].description} (${formatRelative(mine[0].timestamp)})` : "none"}.</p>
        </div>
      </SheetBody>
      <SheetFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button
          onClick={async () => {
            await userService.update(user.id, { role, status, assignedProjectIds: assigned });
            toast.success(`Updated ${user.name}`, { description: "Demo-only change. Real role changes require the backend." });
            onClose();
          }}
        >
          Save user
        </Button>
      </SheetFooter>
    </>
  );
}

export default function UsersPage() {
  useDocumentTitle("User Management");
  const loading = useInitialLoading();
  const me = useCurrentUser();
  const lookups = useLookups();
  const { users, activity } = useDataStore(useShallow((s) => ({ users: s.users, activity: s.activity })));
  const [editing, setEditing] = React.useState<User | null>(null);
  const [previewRole, setPreviewRole] = React.useState<UserRole>("viewer");

  if (!can(me?.role, "manage_users"))
    return (
      <ContentContainer>
        <PageHeader title="User Management" />
        <Callout tone="warning">Only the Administrator demo role can manage users.</Callout>
      </ContentContainer>
    );

  const columns: ColumnDef<User, unknown>[] = [
    { accessorKey: "name", header: "User", cell: ({ row }) => <div><UserChip user={row.original} showTitle /></div> },
    { accessorKey: "email", header: "Email", cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{getValue() as string}</span> },
    { accessorKey: "role", header: "Role", cell: ({ row }) => <ToneBadge tone={ROLE_META[row.original.role].tone}>{ROLE_META[row.original.role].label}</ToneBadge> },
    { accessorKey: "status", header: "Account Status", cell: ({ row }) => <ToneBadge tone={STATUS_TONE[row.original.status]} dot>{row.original.status}</ToneBadge> },
    { id: "projects", header: "Assigned Projects", accessorFn: (u) => u.assignedProjectIds.length, cell: ({ row }) => <span className="text-xs">{row.original.assignedProjectIds.map((id) => lookups.projects[id]?.code).filter(Boolean).join(", ") || "—"}</span> },
    { id: "activity", header: "Activity", accessorFn: (u) => activity.filter((a) => a.userId === u.id).length, cell: ({ getValue }) => <span className="text-xs tabular-nums">{getValue() as number} actions</span> },
    { accessorKey: "lastActiveAt", header: "Last active", cell: ({ getValue }) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatRelative(getValue() as string)}</span> },
  ];

  const allPerms = Object.keys(PERMISSION_LABELS) as Permission[];
  const visibleNav = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.requires || can(previewRole, i.requires)) })).filter((g) => g.items.length);

  return (
    <ContentContainer wide>
      <PageHeader title="User Management" description="Manage demo accounts, roles and project assignments." />
      <Callout tone="warning" icon={ShieldAlert} title="Frontend demonstration only">
        Roles, route guards and permissions here are enforced only in the browser and stored in localStorage. They do not provide real authentication or authorization — the backend will enforce access control on every request.
      </Callout>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Users" value={users.length} />
        {ROLES.map((r) => <MiniStat key={r} label={ROLE_META[r].label} value={users.filter((u) => u.role === r).length} />)}
      </div>
      <Card>
        <DataTable data={users} columns={columns} getRowId={(u) => u.id} loading={loading} onRowClick={setEditing} caption="Users" />
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <SectionCard title="Roles & permissions" description="What each demo role can do in the UI">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Permission</TableHead>
                {ROLES.map((r) => <TableHead key={r} className="text-center">{ROLE_META[r].label}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {allPerms.map((p) => (
                <TableRow key={p}>
                  <TableCell className="text-xs">{PERMISSION_LABELS[p]}</TableCell>
                  {ROLES.map((r) => (
                    <TableCell key={r} className="text-center">
                      {permissionsFor(r).includes(p) ? <Check className="mx-auto size-4 text-primary" aria-label="Allowed" /> : <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="Not allowed" />}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
            {ROLES.map((r) => <li key={r}><span className="font-medium text-foreground">{ROLE_META[r].label}:</span> {ROLE_META[r].description}</li>)}
          </ul>
        </SectionCard>
        <SectionCard title="Role-based navigation demo" icon={UserCog} description="Preview the sidebar each role sees" actions={
          <Select value={previewRole} onValueChange={(v) => setPreviewRole(v as UserRole)}>
            <SelectTrigger className="h-8 w-40 text-xs" aria-label="Preview role"><SelectValue /></SelectTrigger>
            <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_META[r].label}</SelectItem>)}</SelectContent>
          </Select>
        }>
          <div className="rounded-lg border border-border bg-sidebar p-3">
            {visibleNav.map((g) => (
              <div key={g.label} className="mb-3 last:mb-0">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{g.label}</p>
                <ul className="space-y-0.5">
                  {g.items.map((i) => (
                    <li key={i.to} className="flex items-center gap-2 rounded px-2 py-1 text-xs text-sidebar-foreground"><i.icon className="size-3.5 text-muted-foreground" /> {i.label}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">Switch persona via the user menu → “Switch demo account” to experience it.</p>
        </SectionCard>
      </div>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent>
          {editing && (
            <>
              <SheetHeader>
                <SheetTitle>{editing.name}</SheetTitle>
                <SheetDescription>User details</SheetDescription>
              </SheetHeader>
              <UserEditor key={editing.id} user={editing} isSelf={editing.id === me?.id} onClose={() => setEditing(null)} />
            </>
          )}
        </SheetContent>
      </Sheet>
    </ContentContainer>
  );
}
