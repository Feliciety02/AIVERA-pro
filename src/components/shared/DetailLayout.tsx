import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The layout every detail page shares: what you read on the left, what you do on the right.
 * The side column stays in view while the main column scrolls, so the next action is always one
 * click away. On phones the side column comes first, then the content.
 */
export function DetailLayout({ main, aside }: { main: React.ReactNode; aside: React.ReactNode }) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px] print:block">
      <aside className="space-y-4 lg:sticky lg:top-20 lg:order-2 print:hidden">{aside}</aside>
      <div className="min-w-0 space-y-4 lg:order-1">{main}</div>
    </div>
  );
}

/** A card in the side column. `tone="primary"` marks the one panel where the decision happens. */
export function SidePanel({ title, children, footer, tone, className }: { title?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; tone?: "primary"; className?: string }) {
  return (
    <section data-slot="card" className={cn("overflow-hidden rounded-2xl border bg-card", tone === "primary" ? "border-primary/40 shadow-sm" : "border-border", className)}>
      {title && <h2 className="px-5 pt-4 text-sm font-semibold">{title}</h2>}
      <div className="space-y-3 px-5 py-4">{children}</div>
      {footer && <div className="border-t border-border bg-muted/30 px-5 py-2.5 text-xs">{footer}</div>}
    </section>
  );
}

/** Label/value rows: the properties of a record, one per line, easy to scan. */
export function FactList({ items }: { items: ({ label: string; value: React.ReactNode } | false | null | undefined)[] }) {
  return (
    <dl className="divide-y divide-border text-sm">
      {items.filter(Boolean).map((it) => {
        const { label, value } = it as { label: string; value: React.ReactNode };
        return (
          <div key={label} className="flex items-start justify-between gap-4 py-2 first:pt-0 last:pb-0">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 text-right break-words">{value}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/** A plain content card for the main column, with an optional count and right-side action. */
export function ContentCard({ title, count, action, children, className }: { title: string; count?: number; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section data-slot="card" className={cn("rounded-2xl border border-border bg-card", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold">
          {title}
          {count !== undefined && <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">{count}</span>}
        </h2>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Collapsed section for secondary information. */
export function Collapsible({ title, hint, children, defaultOpen }: { title: string; hint?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-2xl border border-border bg-card" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
          {hint}
          <svg viewBox="0 0 16 16" className="size-4 transition-transform group-open:rotate-180" aria-hidden><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </summary>
      <div className="border-t border-border p-5">{children}</div>
    </details>
  );
}
