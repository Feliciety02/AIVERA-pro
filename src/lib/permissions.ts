import type { UserRole } from "@/types";

/**
 * The role model, shared by the server (which enforces it on every request) and the web app
 * (which uses it to show or hide actions). Keep this file the single source of truth.
 *
 * Three roles, one per stage of the work:
 *   Administrator      leads the assessment and runs the platform: projects, permission,
 *                      every approval, users and settings
 *   Security Tester    does the testing: scans, verifies findings, retests and drafts reports (id "assessor")
 *   Website Owner      owns the website under test and fixes what was found (id "remediation_owner")
 *
 * Separation of duties (enforced in the routes, not here): nobody approves their own work.
 * The person who confirms a critical or high finding can't sign it off, a fix's owner can't
 * approve closing it, and a report's author can't approve it.
 */
export type Permission =
  | "manage_users"
  | "manage_settings"
  | "manage_integrations"
  | "view_all_projects"
  | "manage_projects"
  | "authorize_targets"
  | "manage_targets"
  | "run_demo_scans"
  | "verify_findings"
  | "signoff_findings"
  | "manage_remediation"
  | "work_remediation"
  | "approve_remediation"
  | "generate_reports"
  | "approve_reports"
  | "use_ai"
  | "view_activity";

export const ROLE_ORDER: UserRole[] = ["administrator", "assessor", "remediation_owner"];

const ASSESSOR: Permission[] = ["manage_targets", "run_demo_scans", "verify_findings", "manage_remediation", "work_remediation", "generate_reports", "use_ai", "view_activity"];
const MATRIX: Record<UserRole, Permission[]> = {
  administrator: [...ASSESSOR, "manage_projects", "authorize_targets", "signoff_findings", "approve_remediation", "approve_reports", "manage_users", "manage_settings", "manage_integrations", "view_all_projects"],
  assessor: ASSESSOR,
  remediation_owner: ["work_remediation"],
};

/** Roles that no longer exist map onto the nearest remaining one (old accounts and saved data). */
export const LEGACY_ROLES: Record<string, UserRole> = { lead: "administrator", viewer: "remediation_owner" };

export function can(role: UserRole | string | undefined, permission: Permission): boolean {
  return role ? (MATRIX[(LEGACY_ROLES[role] ?? role) as UserRole] ?? []).includes(permission) : false;
}

export function permissionsFor(role: UserRole): Permission[] {
  return MATRIX[role] ?? [];
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  manage_users: "Manage users and roles",
  manage_settings: "Manage application settings",
  manage_integrations: "Manage integrations",
  view_all_projects: "See every project",
  manage_projects: "Create projects and choose the team",
  authorize_targets: "Record the owner's permission for a website",
  manage_targets: "Register websites and edit scope",
  run_demo_scans: "Run scans and import tool output",
  verify_findings: "Verify findings",
  signoff_findings: "Sign off critical and high findings",
  manage_remediation: "Create fix tasks and record retests",
  work_remediation: "Work on assigned fixes",
  approve_remediation: "Approve closing a fix or accepting a risk",
  generate_reports: "Draft reports",
  approve_reports: "Approve final reports",
  use_ai: "Use AI Security Analyst",
  view_activity: "View activity logs",
};

export function deniedReason(role: UserRole | undefined): string {
  return `Your role (${role ?? "signed out"}) does not include this action.`;
}
