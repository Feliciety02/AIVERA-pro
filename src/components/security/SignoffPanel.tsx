import * as React from "react";
import { BadgeCheck, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { StatusBadge } from "@/components/security/badges";
import { useCurrentUser, useLookups } from "@/hooks";
import { SIGNOFF_STATUS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { IS_API, findingService } from "@/services";
import type { Verification, VulnerabilityFinding } from "@/types";

/**
 * Lead sign-off for confirmed critical and high findings. Shown only when sign-off applies.
 * The lead who confirmed a finding can't sign it off; the server enforces the same rule.
 */
export function SignoffPanel({ finding, history }: { finding: VulnerabilityFinding; history: Verification[] }) {
  const user = useCurrentUser();
  const lookups = useLookups();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState<"approve" | "return" | null>(null);
  const status = finding.signoffStatus ?? "not_required";
  if (!IS_API || status === "not_required") return null;

  const confirmer = history.find((v) => v.toStatus === "confirmed")?.assessorId;
  const canSign = can(user?.role, "signoff_findings") && confirmer !== user?.id;

  const decide = async (decision: "approve" | "return") => {
    if (decision === "return" && note.trim().length < 5) return toast.error("Say what needs another look (min. 5 characters).");
    setBusy(decision);
    try {
      await findingService.signoff(finding.id, decision, note.trim());
      toast.success(decision === "approve" ? "Signed off" : "Returned to the assessor");
      setNote("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label="Lead sign-off" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Lead sign-off</h2>
        <StatusBadge status={status} map={SIGNOFF_STATUS} />
      </div>
      {status === "pending" ? (
        canSign ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">Check the evidence and the assessor's notes. Signing off lets this finding go into a final report.</p>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (needed when returning)" aria-label="Sign-off note" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={!!busy} onClick={() => decide("approve")}>{busy === "approve" ? <Loader2 className="animate-spin" /> : <BadgeCheck />} Sign off</Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => decide("return")}>{busy === "return" ? <Loader2 className="animate-spin" /> : <Undo2 />} Return for another look</Button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            {confirmer === user?.id && can(user?.role, "signoff_findings") ? "You confirmed this finding, so another lead signs it off." : "Waiting for the project's Security Lead."}
          </p>
        )
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {SIGNOFF_STATUS[status].label} by {lookups.users[finding.signoffBy ?? ""]?.name ?? "a lead"}{finding.signoffAt ? `, ${formatDateTime(finding.signoffAt)}` : ""}{finding.signoffNote ? `: ${finding.signoffNote}` : ""}
        </p>
      )}
    </section>
  );
}
