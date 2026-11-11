import { NavLink } from "react-router";
import { ChevronsLeft, ChevronsRight, FlaskConical, LayoutGrid, ListChecks } from "lucide-react";
import { useUIStore } from "@/stores/sessionStore";
import { IS_API } from "@/services";
import { useCurrentUser } from "@/hooks";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/misc";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { NAV, SIMPLE_NAV } from "./nav";
import { BrandWordmark } from "./Brand";

function NavContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const user = useCurrentUser();
  const simple = useUIStore((s) => s.simpleMode);
  return (
    <nav aria-label="Main navigation" className="flex-1 space-y-4 overflow-y-auto py-3">
      {(simple ? SIMPLE_NAV : NAV).map((group) => {
        const items = group.items.filter((i) => !i.requires || can(user?.role, i.requires));
        if (!items.length) return null;
        return (
          <div key={group.label}>
            {!collapsed ? (
              <p className="mb-1 pl-7 text-xs font-medium text-muted-foreground">{group.label}</p>
            ) : (
              <div className="mx-auto mb-2 ml-4 h-px w-6 bg-border" aria-hidden />
            )}
            <ul>
              {items.map((item) => {
                const link = (
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        // Google-style drawer item: full-height pill flush to the left edge.
                        "group mx-3 flex h-10 items-center gap-4 rounded-full px-4 text-sm text-sidebar-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                        isActive && "bg-[color-mix(in_srgb,var(--primary)_14%,transparent)] font-medium text-primary hover:bg-[color-mix(in_srgb,var(--primary)_18%,transparent)]",
                        collapsed && "mx-2 justify-center px-0",
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon className={cn("size-[18px] shrink-0 text-muted-foreground", isActive && "text-primary")} aria-hidden />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                        {collapsed && <span className="sr-only">{item.label}</span>}
                      </>
                    )}
                  </NavLink>
                );
                return (
                  <li key={item.to}>
                    {collapsed ? (
                      <Hint label={item.label} side="right">
                        {link}
                      </Hint>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/** Switch between the short workflow menu and every tool. */
function MenuModeSwitch({ collapsed }: { collapsed: boolean }) {
  const simple = useUIStore((s) => s.simpleMode);
  const setSimple = useUIStore((s) => s.setSimpleMode);
  const label = simple ? "Show all tools" : "Simple menu";
  const button = (
    <button
      type="button"
      onClick={() => setSimple(!simple)}
      data-tour="menu-mode"
      className={cn(
        "mx-3 flex h-10 w-[calc(100%-1.5rem)] items-center gap-4 rounded-full px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        collapsed && "mx-2 w-[calc(100%-1rem)] justify-center px-0",
      )}
    >
      {simple ? <LayoutGrid className="size-[18px] shrink-0" aria-hidden /> : <ListChecks className="size-[18px] shrink-0" aria-hidden />}
      {collapsed ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
    </button>
  );
  return <div className="mb-2">{collapsed ? <Hint label={label} side="right">{button}</Hint> : button}</div>;
}

function DemoFooter({ collapsed }: { collapsed: boolean }) {
  // Only demo mode is "synthetic only"; the full app really runs scanners and AI.
  const show = useUIStore((s) => s.showDemoNotices) && !IS_API;
  if (!show) return null;
  if (collapsed)
    return (
      <Hint label="Demo mode — all data is synthetic; no real scans or AI" side="right">
        <div className="mx-auto mb-3 flex size-8 items-center justify-center text-muted-foreground">
          <FlaskConical className="size-4" />
        </div>
      </Hint>
    );
  return (
    <div className="mx-4 mb-3 border-t border-border pt-3 text-xs text-muted-foreground">
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        <FlaskConical className="size-3.5" /> Demo mode
      </p>
      <p className="mt-1 leading-snug">Synthetic data only. No targets are contacted, no scanners run, and no AI model is called.</p>
    </div>
  );
}

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);
  return (
    <aside
      className={cn(
        "sticky top-0 z-30 hidden h-dvh shrink-0 flex-col bg-sidebar transition-[width] duration-200 lg:flex print:hidden",
        collapsed ? "w-[64px]" : "w-64",
      )}
    >
      <div className={cn("flex h-14 items-center px-5", collapsed && "justify-center px-0")}>
        <BrandWordmark collapsed={collapsed} />
      </div>
      <NavContent collapsed={collapsed} />
      <MenuModeSwitch collapsed={collapsed} />
      <DemoFooter collapsed={collapsed} />
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="flex h-10 items-center justify-center gap-2 border-t border-border text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /> Collapse</>}
      </button>
    </aside>
  );
}

export function MobileSidebar() {
  const open = useUIStore((s) => s.mobileNavOpen);
  const setOpen = useUIStore((s) => s.setMobileNav);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="w-72 bg-sidebar p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Main application navigation</SheetDescription>
        <div className="flex h-14 items-center border-b border-border px-4">
          <BrandWordmark />
        </div>
        <NavContent collapsed={false} onNavigate={() => setOpen(false)} />
        <MenuModeSwitch collapsed={false} />
        <DemoFooter collapsed={false} />
      </SheetContent>
    </Sheet>
  );
}
