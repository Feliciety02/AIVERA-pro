import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Bell, CheckCheck, ChevronRight, CircleHelp, FlaskConical, LogOut, Menu, Moon, Search, Settings, Sun, Trash2, UserRoundCog, Users } from "lucide-react";
import { tourForPath } from "@/features/tours";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger, Hint, Avatar } from "@/components/ui/misc";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useDataStore } from "@/stores/dataStore";
import { useUIStore } from "@/stores/sessionStore";
import { useCurrentUser } from "@/hooks";
import { cn, initials } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import { ROLE_META } from "@/lib/constants";
import { authService, notificationService, settingsService } from "@/services";
import { ROUTE_LABELS } from "./nav";
import { GlobalSearch } from "./GlobalSearch";

function useEntityLabel(segment: string): string | undefined {
  return useDataStore((s) => {
    if (segment.startsWith("prj-")) return s.projects.find((p) => p.id === segment)?.code;
    if (segment.startsWith("tgt-")) return s.targets.find((t) => t.id === segment)?.name;
    if (segment.startsWith("scn-")) return s.scans.find((t) => t.id === segment)?.code;
    if (segment.startsWith("fnd-")) return s.findings.find((t) => t.id === segment)?.code;
    if (segment.startsWith("rpt-")) return s.reports.find((t) => t.id === segment)?.code;
    return undefined;
  });
}

function Crumb({ segment, to, last }: { segment: string; to: string; last: boolean }) {
  const entity = useEntityLabel(segment);
  const label = entity ?? ROUTE_LABELS[segment] ?? segment.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <li className="flex min-w-0 items-center gap-1.5">
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
      {last ? (
        <span aria-current="page" className="truncate font-medium text-foreground">
          {label}
        </span>
      ) : (
        <Link to={to} className="truncate text-muted-foreground hover:text-foreground">
          {label}
        </Link>
      )}
    </li>
  );
}

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);
  return (
    <nav aria-label="Breadcrumb" className="hidden max-w-[30%] min-w-0 shrink-0 md:block">
      <ol className="flex min-w-0 items-center gap-1.5 text-xs">
        <li>
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
            AEGIS
          </Link>
        </li>
        {segments.map((seg, i) => (
          <Crumb key={seg + i} segment={seg} to={"/" + segments.slice(0, i + 1).join("/")} last={i === segments.length - 1} />
        ))}
      </ol>
    </nav>
  );
}

export function ThemeToggle() {
  const theme = useDataStore((s) => s.settings.appearance.theme);
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return (
    <Hint label={isDark ? "Switch to light theme" : "Switch to dark theme"}>
      <Button variant="ghost" size="icon-sm" aria-label="Toggle theme" onClick={() => settingsService.update("appearance", { theme: isDark ? "light" : "dark" })}>
        {isDark ? <Sun /> : <Moon />}
      </Button>
    </Hint>
  );
}

const toneDot: Record<string, string> = { info: "bg-sev-low", success: "bg-primary", warning: "bg-sev-medium", critical: "bg-sev-critical" };

export function NotificationPanel() {
  const navigate = useNavigate();
  const notifications = useDataStore((s) => s.notifications);
  const { markRead, markAllRead: markAll, clear } = notificationService;
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Notifications (${unread} unread)`} className="relative">
          <Bell />
          {unread > 0 && <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-sev-critical text-[9px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-[11px] text-muted-foreground">Demo notifications generated from in-app activity</p>
          </div>
          <div className="flex gap-1">
            <Hint label="Mark all as read">
              <Button variant="ghost" size="icon-sm" aria-label="Mark all as read" onClick={markAll} disabled={!unread}>
                <CheckCheck />
              </Button>
            </Hint>
            <Hint label="Clear all">
              <Button variant="ghost" size="icon-sm" aria-label="Clear notifications" onClick={clear} disabled={!notifications.length}>
                <Trash2 />
              </Button>
            </Hint>
          </div>
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {notifications.length === 0 && <li className="px-4 py-10 text-center text-xs text-muted-foreground">You're all caught up.</li>}
          {notifications.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => {
                  markRead(n.id);
                  if (n.link) navigate(n.link);
                }}
                className={cn("flex w-full gap-3 border-b border-border/60 px-4 py-3 text-left hover:bg-accent/50", !n.read && "bg-primary/[0.03]")}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", toneDot[n.tone], n.read && "opacity-30")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-xs", !n.read && "font-semibold")}>{n.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{n.message}</span>
                  <span className="mt-1 block text-[10px] text-muted-foreground/70">{formatRelative(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function UserMenu() {
  const user = useCurrentUser();
  const signOut = authService.signOut;
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none" aria-label="Open user menu">
          <Avatar initials={initials(user.name)} seed={user.name.length} />
          <span className="hidden text-left leading-tight xl:block">
            <span className="block text-xs font-medium">{user.name}</span>
            <span className="block text-[10px] text-muted-foreground">{ROLE_META[user.role].label}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium text-foreground">{user.name}</p>
          <p className="text-[11px] text-muted-foreground">{user.email}</p>
          <p className="mt-1 text-[10px] text-sev-medium">Demo account — not real authentication</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate("/settings?tab=account")}>
          <UserRoundCog /> Account preferences
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/settings")}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate("/login")}>
          <Users /> Switch demo account
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={async () => {
            await signOut();
            navigate("/login");
          }}
        >
          <LogOut /> Sign out of demo
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Header() {
  const setMobileNav = useUIStore((s) => s.setMobileNav);
  const setCommandOpen = useUIStore((s) => s.setCommandOpen);

  const showDemoNotices = useUIStore((s) => s.showDemoNotices);
  const startTour = useUIStore((s) => s.startTour);
  const location = useLocation();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCommandOpen]);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-surface px-4 print:hidden lg:px-6">
      <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileNav(true)}>
        <Menu />
      </Button>
      <Breadcrumbs />
      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="mx-auto flex h-10 w-full max-w-xl items-center gap-3 rounded-lg bg-muted px-4 text-sm text-muted-foreground transition-colors hover:bg-accent focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label="Search (Ctrl+K)"
      >
        <Search className="size-4" />
        <span className="hidden truncate sm:inline">Search projects, targets, findings</span>
        <kbd className="ml-auto hidden rounded border border-border px-1.5 py-px font-sans text-[11px] sm:inline">Ctrl K</kbd>
      </button>
      <div className="flex items-center gap-1">
        {showDemoNotices && (
          <Hint label="Demo mode: synthetic data, simulated scans, sample AI analyses. Hide this in Settings → Appearance.">
            <span tabIndex={0} className="mr-1 hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground lg:inline-flex">
              <FlaskConical className="size-3.5" /> Demo
            </span>
          </Hint>
        )}
        <Hint label="Replay this page's tutorial">
          <Button variant="ghost" size="icon-sm" aria-label="Replay page tutorial" onClick={() => startTour(tourForPath(location.pathname)?.key ?? "welcome")}>
            <CircleHelp />
          </Button>
        </Hint>
        <ThemeToggle />
        <NotificationPanel />
        <UserMenu />
      </div>
      <GlobalSearch />
    </header>
  );
}
