import { CATEGORIES, ALLOWED_ACTIVITY_OPTIONS } from "@/lib/constants";
import { ToneBadge } from "@/components/security/badges";
import type { TargetScope } from "@/types";
import { ChoiceCard, Field, TagListEditor } from "./fields";

const HOST_RE = /^(localhost|(\*\.)?([a-z0-9-]+\.)+[a-z0-9-]{2,}|\d{1,3}(\.\d{1,3}){3})(:\d{1,5})?$/i;

export const validateHost = (v: string) => (HOST_RE.test(v) ? null : "Enter a hostname, localhost or IPv4 address, with an optional port (e.g. 127.0.0.1:8000).");
export const validatePath = (v: string) => (v.startsWith("/") ? null : "Paths must start with “/”. Use * as a wildcard, e.g. /api/*");

/** Controlled editor for a target's assessment scope. Pure UI, it never resolves or contacts hosts. */
export function ScopeEditor({ value, onChange, errors }: { value: TargetScope; onChange: (v: TargetScope) => void; errors?: Partial<Record<keyof TargetScope, string>> }) {
  const set = <K extends keyof TargetScope>(k: K, v: TargetScope[K]) => onChange({ ...value, [k]: v });
  const toggle = <K extends "allowedCategories" | "allowedActivities">(k: K, item: TargetScope[K][number]) => {
    const list = value[k] as string[];
    set(k, (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]) as TargetScope[K]);
  };
  return (
    <div className="grid gap-5">
      <Field id="scope-hosts" label="In-scope hosts" required error={errors?.inScopeHosts} hint="Only these hosts may ever be tested. Press Enter to add.">
        <TagListEditor id="scope-hosts" values={value.inScopeHosts} onChange={(v) => set("inScopeHosts", v)} placeholder="127.0.0.1:8000" validate={validateHost} tone="primary" />
      </Field>
      <div className="grid gap-5 md:grid-cols-2">
        <Field id="scope-allowed" label="Allowed URL paths" required error={errors?.allowedPaths} hint="Paths testing may cover, e.g. / or /api/*">
          <TagListEditor id="scope-allowed" values={value.allowedPaths} onChange={(v) => set("allowedPaths", v)} placeholder="/admin/*" validate={validatePath} tone="primary" />
        </Field>
        <Field id="scope-excluded" label="Excluded paths" hint="Never tested, even if inside an allowed path.">
          <TagListEditor id="scope-excluded" values={value.excludedPaths} onChange={(v) => set("excludedPaths", v)} placeholder="/logout" validate={validatePath} tone="danger" />
        </Field>
      </div>
      <div className="space-y-2" data-guide="scope-categories">
        <p className="text-xs font-medium">
          Allowed assessment categories<span className="text-destructive">*</span>
        </p>
        {errors?.allowedCategories && <p className="text-[11px] text-destructive">{errors.allowedCategories}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <ChoiceCard key={c.id} checked={value.allowedCategories.includes(c.id)} onToggle={() => toggle("allowedCategories", c.id)} title={c.name} description={c.scope} badge={!c.primary ? <ToneBadge tone="muted">Extended</ToneBadge> : undefined} />
          ))}
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-medium">Allowed activities</p>
          <div className="space-y-1.5">
            {ALLOWED_ACTIVITY_OPTIONS.map((a) => (
              <ChoiceCard key={a} checked={value.allowedActivities.includes(a)} onToggle={() => toggle("allowedActivities", a)} title={a} />
            ))}
          </div>
        </div>
        <Field id="scope-restricted" label="Restricted activities" hint="Explicitly prohibited by the rules of engagement.">
          <TagListEditor id="scope-restricted" values={value.restrictedActivities} onChange={(v) => set("restrictedActivities", v)} placeholder="e.g. Denial-of-service testing" tone="danger" mono={false} />
        </Field>
      </div>
    </div>
  );
}
