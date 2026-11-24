import { NavLink, useNavigate } from "react-router";
import { FlaskConical, LayoutGrid, ListChecks, LogOut } from "lucide-react";
import { useUIStore } from "@/stores/sessionStore";
import { authService, IS_API } from "@/services";
import { useCurrentUser } from "@/hooks";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Hint } from "@/components/ui/misc";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { NAV, SIMPLE_NAV, navLabel, visibleNav } from "./nav";
import { BrandWordmark } from "./Brand";
import { useMyWork } from "@/features/myWork";

function NavContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const user = useCurrentUser();
  const simple = useUIStore((s) => s.simpleMode);
  const waiting = useMyWork().total;
  return (
    <nav aria-label="Main navigation" className="flex-1 space-y-4 overflow-y-auto py-3">
      {/* Developers have a short menu already, so the simple/full switch doesn't apply to them. */}
      {visibleNav(simple && user?.role !== "remediation_owner" ? SIMPLE_NAV : NAV, user?.role, (p) => can(user?.role, p)).map((group, groupIndex) => {
        const items = group.items;
        const label = (i: (typeof items)[number]) => navLabel(i, user?.role);
        return (
          <div key={group.label}>
            {!collapsed ? (
              <p className="mb-1 pl-7 text-xs font-medium text-muted-foreground">{group.label}</p>
            ) : (
              // Rail: a centred divider between groups, none above the first one.
              groupIndex > 0 && <div className="mx-auto mb-3 h-px w-8 bg-border" aria-hidden />
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
                        {!collapsed && <span className="truncate">{label(item)}</span>}
                        {item.to === "/dashboard" && waiting > 0 && (
                          <span className={cn("rounded-full bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground", collapsed ? "absolute ml-6 -mt-5" : "ml-auto")} aria-label={`${waiting} waiting on you`}>{waiting}</span>
                        )}
                        {collapsed && <span className="sr-only">{label(item)}</span>}
                      </>
                    )}
                  </NavLink>
                );
                return (
                  <li key={item.to}>
                    {collapsed ? (
                      <Hint label={label(item)} side="right">
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

/** One footer row: icon + label, a tooltip on the collapsed rail. */
function FooterButton({ collapsed, label, icon: Icon, onClick, tour }: { collapsed: boolean; label: string; icon: typeof LogOut; onClick: () => void; tour?: string }) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      data-tour={tour}
      className={cn(
        "mx-3 flex h-10 w-[calc(100%-1.5rem)] items-center gap-4 rounded-full px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        collapsed && "mx-2 w-[calc(100%-1rem)] justify-center px-0",
      )}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden />
      {collapsed ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
    </button>
  );
  return collapsed ? <Hint label={label} side="right">{button}</Hint> : button;
}

/** Menu-mode switch and sign out, under a divider like the one between nav groups. */
function SidebarFooter({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const simple = useUIStore((s) => s.simpleMode);
  const setSimple = useUIStore((s) => s.setSimpleMode);
  const navigate = useNavigate();
  const developer = useCurrentUser()?.role === "remediation_owner";
  return (
    <div className="pb-2">
      <div className={cn("mb-2 h-px bg-border", collapsed ? "mx-auto w-8" : "mx-4")} aria-hidden />
      {!developer && <FooterButton collapsed={collapsed} tour="menu-mode" label={simple ? "Show all tools" : "Simple menu"} icon={simple ? LayoutGrid : ListChecks} onClick={() => setSimple(!simple)} />}
      <FooterButton
        collapsed={collapsed}
        label="Sign out"
        icon={LogOut}
        onClick={async () => {
          onNavigate?.();
          await authService.signOut();
          navigate("/login");
        }}
      />
    </div>
  );
}

function DemoFooter({ collapsed }: { collapsed: boolean }) {
  // Only demo mode is "synthetic only"; the full app really runs scanners and AI.
  const show = useUIStore((s) => s.showDemoNotices) && !IS_API;
  if (!show) return null;
  if (collapsed)
    return (
      <Hint label="Demo mode, all data is synthetic; no real scans or AI" side="right">
        <div className="mx-auto mb-3 flex h-10 w-12 items-center justify-center text-muted-foreground">
          <FlaskConical className="size-4" />
        </div>
      </Hint>
    );
  return (
    <div className="mx-4 mb-3 border-t border-border pt-3 text-xs text-muted-foreground">
      <p className="flex items-center gap-1.5">
        <FlaskConical className="size-3.5" /> Demo mode · sample data only
      </p>
    </div>
  );
}

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  return (
    <aside
      className={cn(
        "sticky top-0 z-30 hidden h-dvh shrink-0 flex-col bg-sidebar transition-[width] duration-200 lg:flex print:hidden",
        collapsed ? "w-[64px]" : "w-64",
      )}
    >
      <div className={cn("flex h-16 items-center px-5", collapsed && "justify-center px-0")}>
        <BrandWordmark collapsed={collapsed} />
      </div>
      <NavContent collapsed={collapsed} />
      <SidebarFooter collapsed={collapsed} />
      <DemoFooter collapsed={collapsed} />
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
        <div className="flex h-16 items-center px-5">
          <BrandWordmark />
        </div>
        <NavContent collapsed={false} onNavigate={() => setOpen(false)} />
        <SidebarFooter collapsed={false} onNavigate={() => setOpen(false)} />
        <DemoFooter collapsed={false} />
      </SheetContent>
    </Sheet>
  );
}
