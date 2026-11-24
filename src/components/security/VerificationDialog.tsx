import * as React from "react";
import { CircleCheck, Loader2, ShieldAlert, ShieldCheck, ShieldQuestion, Sparkles, Timer } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { fillAllBlanks, findBlanks, suggestVerification } from "@/features/verificationSuggestions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/misc";
import { useDataStore } from "@/stores/dataStore";
import { VERIFICATION_STATUS } from "@/lib/constants";
import { verificationService } from "@/services";
import type { VerificationStatus, VulnerabilityFinding } from "@/types";

const ICONS: Record<VerificationStatus, typeof CircleCheck> = { confirmed: ShieldAlert, rejected: ShieldCheck, needs_review: ShieldQuestion, pending: Timer };
const TITLES: Record<VerificationStatus, string> = { confirmed: "Confirm vulnerability", rejected: "Mark as false positive", needs_review: "Flag for further review", pending: "Withdraw decision" };
const METHODS = ["Browser", "curl", "Source review", "Tool output only"];
const chip = (on: boolean) =>
  cn("rounded-full border px-3 py-1 text-xs transition-colors", on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground");

/**
 * Human verification form. Confirming requires explicit evidence review and a
 * second confirmation step, an AI suggestion can never confirm a finding.
 */
export function VerificationDialog({ finding, status, open, onOpenChange, onSaved }: { finding: VulnerabilityFinding; status: VerificationStatus | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved?: (status: VerificationStatus) => void }) {
  const settings = useDataStore((s) => s.settings.security);
  const [notes, setNotes] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [reviewed, setReviewed] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [method, setMethod] = React.useState("");
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
      setNotes(fillAllBlanks(suggestion?.notes ?? ""));
      setReason(fillAllBlanks(suggestion?.reason ?? ""));
      setReviewed(false);
      setEditing(false);
      setMethod("");
      setStage("form");
      setErr(null);
    }
  }, [open, status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!status) return null;
  const Icon = ICONS[status];
  const isConfirm = status === "confirmed";
  const needsEvidence = settings.requireEvidenceReview && (status === "confirmed" || status === "rejected");

  // The person's own answer ("How did you check?") is added as one sentence.
  const composedNotes = [notes.trim(), method ? `Checked with ${method.toLowerCase()}.` : ""].filter(Boolean).join(" ");
  // Reason choices: only complete sentences, at most four.
  const reasons = [...new Set([fillAllBlanks(suggestion?.reason ?? ""), ...(suggestion?.reasonChips ?? []).filter((c) => !findBlanks(c).length)])].filter((c) => c.length >= 5).slice(0, 4);
  const validate = () => {
    if (findBlanks(composedNotes).length || findBlanks(reason).length) return "Remove the [ ] parts before saving.";
    if (reason.trim().length < 5) return "Provide a decision reason (min. 5 characters).";
    if (status !== "pending" && composedNotes.length < 10) return "Add a short note (min. 10 characters).";
    if (needsEvidence && !reviewed) return "Tick that you checked the evidence.";
    return null;
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await verificationService.record({ findingId: finding.id, toStatus: status, notes: composedNotes, decisionReason: reason.trim(), evidenceReviewed: reviewed });
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
            <Icon className="size-4" /> {TITLES[status]}
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono">{finding.code}</span> · {finding.title}
          </DialogDescription>
        </DialogHeader>
        {stage === "form" ? (
          <div className="space-y-4">
            {finding.dataOrigin === "simulated" && isConfirm && <p className="text-xs text-warning">Practice data: this only records a demo decision.</p>}

            {/* Notes write themselves from the finding and its evidence. Shown as a summary; edit only if needed. */}
            <section className="rounded-xl bg-muted/50 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Sparkles className="size-3.5 text-primary" aria-hidden /> Notes, filled in automatically
                </p>
                <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setEditing((v) => !v)}>
                  {editing ? "Done" : "Edit"}
                </button>
              </div>
              {editing ? (
                <div className="mt-2 space-y-2">
                  <Textarea id="v-notes" aria-label="Verification notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
                  <Textarea id="v-reason" aria-label="Decision reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
              ) : (
                <p className="mt-1.5 text-sm leading-relaxed">{composedNotes || <span className="text-muted-foreground">No notes yet.</span>}</p>
              )}
            </section>

            {!editing && status !== "pending" && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium">
                  How did you check? <span className="font-normal text-muted-foreground">Optional</span>
                </p>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="How did you check?">
                  {METHODS.map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(method === m ? "" : m)} className={chip(method === m)}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!editing && suggestion && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium">Reason</p>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Reason">
                  {reasons.map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={reason === c} onClick={() => setReason(c)} className={chip(reason === c)}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(needsEvidence || status === "needs_review") && (
              <label htmlFor="v-reviewed" className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3">
                <Checkbox id="v-reviewed" checked={reviewed} onCheckedChange={(v) => setReviewed(v === true)} className="mt-0.5" />
                <span className="text-sm leading-snug">I checked the evidence{needsEvidence ? "" : " (optional)"}</span>
              </label>
            )}
            {err && <p role="alert" className="text-xs text-destructive">{err}</p>}
          </div>
        ) : (
          <p className="rounded-xl bg-destructive/8 px-4 py-3 text-sm">
            <span className="font-semibold">{finding.code} will count as a confirmed problem</span> and can go into reports. Continue?
          </p>
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
              ? stage === "confirm" || !settings.requireConfirmBeforeVerify ? "Confirm vulnerability" : "Continue"
              : status === "rejected" ? "Record false positive" : status === "needs_review" ? "Flag for review" : "Withdraw decision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
