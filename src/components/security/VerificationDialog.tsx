import * as React from "react";
import { DIALOG_GUIDES } from "@/features/dialogGuides";
import { DialogGuide } from "@/components/shared/DialogGuide";
import { CircleCheck, CircleX, Loader2, ShieldQuestion, Sparkles, Timer, TriangleAlert } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { blankOptions, fillAllBlanks, fillBlank, findBlanks, suggestVerification } from "@/features/verificationSuggestions";
import { cn } from "@/lib/utils";
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

const ICONS: Record<VerificationStatus, typeof CircleCheck> = { confirmed: CircleCheck, rejected: CircleX, needs_review: ShieldQuestion, pending: Timer };

/**
 * Human verification form. Confirming requires explicit evidence review and a
 * second confirmation step, an AI suggestion can never confirm a finding.
 */
export function VerificationDialog({ finding, status, open, onOpenChange, onSaved }: { finding: VulnerabilityFinding; status: VerificationStatus | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved?: (status: VerificationStatus) => void }) {
  const user = useCurrentUser();
  const settings = useDataStore((s) => s.settings.security);
  const [notes, setNotes] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [reviewed, setReviewed] = React.useState(false);
  const [stage, setStage] = React.useState<"form" | "confirm">("form");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // Select the stored arrays as-is (stable references) and filter in a memo, so renders don't loop.
  const { allEvidence, allFindings } = useDataStore(useShallow((s) => ({ allEvidence: s.evidence, allFindings: s.findings })));
  const suggestion = React.useMemo(() => {
    if (!status) return null;
    const evidence = allEvidence.filter((e) => e.findingId === finding.id);
    const siblings = allFindings.filter((x) => x.targetId === finding.targetId);
    return suggestVerification({ finding, evidence, siblings }, status);
  }, [finding, allEvidence, allFindings, status]);

  // Autofill: open with the suggested texts ready. Facts are filled in; [blanks] need the assessor.
  React.useEffect(() => {
    if (open) {
      setNotes(suggestion?.notes ?? "");
      setReason(suggestion?.reason ?? "");
      setReviewed(false);
      setStage("form");
      setErr(null);
    }
  }, [open, status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!status) return null;
  const Icon = ICONS[status];
  const isConfirm = status === "confirmed";
  const needsEvidence = settings.requireEvidenceReview && (status === "confirmed" || status === "rejected");

  const notesBlanks = findBlanks(notes);
  const reasonBlanks = findBlanks(reason);
  const validate = () => {
    if (notesBlanks.length || reasonBlanks.length) return "Fill in or delete the highlighted [ ] parts before saving.";
    if (reason.trim().length < 5) return "Provide a decision reason (min. 5 characters).";
    if (status !== "pending" && notes.trim().length < 10) return "Verification notes are required (min. 10 characters).";
    if (needsEvidence && !reviewed) return "Confirm that you reviewed the technical evidence.";
    return null;
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await verificationService.record({ findingId: finding.id, toStatus: status, notes: notes.trim(), decisionReason: reason.trim(), evidenceReviewed: reviewed });
      toast.success(`${finding.code} marked ${VERIFICATION_STATUS[status].label}`, { description: isConfirm ? "Now counted as a verified vulnerability on the dashboard." : undefined });
      onOpenChange(false);
      onSaved?.(status);
    } catch (e) {
      // Keep the dialog open with the typed notes, so nothing is lost.
      setStage("form");
      setErr(`Not saved. ${(e as Error).message || "The AIVERA server could not be reached."} Your notes are still here, so you can try again.`);
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
        {stage === "form" ? (
          <div className="space-y-4">
            {finding.dataOrigin === "simulated" && isConfirm && <p className="text-xs text-warning">Practice data: this only records a demo decision.</p>}
            {suggestion && (
              <div data-guide="v-autofill" className="space-y-1.5 rounded-xl bg-muted/50 px-3.5 py-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Sparkles className="size-3.5 text-primary" aria-hidden />
                  <span className="text-muted-foreground">
                    Filled in for you{notesBlanks.length + reasonBlanks.length > 0 ? ". Pick an answer for each [ ] or skip them." : "."}
                  </span>
                  <span className="ml-auto flex gap-1">
                    {(notesBlanks.length > 0 || reasonBlanks.length > 0) && (
                      <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => { setNotes(fillAllBlanks(notes)); setReason(fillAllBlanks(reason)); setErr(null); }}>
                        Skip the rest
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" className="h-7 text-primary" onClick={() => { setNotes(suggestion.notes); setReason(suggestion.reason); setErr(null); }}>
                      Refill
                    </Button>
                  </span>
                </div>
              </div>
            )}
            <Field id="v-notes" label="Verification notes" required={status !== "pending"}>
              <Textarea id="v-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did you verify? Steps, observations, environment…" className={cn(notesBlanks.length > 0 && "border-warning/70")} />
              <BlankFiller text={notes} onChange={setNotes} />
            </Field>
            <Field id="v-reason" label="Decision reason" required>
              <Textarea id="v-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isConfirm ? "e.g. Reproduced manually; impact consistent with description" : status === "rejected" ? "e.g. False positive, compensating control verified" : "e.g. Requires owner input"} className={cn(reasonBlanks.length > 0 && "border-warning/70")} />
              <BlankFiller text={reason} onChange={setReason} />
              {suggestion && (
                <div className="flex flex-wrap gap-1.5 pt-1" aria-label="Quick reasons">
                  {suggestion.reasonChips.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setReason(c)}
                      className={cn("rounded-full border px-2.5 py-1 text-left text-xs transition-colors hover:bg-accent", reason === c ? "border-primary bg-primary/8 text-primary" : "border-border text-muted-foreground")}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </Field>
            {(needsEvidence || status === "needs_review") && (
              <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <Checkbox id="v-reviewed" checked={reviewed} onCheckedChange={(v) => setReviewed(v === true)} className="mt-0.5" />
                <Label htmlFor="v-reviewed" className="text-sm leading-snug">I reviewed the technical evidence attached to this finding{needsEvidence ? " (required)" : ""}.</Label>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">Recorded as {user?.name}, {formatDateTime(nowISO())}</p>
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
            variant={status === "rejected" ? "success" : isConfirm ? "destructive" : status === "needs_review" ? "warning" : "default"}
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
            {isConfirm
              ? stage === "confirm" ? "Yes, it is a real problem" : settings.requireConfirmBeforeVerify ? "Continue" : "Save as real problem"
              : status === "rejected" ? "Save as false alarm" : status === "needs_review" ? "Save as not sure" : "Undo decision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One row per [ ] part still open, with its ready answers as buttons, so nothing has to be typed. */
function BlankFiller({ text, onChange }: { text: string; onChange: (t: string) => void }) {
  const blanks = [...new Set(findBlanks(text))];
  if (!blanks.length) return null;
  const chip = "rounded-full border border-border px-2.5 py-0.5 text-xs transition-colors hover:border-primary hover:bg-primary/8 hover:text-primary";
  return (
    <ul className="space-y-1.5 pt-1" aria-label="Parts to fill">
      {blanks.map((b) => (
        <li key={b} className="flex flex-wrap items-center gap-1.5">
          <code className="rounded bg-sev-medium/15 px-1 font-mono text-[11px] text-warning">{b}</code>
          {blankOptions(b).map((o) => (
            <button key={o} type="button" className={chip} onClick={() => onChange(fillBlank(text, b, o))}>
              {o}
            </button>
          ))}
          <button type="button" className={cn(chip, "text-muted-foreground")} onClick={() => onChange(fillBlank(text, b, ""))}>
            Leave out
          </button>
        </li>
      ))}
    </ul>
  );
}
