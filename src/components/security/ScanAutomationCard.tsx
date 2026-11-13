import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/shared/display";
import { Field } from "@/components/forms/fields";
import { automationService, type ScanCredentialStatus } from "@/services";
import { AUTH_SCAN_ACTIVITY, hasActivity } from "@/features/scanPermissions";
import { formatRelative } from "@/lib/format";
import { useCurrentUser } from "@/hooks";
import { can } from "@/lib/permissions";
import type { Target } from "@/types";

/** The saved test-account session for signed-in scans of one website (full app only). */
export function ScanAutomationCard({ target }: { target: Target }) {
  const user = useCurrentUser();
  const canScan = can(user?.role, "run_demo_scans");
  const canManage = can(user?.role, "manage_targets");
  const [credential, setCredential] = React.useState<ScanCredentialStatus>({ configured: false });
  const [loaded, setLoaded] = React.useState(false);

  const reload = React.useCallback(async () => {
    setCredential(await automationService.credential(target.id).catch(() => ({ configured: false })));
    setLoaded(true);
  }, [target.id]);
  React.useEffect(() => void reload(), [reload]);

  if (!canScan) return null;
  return (
    <SectionCard title="Signed-in scans" description="Scan pages that need a login, using a test account.">
      {!loaded ? <p className="text-sm text-muted-foreground">Loading…</p> : <CredentialForm target={target} credential={credential} canManage={canManage} onSaved={reload} />}
    </SectionCard>
  );
}

function CredentialForm({ target, credential, canManage, onSaved }: { target: Target; credential: ScanCredentialStatus; canManage: boolean; onSaved: () => Promise<void> }) {
  const allowed = hasActivity(AUTH_SCAN_ACTIVITY, target.scope.allowedActivities);
  const [editing, setEditing] = React.useState(false);
  const [headerName, setHeaderName] = React.useState(credential.headerName ?? "Cookie");
  const [value, setValue] = React.useState("");
  const [label, setLabel] = React.useState(credential.label ?? "");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      toast.success(done);
      setEditing(false);
      setValue("");
      await onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {!allowed ? (
        <p className="text-sm text-muted-foreground">Allow "{AUTH_SCAN_ACTIVITY}" in the scope to scan as a signed-in user.</p>
      ) : !editing ? (
        <>
          <p className="text-sm text-muted-foreground">
            {credential.configured
              ? `Saved: ${credential.headerName} header${credential.label ? `, ${credential.label}` : ""}, updated ${formatRelative(credential.updatedAt!)}. The value is encrypted on the server and never shown again.`
              : "None saved. Scans run as a signed-out visitor."}
          </p>
          {canManage && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => setEditing(true)}>
                {credential.configured ? "Replace" : "Add session"}
              </Button>
              {credential.configured && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => automationService.removeCredential(target.id), "Session removed")}>
                  Remove
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Sign in to the website with a test account (never a real person's), then copy the session from the browser's developer tools. For a cookie, paste it as
            <code className="mx-1 rounded bg-muted px-1 font-mono">name=value; other=value</code>. Scans skip logout links so the session stays valid.
          </p>
          <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
            <Field id="cred-header" label="Header">
              <Input id="cred-header" value={headerName} onChange={(e) => setHeaderName(e.target.value)} />
            </Field>
            <Field id="cred-value" label="Value">
              <Input id="cred-value" type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
          </div>
          <Field id="cred-label" label="Label (optional)">
            <Input id="cred-label" placeholder="e.g. test student account" value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
          <div className="flex gap-2">
            <Button size="sm" className="rounded-full" disabled={busy || !value.trim() || !headerName.trim()} onClick={() => run(() => automationService.saveCredential(target.id, { headerName: headerName.trim(), value: value.trim(), label: label.trim() }), "Session saved")}>
              {busy && <Loader2 className="animate-spin" />} Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setValue(""); setErr(null); }}>
              Cancel
            </Button>
          </div>
        </>
      )}
      {!editing && err && <p role="alert" className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
