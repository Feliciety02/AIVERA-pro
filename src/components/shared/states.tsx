import * as React from "react";
import { Link } from "react-router";
import { CircleAlert, Inbox, RefreshCw, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-border text-center", compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12", className)}>
      <div className="flex size-10 items-center justify-center rounded-full border border-border bg-muted/50">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <CircleAlert className="size-6 text-destructive" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="max-w-md text-xs text-muted-foreground">{description}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </div>
  );
}

export function NotFoundState({ entity, backTo, backLabel }: { entity: string; backTo: string; backLabel: string }) {
  return (
    <EmptyState
      icon={CircleAlert}
      title={`${entity} not found`}
      description={`The ${entity.toLowerCase()} you requested does not exist in the current demo data. It may have been removed by "Reset Demo Data".`}
      action={
        <Button asChild variant="outline" size="sm">
          <Link to={backTo}>{backLabel}</Link>
        </Button>
      }
    />
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3">
          {Array.from({ length: cols }).map((__, j) => (
            <Skeleton key={j} className="h-6 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("AEGIS UI error", error, info.componentStack);
  }
  render() {
    if (this.state.error)
      return (
        <div className="p-6">
          <ErrorState
            title="This view failed to render"
            description={`${this.state.error.message}. Your demo data is safe in local storage. If the problem persists, reset demo data from Settings.`}
            onRetry={() => this.setState({ error: null })}
          />
        </div>
      );
    return this.props.children;
  }
}
