import type { UserRole } from "@/types";

/**
 * Client-side role model used ONLY to demonstrate role-based navigation and
 * disabled states. It is not a security boundary: the future backend must
 * enforce the same rules on every request.
 */
export type Permission =
  | "manage_users"
  | "manage_settings"
  | "manage_integrations"
  | "manage_projects"
  | "manage_targets"
  | "run_demo_scans"
  | "verify_findings"
  | "manage_remediation"
  | "generate_reports"
  | "use_ai"
  | "view_activity";

const MATRIX: Record<UserRole, Permission[]> = {
  administrator: ["manage_users", "manage_settings", "manage_integrations", "manage_projects", "manage_targets", "run_demo_scans", "verify_findings", "manage_remediation", "generate_reports", "use_ai", "view_activity"],
  assessor: ["manage_projects", "manage_targets", "run_demo_scans", "verify_findings", "manage_remediation", "generate_reports", "use_ai", "view_activity"],
  viewer: [],
};

export function can(role: UserRole | undefined, permission: Permission): boolean {
  return role ? MATRIX[role].includes(permission) : false;
}

export function permissionsFor(role: UserRole): Permission[] {
  return MATRIX[role];
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  manage_users: "Manage users",
  manage_settings: "Manage application settings",
  manage_integrations: "Manage integrations",
  manage_projects: "Create and edit projects",
  manage_targets: "Register targets and edit scope",
  run_demo_scans: "Run demo scan simulations",
  verify_findings: "Verify findings",
  manage_remediation: "Manage remediation tasks",
  generate_reports: "Generate reports",
  use_ai: "Use AI Security Analyst",
  view_activity: "View activity logs",
};

export function deniedReason(role: UserRole | undefined): string {
  return `Your demo role (${role ?? "signed out"}) does not include this action. Role checks here are a UI demonstration only.`;
}
