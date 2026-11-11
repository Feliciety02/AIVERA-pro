import {
  Activity,
  BarChart3,
  Bot,
  ClipboardCheck,
  FileText,
  FolderKanban,
  Gauge,
  Plug,
  Radar,
  ScanLine,
  Settings,
  ShieldAlert,
  Target,
  TriangleAlert,
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

export const NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", to: "/dashboard", icon: Gauge },
      { label: "Security Analytics", to: "/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Security Operations",
    items: [
      { label: "Projects", to: "/projects", icon: FolderKanban },
      { label: "Target Management", to: "/targets", icon: Target },
      { label: "Reconnaissance", to: "/reconnaissance", icon: Radar },
      { label: "Scan Center", to: "/scans", icon: ScanLine },
      { label: "Vulnerability Assessment", to: "/assessments", icon: ClipboardCheck },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "AI Security Analyst", to: "/ai-analyst", icon: Bot, requires: "use_ai" },
      { label: "Findings & Evidence", to: "/findings", icon: ShieldAlert },
      { label: "Risk Management", to: "/risks", icon: TriangleAlert },
    ],
  },
  {
    label: "Management",
    items: [
      { label: "Remediation Tracking", to: "/remediation", icon: Wrench },
      { label: "Reports", to: "/reports", icon: FileText },
      { label: "Activity Logs", to: "/activity", icon: Activity, requires: "view_activity" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "User Management", to: "/users", icon: Users, requires: "manage_users" },
      { label: "Integrations", to: "/integrations", icon: Plug },
      { label: "Settings", to: "/settings", icon: Settings },
    ],
  },
];

export const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  analytics: "Security Analytics",
  projects: "Projects",
  targets: "Target Management",
  reconnaissance: "Reconnaissance",
  scans: "Scan Center",
  assessments: "Vulnerability Assessment",
  "ai-analyst": "AI Security Analyst",
  findings: "Findings & Evidence",
  risks: "Risk Management",
  remediation: "Remediation Tracking",
  reports: "Reports",
  activity: "Activity Logs",
  users: "User Management",
  integrations: "Integrations",
  settings: "Settings",
  new: "New",
  edit: "Edit",
};
