import {
  Activity,
  BarChart3,
  ClipboardCheck,
  FileText,
  FolderKanban,
  Gauge,
  Plug,
  ScanLine,
  Settings,
  ShieldAlert,
  Target,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/lib/permissions";
import type { UserRole } from "@/types";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** When set, the item is hidden for roles lacking this permission (UI demo only). */
  requires?: Permission;
  /** When set, only these roles see the item. Pages outside a role's menu are also closed to it (see router). */
  roles?: UserRole[];
  /** A different label for some roles, e.g. "My fixes" for a website owner. */
  labelFor?: Partial<Record<UserRole, string>>;
}

/** The two roles that do security work. Website owners see their websites, their fixes and finished reports. */
export const TEAM: UserRole[] = ["administrator", "assessor"];
export const ADMIN: UserRole[] = ["administrator"];

export function navLabel(item: NavItem, role?: UserRole) {
  return (role && item.labelFor?.[role]) ?? item.label;
}

export function visibleNav(groups: NavGroup[], role?: UserRole, allows?: (p: Permission) => boolean): NavGroup[] {
  return groups
    .map((g) => ({ ...g, label: (role && g.labelFor?.[role]) ?? g.label, items: g.items.filter((i) => (!i.roles || (role && i.roles.includes(role))) && (!i.requires || !!allows?.(i.requires))) }))
    .filter((g) => g.items.length);
}

export interface NavGroup {
  label: string;
  /** A different group name for some roles. */
  labelFor?: Partial<Record<UserRole, string>>;
  items: NavItem[];
}

/**
 * Full menu: every tool, grouped in the order an assessment happens. Names match Simple mode
 * and the page titles, so a page is called the same thing everywhere.
 */
export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Home", to: "/dashboard", icon: Gauge },
      { label: "Analytics", to: "/analytics", icon: BarChart3, roles: TEAM },
    ],
  },
  {
    label: "Setup",
    items: [
      { label: "Projects", to: "/projects", icon: FolderKanban, roles: TEAM },
      { label: "Websites", to: "/targets", icon: Target, labelFor: { remediation_owner: "My websites" } },
    ],
  },
  {
    label: "Testing",
    items: [
      { label: "Scans", to: "/scans", icon: ScanLine, roles: TEAM },
      { label: "Checklists", to: "/assessments", icon: ClipboardCheck, roles: TEAM },
    ],
  },
  {
    label: "Review",
    items: [
      { label: "Findings", to: "/findings", icon: ShieldAlert, roles: TEAM },
      { label: "Fixes", to: "/remediation", icon: Wrench, labelFor: { remediation_owner: "My fixes" } },
      { label: "Reports", to: "/reports", icon: FileText },
    ],
  },
  {
    label: "Admin",
    labelFor: { remediation_owner: "Account" },
    items: [
      { label: "Activity log", to: "/activity", icon: Activity, roles: ADMIN },
      { label: "Users", to: "/users", icon: Users, roles: ADMIN },
      { label: "Integrations", to: "/integrations", icon: Plug, roles: ADMIN },
      { label: "Settings", to: "/settings", icon: Settings },
    ],
  },
];

/**
 * Simple mode menu: the five assessment steps in order. Every other page is still reachable
 * (links, search, "Show all tools"), it just isn't in the way. "My work" lives on Home.
 */
export const SIMPLE_NAV: NavGroup[] = [
  {
    label: "Your assessment",
    items: [
      { label: "Home", to: "/dashboard", icon: Gauge },
      { label: "Projects", to: "/projects", icon: FolderKanban, roles: TEAM },
      { label: "Websites", to: "/targets", icon: Target, labelFor: { remediation_owner: "My websites" } },
      { label: "Scans", to: "/scans", icon: ScanLine, roles: TEAM },
      { label: "Findings", to: "/findings", icon: ShieldAlert, roles: TEAM },
      { label: "Fixes", to: "/remediation", icon: Wrench, labelFor: { remediation_owner: "My fixes" } },
      { label: "Reports", to: "/reports", icon: FileText },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Users", to: "/users", icon: Users, roles: ADMIN },
      { label: "Settings", to: "/settings", icon: Settings },
    ],
  },
];
