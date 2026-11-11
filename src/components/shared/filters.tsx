import * as React from "react";
import { CalendarRange, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SearchInput({ value, onChange, placeholder = "Search…", className, label = "Search" }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; label?: string }) {
  return (
    <div className={cn("relative w-full sm:w-64", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 pr-8 pl-8 text-xs" />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export interface FilterOption {
  value: string;
  label: string;
}

export const ALL = "__all__";

export function FilterSelect({ label, value, onChange, options, className }: { label: string; value: string; onChange: (v: string) => void; options: FilterOption[]; className?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={cn("h-8 w-full text-xs sm:w-auto sm:min-w-36", value !== ALL && "border-primary/40 text-primary", className)}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {label.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FilterBar({ children, onReset, active, className }: { children: React.ReactNode; onReset?: () => void; active?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", className)}>
      {children}
      {onReset && active && (
        <Button variant="ghost" size="sm" onClick={onReset} className="text-xs text-muted-foreground">
          <X /> Reset filters
        </Button>
      )}
    </div>
  );
}

export interface DateRange {
  from: string;
  to: string;
}

export const DATE_PRESETS = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 180 days", days: 180 },
  { label: "Last 365 days", days: 365 },
];

export function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (v: DateRange) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-md border border-input bg-surface/60 px-2 py-1">
        <CalendarRange className="size-3.5 text-muted-foreground" aria-hidden />
        <input type="date" aria-label="From date" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} className="bg-transparent text-xs outline-none [color-scheme:light] dark:[color-scheme:dark]" />
        <span className="text-xs text-muted-foreground">→</span>
        <input type="date" aria-label="To date" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} className="bg-transparent text-xs outline-none [color-scheme:light] dark:[color-scheme:dark]" />
      </div>
      <div className="flex gap-1">
        {DATE_PRESETS.map((p) => (
          <Button
            key={p.days}
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={() => {
              const to = new Date();
              const from = new Date(Date.now() - p.days * 86400_000);
              onChange({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) });
            }}
          >
            {p.days}d
          </Button>
        ))}
      </div>
    </div>
  );
}
