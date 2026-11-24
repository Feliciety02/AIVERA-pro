import { Copy, FileCode2, FileInput, FileOutput, NotebookPen, ListTree } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox, Hint } from "@/components/ui/misc";
import { CodeBlock } from "@/components/shared/display";
import { EmptyState } from "@/components/shared/states";
import { useDataStore } from "@/stores/dataStore";
import { useLookups } from "@/hooks";
import { copyToClipboard, cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { findingService } from "@/services";
import type { Evidence, EvidenceType } from "@/types";

const TYPE_META: Record<EvidenceType, { label: string; icon: typeof FileCode2 }> = {
  http_request: { label: "HTTP request", icon: FileOutput },
  http_response: { label: "HTTP response", icon: FileInput },
  tool_output: { label: "Tool output", icon: FileCode2 },
  header_dump: { label: "Headers", icon: ListTree },
  manual_note: { label: "Manual note", icon: NotebookPen },
};

function mask(content: string): string {
  return content
    .replace(/(Authorization:\s*)(.+)/gi, "$1••••••••")
    .replace(/(Cookie:\s*|Set-Cookie:\s*[^=]+=)([^;\n]+)/gi, "$1••••••••")
    .replace(/(\$db_(?:user|pass)\s*=\s*)'[^']*'/gi, "$1'••••'");
}

export function EvidenceViewer({ evidence, canReview }: { evidence: Evidence[]; canReview: boolean }) {
  const maskOn = useDataStore((s) => s.settings.security.maskSensitiveEvidence);
  const lookups = useLookups();
  if (!evidence.length) return <EmptyState compact title="No technical evidence attached" description="Findings without evidence cannot be confirmed with confidence." />;
  return (
    <ul className="space-y-3">
      {evidence.map((e) => {
        const meta = TYPE_META[e.type];
        const content = maskOn ? mask(e.content) : e.content;
        return (
          <li key={e.id} id={e.id} className={cn("rounded-xl border p-3.5 scroll-mt-20", e.reviewed ? "border-primary/25" : "border-border")}>
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <meta.icon className="size-4 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">{e.title}</p>
              <span className="ml-auto flex items-center gap-2">
                <Hint label="Copy evidence">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Copy evidence"
                    onClick={async () => {
                      const ok = await copyToClipboard(e.content);
                      if (ok) toast.success("Evidence copied");
                      else toast.error("Clipboard unavailable");
                    }}
                  >
                    <Copy />
                  </Button>
                </Hint>
                <label className={cn("flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs", e.reviewed ? "border-primary/40 bg-primary/8 text-primary" : "border-border text-muted-foreground", canReview && "cursor-pointer hover:border-primary/40")}>
                  <Checkbox checked={e.reviewed} disabled={!canReview} onCheckedChange={(v) => { findingService.markEvidenceReviewed(e.id, v === true); toast.success(v ? "Evidence marked reviewed" : "Evidence marked unreviewed"); }} />
                  I reviewed this
                </label>
              </span>
            </div>
            <CodeBlock label={e.title}>{content}</CodeBlock>
            <p className="mt-1.5 text-[10.5px] text-muted-foreground">
              {meta.label} · captured {formatDateTime(e.capturedAt)}
              {e.reviewedBy && ` · reviewed by ${lookups.users[e.reviewedBy]?.name ?? e.reviewedBy}`}
              {maskOn && " · sensitive values masked"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
