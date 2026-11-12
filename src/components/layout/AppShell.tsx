import * as React from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useSessionStore } from "@/stores/sessionStore";
import { useCurrentUser } from "@/hooks";
import { useIdleLock } from "@/hooks/useIdleLock";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/shared/states";
import { Sidebar, MobileSidebar } from "./Sidebar";
import { Header } from "./Header";
import { TourHost } from "./TourHost";

export function AppShell() {
  const userId = useSessionStore((s) => s.userId);
  const user = useCurrentUser();
  const location = useLocation();
  const mainRef = React.useRef<HTMLElement>(null);
  useIdleLock();

  React.useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Demo-only route guard. Real authorization must be enforced by the backend.
  if (!userId || !user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  return (
    <div className="flex min-h-dvh bg-background">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-1.5 focus:text-primary-foreground">
        Skip to content
      </a>
      <Sidebar />
      <MobileSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main id="main" ref={mainRef} className="relative isolate min-w-0 flex-1">
          <div className="app-backdrop pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]" aria-hidden />
          <div className="pointer-events-none absolute top-[-220px] left-1/2 -z-10 h-[360px] w-[min(880px,90%)] -translate-x-1/2 rounded-full bg-landing-accent/8 blur-[110px]" aria-hidden />
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
        <TourHost />
      </div>
    </div>
  );
}

export function ContentContainer({ children, className, wide }: { children: React.ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn("mx-auto w-full space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6", wide ? "max-w-[1680px]" : "max-w-[1440px]", className)}>{children}</div>;
}

/**
 * Page title block. Text hierarchy, largest to smallest:
 * page title (28px bold) → description (14px) → section titles in cards (16px bold) → body (14px) → details (12px).
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  meta,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 flex-1 space-y-1.5">
        {eyebrow && <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-[26px] leading-tight font-bold tracking-tight text-balance text-foreground sm:text-[28px]">{title}</h1>
        {description && <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>}
        {meta && <div className="flex flex-wrap items-center gap-2 pt-1">{meta}</div>}
      </div>
      {/* Buttons wrap instead of pushing the page wider than the screen. */}
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2 lg:max-w-[60%] lg:justify-end">{actions}</div>}
    </div>
  );
}
