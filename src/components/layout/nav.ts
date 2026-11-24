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

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** When set, the item is hidden for roles lacking this permission (UI demo only). */
  requires?: Permission;
}

export interface NavGroup {
  label: string;
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
      { label: "Analytics", to: "/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "1 · Set up",
    items: [
      { label: "Projects", to: "/projects", icon: FolderKanban },
      { label: "Websites", to: "/targets", icon: Target },
    ],
  },
  {
    label: "2 · Test",
    items: [
      { label: "Scans", to: "/scans", icon: ScanLine },
      { label: "Checklists", to: "/assessments", icon: ClipboardCheck },
    ],
  },
  {
    label: "3 · Review & fix",
    items: [
      { label: "Findings", to: "/findings", icon: ShieldAlert },
      { label: "Fixes", to: "/remediation", icon: Wrench },
      { label: "Reports", to: "/reports", icon: FileText },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Activity log", to: "/activity", icon: Activity, requires: "view_activity" },
      { label: "Users", to: "/users", icon: Users, requires: "manage_users" },
      { label: "Integrations", to: "/integrations", icon: Plug },
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
      { label: "Websites", to: "/targets", icon: Target },
      { label: "Scans", to: "/scans", icon: ScanLine },
      { label: "Findings", to: "/findings", icon: ShieldAlert },
      { label: "Fixes", to: "/remediation", icon: Wrench },
      { label: "Reports", to: "/reports", icon: FileText },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Users", to: "/users", icon: Users, requires: "manage_users" },
      { label: "Settings", to: "/settings", icon: Settings },
    ],
  },
];
