import * as React from "react";
import { Info, FlaskConical, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { cn, initials } from "@/lib/utils";
import { useUIStore } from "@/stores/sessionStore";
import type { User } from "@/types";

/**
 * The small tinted square that holds an icon or a letter, used for section headings, list rows and
 * empty states. Size: sm for card titles, md for list rows, lg for page-level cards.
 * The colour defaults to primary; pass any theme colour (e.g. "var(--success)").
 */
export function IconChip({ icon: Icon, children, size = "md", color = "var(--primary)", className }: { icon?: LucideIcon; children?: React.ReactNode; size?: "sm" | "md" | "lg"; color?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center font-semibold",
        { sm: "size-7 rounded-lg text-xs [&>svg]:size-4", md: "size-9 rounded-xl text-sm [&>svg]:size-4", lg: "size-12 rounded-full text-base [&>svg]:size-6" }[size],
        className,
      )}
      style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
    >
      {Icon ? <Icon /> : children}
    </span>
  );
}

/** Card with a header row (title, actions). */
export function SectionCard({
  title,
  actions,
  children,
  className,
  contentClassName,
  icon: Icon,
  flush,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  icon?: LucideIcon;
  flush?: boolean;
}) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className={cn(flush && "border-b border-border pb-3")}>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            {Icon && <IconChip icon={Icon} size="sm" />}
            {title}
          </CardTitle>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </CardHeader>
      <CardContent className={cn("flex-1", flush && "px-0 pb-0", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

export function KeyValue({ label, children, className, mono }: { label: string; children: React.ReactNode; className?: string; mono?: boolean }) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("break-words text-sm", mono && "font-mono text-xs")}>{children}</dd>
    </div>
  );
}

export function UserChip({ user, className, showTitle }: { user?: User; className?: string; showTitle?: boolean }) {
  if (!user) return <span className="text-muted-foreground">Unassigned</span>;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <Avatar initials={initials(user.name)} seed={user.name.length} className="size-6 text-[10px]" />
      <span className="min-w-0">
        <span className="block truncate text-sm">{user.name}</span>
        {showTitle && <span className="block truncate text-[11px] text-muted-foreground">{user.title}</span>}
      </span>
    </span>
  );
}

export function Callout({ tone = "info", title, children, icon, className }: { tone?: "info" | "success" | "warning" | "danger" | "demo"; title?: string; children: React.ReactNode; icon?: LucideIcon; className?: string }) {
  // General demo reminders can be hidden in Settings → Help. Per-record labels
  // (Simulated / Imported badges) are separate and always shown.
  const showDemo = useUIStore((s) => s.showDemoNotices);
  if (tone === "demo" && !showDemo) return null;
  const Icon = icon ?? (tone === "demo" ? FlaskConical : Info);
  // Google-style inline banners: soft tinted background, coloured icon, regular text.
  const toneClass = {
    info: "bg-primary/8 [&>svg]:text-primary",
    success: "bg-success/10 [&>svg]:text-success",
    warning: "bg-sev-medium/15 [&>svg]:text-warning",
    danger: "bg-sev-critical/10 [&>svg]:text-sev-critical",
    demo: "bg-muted [&>svg]:text-muted-foreground",
  }[tone];
  return (
    <div role="note" className={cn("flex gap-3 rounded-xl px-4 py-3", toneClass, className)}>
      <Icon className="mt-0.5 size-[18px] shrink-0" aria-hidden />
      <div className="min-w-0 space-y-0.5 text-sm leading-relaxed">
        {title && <p className="font-medium text-foreground">{title}</p>}
        <div className="text-foreground/80">{children}</div>
      </div>
    </div>
  );
}

export function CodeBlock({ children, className, label }: { children: string; className?: string; label?: string }) {
  return (
    <pre aria-label={label} className={cn("max-h-80 overflow-auto rounded-xl bg-muted p-3 font-mono text-[11.5px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-all", className)}>
      {children}
    </pre>
  );
}

export function MiniStat({ label, value, tone, sub }: { label: string; value: React.ReactNode; tone?: string; sub?: React.ReactNode }) {
  // A small dot carries the colour; the number stays dark so a row of stats reads calmly.
  const color = tone?.startsWith("text-") && tone !== "text-foreground" ? `var(--${tone.slice(5)})` : undefined;
  return (
    <div className="h-full rounded-2xl border border-border bg-card px-4 py-3.5">
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        {color && <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />}
        <span className="truncate">{label}</span>
      </p>
      <p className={cn("mt-1.5 text-2xl font-semibold tracking-tight tabular-nums", tone?.includes("critical") && "text-sev-critical")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
