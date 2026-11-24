import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Tap-to-pick controls for popups, so short choices never need a dropdown or typing.
 * All are radiogroups: one value, keyboard-focusable, labelled.
 */

const chipClass = (on: boolean, color?: string) =>
  cn(
    "rounded-full border px-3 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50",
    on ? (color ? "font-medium" : "border-primary bg-primary/10 font-medium text-primary") : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
  );

export function ChoiceChips<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; color?: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={chipClass(on, o.color)}
            style={on && o.color ? { color: o.color, borderColor: o.color, background: `color-mix(in srgb, ${o.color} 12%, transparent)` } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const plusDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const DATE_SHORTCUTS = [
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "3 months", days: 90 },
];

/** A date with one-tap shortcuts. The picker stays for any other date. */
export function DateShortcuts({ id, value, onChange, disabled }: { id: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="space-y-1.5">
      <div role="radiogroup" aria-label="Quick dates" className="flex flex-wrap gap-1.5">
        {DATE_SHORTCUTS.map((s) => {
          const d = plusDays(s.days);
          return (
            <button key={s.label} type="button" role="radio" aria-checked={value === d} disabled={disabled} onClick={() => onChange(d)} className={chipClass(value === d)}>
              {s.label}
            </button>
          );
        })}
      </div>
      <Input id={id} type="date" disabled={disabled} className="h-8 w-44 text-xs [color-scheme:light] dark:[color-scheme:dark]" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Ready-made sentences under a note box. Clicking one fills the box; the person can still edit it. */
export function NoteChips({ options, value, onPick }: { options: string[]; value: string; onPick: (v: string) => void }) {
  if (!options.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Ready-made notes">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onPick(o)} className={chipClass(value === o)}>
          {o}
        </button>
      ))}
    </div>
  );
}
