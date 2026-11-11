import * as React from "react";
import { DIALOG_GUIDES } from "@/features/dialogGuides";
import { DialogGuide } from "@/components/shared/DialogGuide";
import { CircleCheck, CircleX, Loader2, ShieldQuestion, Timer, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/forms/fields";
import { Callout } from "@/components/shared/display";
import { useDataStore } from "@/stores/dataStore";
import { useCurrentUser } from "@/hooks";
import { VERIFICATION_STATUS } from "@/lib/constants";
import { formatDateTime, nowISO } from "@/lib/format";
import { verificationService } from "@/services";
import type { VerificationStatus, VulnerabilityFinding } from "@/types";
import { SeverityBadge, OriginBadge } from "./badges";

const ICONS: Record<VerificationStatus, typeof CircleCheck> = { confirmed: CircleCheck, rejected: CircleX, needs_review: ShieldQuestion, pending: Timer };

/**
 * Human verification form. Confirming requires explicit evidence review and a
 * second confirmation step — an AI suggestion can never confirm a finding.
 */
export function VerificationDialog({ finding, status, open, onOpenChange }: { finding: VulnerabilityFinding; status: VerificationStatus | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const user = useCurrentUser();
  const settings = useDataStore((s) => s.settings.security);
  const [notes, setNotes] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [reviewed, setReviewed] = React.useState(false);
  const [stage, setStage] = React.useState<"form" | "confirm">("form");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setNotes("");
      setReason("");
      setReviewed(false);
      setStage("form");
      setErr(null);
    }
  }, [open, status]);

  if (!status) return null;
  const Icon = ICONS[status];
  const isConfirm = status === "confirmed";
  const needsEvidence = settings.requireEvidenceReview && (status === "confirmed" || status === "rejected");

  const validate = () => {
    if (reason.trim().length < 5) return "Provide a decision reason (min. 5 characters).";
    if (status !== "pending" && notes.trim().length < 10) return "Verification notes are required (min. 10 characters).";
    if (needsEvidence && !reviewed) return "Confirm that you reviewed the technical evidence.";
    return null;
  };

  const submit = async () => {
    setBusy(true);
    try {
      await verificationService.record({ findingId: finding.id, toStatus: status, notes: notes.trim(), decisionReason: reason.trim(), evidenceReviewed: reviewed });
      toast.success(`${finding.code} marked ${VERIFICATION_STATUS[status].label}`, { description: isConfirm ? "Now counted as a verified vulnerability on the dashboard." : undefined });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="size-4" /> Mark as {VERIFICATION_STATUS[status].label}
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono">{finding.code}</span> · {finding.title}
          </DialogDescription>
        </DialogHeader>
        {stage === "form" && <DialogGuide guideKey="verification" steps={DIALOG_GUIDES.verification} />}
        <div className="flex flex-wrap gap-2">
          <SeverityBadge severity={finding.severity} />
          <OriginBadge origin={finding.dataOrigin} />
        </div>

        {stage === "form" ? (
          <div className="space-y-4">
            {finding.dataOrigin === "simulated" && isConfirm && (
              <Callout tone="demo" title="Simulated finding">
                Confirming a SIMULATED finding records a demo decision only. It remains labelled SIMULATED and is not real evidence of a vulnerability.
              </Callout>
            )}
            <Field id="v-notes" label="Verification notes" required={status !== "pending"}>
              <Textarea id="v-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did you verify? Steps, observations, environment…" />
            </Field>
            <Field id="v-reason" label="Decision reason" required>
              <Textarea id="v-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isConfirm ? "e.g. Reproduced manually; impact consistent with description" : status === "rejected" ? "e.g. False positive — compensating control verified" : "e.g. Requires owner input"} />
            </Field>
            {(needsEvidence || status === "needs_review") && (
              <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <Checkbox id="v-reviewed" checked={reviewed} onCheckedChange={(v) => setReviewed(v === true)} className="mt-0.5" />
                <Label htmlFor="v-reviewed" className="text-sm leading-snug">I reviewed the technical evidence attached to this finding{needsEvidence ? " (required)" : ""}.</Label>
              </div>
            )}
            <dl className="grid grid-cols-2 gap-3 rounded-md border border-dashed border-border p-3 text-xs">
              <div><dt className="text-muted-foreground">Assessor</dt><dd className="font-medium">{user?.name}</dd></div>
              <div><dt className="text-muted-foreground">Verification date</dt><dd className="font-medium">{formatDateTime(nowISO())}</dd></div>
            </dl>
            {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
          </div>
        ) : (
          <Callout tone="danger" icon={TriangleAlert} title="Confirm this vulnerability?">
            You are recording a human decision that <strong>{finding.code}</strong> is a real, verified vulnerability. It will count toward confirmed vulnerability metrics, create a risk record, and can be included in reports. AI suggestions are not a substitute for this decision.
          </Callout>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => (stage === "confirm" ? setStage("form") : onOpenChange(false))} disabled={busy}>
            {stage === "confirm" ? "Back" : "Cancel"}
          </Button>
          <Button
            data-guide="v-submit"
            variant={status === "rejected" ? "secondary" : isConfirm ? "destructive" : "default"}
            disabled={busy}
            onClick={() => {
              const e = validate();
              if (e) return setErr(e);
              setErr(null);
              if (isConfirm && settings.requireConfirmBeforeVerify && stage === "form") return setStage("confirm");
              void submit();
            }}
          >
            {busy && <Loader2 className="animate-spin" />}
            {isConfirm ? (stage === "confirm" ? "Yes, confirm vulnerability" : "Continue") : `Mark ${VERIFICATION_STATUS[status].label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
