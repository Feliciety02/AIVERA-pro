import { useSearchParams } from "react-router";
import { cn } from "@/lib/utils";

export interface ViewOption<T extends string> {
  value: T;
  label: string;
}

/** Reads the current view from ?view=, falling back to the first option. */
export function useView<T extends string>(options: readonly ViewOption<T>[]): T {
  const [params] = useSearchParams();
  const v = params.get("view");
  return (options.find((o) => o.value === v)?.value ?? options[0]!.value) as T;
}

/**
 * Two or three ways to look at one page (e.g. "All findings" / "Risk priority").
 * A segmented control, not tabs, because it switches the whole page body. Kept in the URL
 * so links and the back button land on the same view.
 */
export function ViewSwitch<T extends string>({ options, label }: { options: readonly ViewOption<T>[]; label: string }) {
  const [params, setParams] = useSearchParams();
  const current = useView(options);
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-border bg-card p-0.5">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={current === o.value}
          onClick={() => {
            const next = new URLSearchParams(params);
            if (i === 0) next.delete("view");
            else next.set("view", o.value);
            setParams(next, { replace: true });
          }}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
            current === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
