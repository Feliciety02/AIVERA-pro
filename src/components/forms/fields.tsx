import * as React from "react";
import { Plus, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Field({
  id,
  label,
  required,
  error,
  hint,
  children,
  className,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive" aria-hidden>*</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[11px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormSection({ title, description, children, aside }: { title: string; description?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="grid gap-5 border-b border-border py-6 first:pt-0 last:border-0 lg:grid-cols-[260px_1fr]">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>}
        {aside}
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

/** Editable list of short strings (hosts, paths…). Validates each entry with `validate`. */
export function TagListEditor({
  id,
  values,
  onChange,
  placeholder,
  validate,
  tone = "default",
  mono = true,
}: {
  id: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  validate?: (v: string) => string | null;
  tone?: "default" | "danger" | "primary";
  mono?: boolean;
}) {
  const [draft, setDraft] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (values.includes(v)) return setErr("Already in the list.");
    const e = validate?.(v) ?? null;
    if (e) return setErr(e);
    onChange([...values, v]);
    setDraft("");
    setErr(null);
  };
  const chip = {
    default: "border-border bg-muted/50",
    danger: "border-sev-critical/30 bg-sev-critical/8 text-sev-critical",
    primary: "border-primary/30 bg-primary/8 text-primary",
  }[tone];
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          aria-invalid={!!err}
          className={cn(mono && "font-mono text-xs")}
        />
        <Button type="button" variant="outline" size="icon" onClick={add} aria-label="Add entry">
          <Plus />
        </Button>
      </div>
      {err && <p className="text-[11px] text-destructive">{err}</p>}
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <li key={v} className={cn("inline-flex items-center gap-1 rounded-md border py-0.5 pr-1 pl-2 text-xs", mono && "font-mono text-[11px]", chip)}>
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="rounded p-0.5 opacity-70 hover:bg-accent hover:opacity-100">
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ChoiceCard({ checked, onToggle, title, description, icon, disabled, badge }: { checked: boolean; onToggle: () => void; title: string; description?: string; icon?: React.ReactNode; disabled?: boolean; badge?: React.ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-primary/50 bg-primary/6" : "border-border hover:border-ring/40 hover:bg-accent/30",
      )}
    >
      <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border", checked ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
        {checked && (
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
            <path d="M2.5 6.2l2.2 2.2 4.8-4.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {title}
          {badge}
        </span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{description}</span>}
      </span>
    </button>
  );
}

export function Steps({ steps, current, onSelect }: { steps: string[]; current: number; onSelect?: (i: number) => void }) {
  return (
    <ol className="flex gap-1 overflow-x-auto pb-1" aria-label="Progress">
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={s} className="min-w-28 flex-1">
            <button
              type="button"
              disabled={!onSelect || i > current}
              onClick={() => onSelect?.(i)}
              aria-current={state === "current" ? "step" : undefined}
              className="group w-full text-left disabled:cursor-default"
            >
              <span className={cn("block h-1 rounded-full", state === "todo" ? "bg-muted" : "bg-primary", state === "current" && "bg-primary/70")} />
              <span className={cn("mt-2 flex items-center gap-1.5 text-[11px]", state === "todo" ? "text-muted-foreground" : "text-foreground")}>
                <span className={cn("flex size-4 items-center justify-center rounded-full border text-[9px] font-bold", state === "done" ? "border-primary bg-primary text-primary-foreground" : state === "current" ? "border-primary text-primary" : "border-border")}>
                  {i + 1}
                </span>
                <span className="truncate font-medium">{s}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
