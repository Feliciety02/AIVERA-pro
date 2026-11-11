import * as React from "react";
import { Info, FlaskConical, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/misc";
import { cn, initials } from "@/lib/utils";
import { useUIStore } from "@/stores/sessionStore";
import type { User } from "@/types";

/** Card with a header row (title, description, actions). */
export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  icon: Icon,
  flush,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
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
            {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden />}
            {title}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
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

export function Callout({ tone = "info", title, children, icon, className }: { tone?: "info" | "warning" | "danger" | "demo"; title?: string; children: React.ReactNode; icon?: LucideIcon; className?: string }) {
  // General demo reminders can be hidden in Settings → Appearance. Per-record labels
  // (Simulated / Imported badges) are separate and always shown.
  const showDemo = useUIStore((s) => s.showDemoNotices);
  if (tone === "demo" && !showDemo) return null;
  const Icon = icon ?? (tone === "demo" ? FlaskConical : Info);
  // Google-style inline banners: soft tinted background, coloured icon, regular text.
  const toneClass = {
    info: "bg-primary/8 [&>svg]:text-primary",
    warning: "bg-sev-medium/15 [&>svg]:text-warning",
    danger: "bg-sev-critical/10 [&>svg]:text-sev-critical",
    demo: "bg-muted [&>svg]:text-muted-foreground",
  }[tone];
  return (
    <div role="note" className={cn("flex gap-3 rounded-lg px-4 py-3", toneClass, className)}>
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
    <pre aria-label={label} className={cn("max-h-80 overflow-auto rounded-md bg-muted p-3 font-mono text-[11.5px] leading-relaxed text-foreground/90 whitespace-pre-wrap break-all", className)}>
      {children}
    </pre>
  );
}

export function MiniStat({ label, value, tone, sub }: { label: string; value: React.ReactNode; tone?: string; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-normal tabular-nums", tone?.includes("critical") ? tone : "text-foreground")}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
