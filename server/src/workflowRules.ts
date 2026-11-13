/**
 * Team workflow rules and automations: who may see a project, who work is assigned to, and what
 * happens automatically between steps. Routes call these so the rules live in one place.
 *
 *   scan finishes          findings go to the project assessor with the fewest open reviews
 *   finding confirmed      a fix task is created for the project's remediation owner (SLA by severity)
 *   critical/high confirmed  the project's lead is asked to sign it off
 *   fix ready for retest   the retest goes to the assessor who verified the finding
 *   retest passed          the lead is asked to approve closing the fix
 *   fix overdue            the owner is reminded, then the lead after ESCALATE_AFTER_DAYS more days
 *   all findings reviewed  the project's assessors are prompted to draft the report
 *   person deactivated     their open work moves to someone else on the project
 */
import type { Severity, UserRole } from "@/types";
import { REMEDIATION_SLA_DAYS } from "@/lib/constants";
import { can } from "@/lib/permissions";
import type { User } from "../prisma/generated/prisma/client.ts";
import { newId, nextCode, prisma, retryOnDuplicateCode } from "./db.ts";
import { log, notify } from "./audit.ts";
import { fail } from "./http.ts";

export const ESCALATE_AFTER_DAYS = 3;
const OPEN_REVIEW = ["pending", "needs_review"];
const CLOSED_FIX = ["resolved", "accepted_risk"];

type Who = Pick<User, "id" | "role">;

/* --------------------------------- Access --------------------------------- */

/** Project ids a person may see, or null for "all" (administrators). */
export async function visibleProjectIds(user: Who): Promise<Set<string> | null> {
  if (can(user.role, "view_all_projects")) return null;
  const [member, owned, led, fixes] = await Promise.all([
    prisma.projectMember.findMany({ where: { userId: user.id }, select: { projectId: true } }),
    prisma.project.findMany({ where: { ownerId: user.id }, select: { id: true } }),
    prisma.project.findMany({ where: { OR: [{ leadId: user.id }, { remediationOwnerId: user.id }] }, select: { id: true } }),
    // A developer also sees the projects their fix tasks belong to.
    prisma.remediationTask.findMany({ where: { ownerId: user.id }, select: { findingId: true } }),
  ]);
  const ids = new Set([...member.map((m) => m.projectId), ...owned.map((p) => p.id), ...led.map((p) => p.id)]);
  if (fixes.length) {
    for (const f of await prisma.finding.findMany({ where: { id: { in: fixes.map((t) => t.findingId) } }, select: { projectId: true } })) ids.add(f.projectId);
  }
  return ids;
}

/** 403 unless the person may work in this project. */
export async function assertProjectAccess(user: Who, projectId: string | null | undefined) {
  if (!projectId) return;
  const ids = await visibleProjectIds(user);
  if (ids && !ids.has(projectId)) fail(403, "You are not on this project's team.");
}

/* ------------------------------- Who gets it ------------------------------- */

const activeUsers = (ids: string[]) => prisma.user.findMany({ where: { id: { in: ids }, status: "active" } });
const teamIds = async (projectId: string) => {
  const p = await prisma.project.findUnique({ where: { id: projectId }, include: { members: true } });
  return p ? { project: p, ids: [...new Set([p.ownerId, ...(p.leadId ? [p.leadId] : []), ...p.members.map((m) => m.userId)])] } : null;
};
const hasRole = (u: { role: string }, roles: UserRole[]) => roles.includes(u.role as UserRole);

/** Leads who approve for a project: its named lead, else leads on the team, else any lead, else administrators. */
export async function projectLeads(projectId: string, exclude: string[] = []): Promise<string[]> {
  const team = await teamIds(projectId);
  const ok = (u: User) => !exclude.includes(u.id) && can(u.role, "signoff_findings");
  if (team?.project.leadId) {
    const [lead] = await activeUsers([team.project.leadId]);
    if (lead && ok(lead)) return [lead.id];
  }
  const onTeam = (await activeUsers(team?.ids ?? [])).filter((u) => ok(u) && u.role === "lead");
  if (onTeam.length) return onTeam.map((u) => u.id);
  const leads = (await prisma.user.findMany({ where: { status: "active", role: "lead" } })).filter(ok);
  if (leads.length) return leads.map((u) => u.id);
  return (await prisma.user.findMany({ where: { status: "active", role: "administrator" } })).filter(ok).map((u) => u.id);
}

/** Assessor on the team with the fewest open reviews. Falls back to a lead, then the project owner. */
export async function pickAssessor(projectId: string, exclude: string[] = []): Promise<string | null> {
  const team = await teamIds(projectId);
  if (!team) return null;
  const people = (await activeUsers(team.ids)).filter((u) => !exclude.includes(u.id) && can(u.role, "verify_findings"));
  const pool = people.filter((u) => u.role === "assessor").length ? people.filter((u) => u.role === "assessor") : people;
  if (!pool.length) return exclude.includes(team.project.ownerId) ? null : team.project.ownerId;
  const load = await prisma.finding.groupBy({ by: ["assignedAssessorId"], where: { assignedAssessorId: { in: pool.map((u) => u.id) }, verificationStatus: { in: OPEN_REVIEW } }, _count: true });
  const count = (id: string) => load.find((l) => l.assignedAssessorId === id)?._count ?? 0;
  return [...pool].sort((a, b) => count(a.id) - count(b.id) || a.name.localeCompare(b.name))[0]!.id;
}

/** Who fixes things on this project: its named remediation owner, a developer on the team, else a lead. */
export async function pickRemediationOwner(projectId: string, exclude: string[] = []): Promise<string | null> {
  const team = await teamIds(projectId);
  if (!team) return null;
  const pick = async (ids: string[]) => (await activeUsers(ids)).filter((u) => !exclude.includes(u.id) && can(u.role, "work_remediation"));
  if (team.project.remediationOwnerId) {
    const [named] = await pick([team.project.remediationOwnerId]);
    if (named) return named.id;
  }
  const people = await pick(team.ids);
  const devs = people.filter((u) => hasRole(u, ["remediation_owner"]));
  if (devs.length) {
    const load = await prisma.remediationTask.groupBy({ by: ["ownerId"], where: { ownerId: { in: devs.map((u) => u.id) }, status: { notIn: CLOSED_FIX } }, _count: true });
    const count = (id: string) => load.find((l) => l.ownerId === id)?._count ?? 0;
    return [...devs].sort((a, b) => count(a.id) - count(b.id))[0]!.id;
  }
  return (await projectLeads(projectId, exclude))[0] ?? null;
}

/** For a project created automatically: the active lead with the fewest open projects. */
export async function pickLeadForNewProject(): Promise<string | null> {
  const leads = await prisma.user.findMany({ where: { status: "active", role: "lead" } });
  if (!leads.length) return null;
  const load = await prisma.project.groupBy({ by: ["leadId"], where: { leadId: { in: leads.map((l) => l.id) }, status: { notIn: ["completed", "archived"] } }, _count: true });
  const count = (id: string) => load.find((l) => l.leadId === id)?._count ?? 0;
  return [...leads].sort((a, b) => count(a.id) - count(b.id))[0]!.id;
}

/* ------------------------------- Automations ------------------------------- */

/** New findings from a scan or import: assign the batch to one assessor and tell them. */
export async function assignNewFindings(projectId: string, findingIds: string[], scanCode: string) {
  if (!findingIds.length) return;
  const assessor = await pickAssessor(projectId);
  if (!assessor) return;
  await prisma.finding.updateMany({ where: { id: { in: findingIds } }, data: { assignedAssessorId: assessor } });
  await notify({ title: "Findings assigned to you", message: `${findingIds.length} new finding${findingIds.length === 1 ? "" : "s"} from ${scanCode} need your review.`, tone: "info", link: "/my-work" }, "findingUpdates", [assessor]);
}

/** A confirmed finding gets a fix task right away, with a due date from the severity SLA. */
export async function createFixTask(findingId: string, actorId: string) {
  const f = await prisma.finding.findUnique({ where: { id: findingId } });
  if (!f || f.severity === "info") return null;
  if (await prisma.remediationTask.findFirst({ where: { findingId: f.id, status: { notIn: CLOSED_FIX } } })) return null;
  const owner = await pickRemediationOwner(f.projectId);
  if (!owner) return null;
  const now = new Date();
  const severity = f.severity as Severity;
  const due = new Date(now.getTime() + REMEDIATION_SLA_DAYS[severity] * 86400_000);
  const t = await retryOnDuplicateCode(async () => prisma.remediationTask.create({
    data: {
      id: newId("rem"), code: nextCode("REM", (await prisma.remediationTask.findMany({ select: { code: true } })).map((x) => x.code)),
      findingId: f.id, title: `Fix: ${f.title}`.slice(0, 140), description: (f.description || f.title).slice(0, 1000), recommendation: (f.remediation || "See the finding's evidence.").slice(0, 4000),
      ownerId: owner, priority: severity, status: "open", dueDate: due, retestRequired: severity !== "low", retestResult: severity !== "low" ? "pending" : "not_required",
      createdAt: now, updatedAt: now,
      history: { create: [{ at: now, by: actorId, to: "open", note: `Created automatically when ${f.code} was confirmed. Due in ${REMEDIATION_SLA_DAYS[severity]} days (${severity} severity).` }] },
    },
  }));
  await log(actorId, "remediation_created", "remediation", t.id, t.code, `Created automatically for ${f.code}; assigned by workflow rules`);
  await notify({ title: "New fix assigned to you", message: `${t.code}: ${f.title}. Due ${due.toISOString().slice(0, 10)}.`, tone: severity === "critical" || severity === "high" ? "critical" : "info", link: `/remediation?task=${t.id}` }, "remediationDue", [owner]);
  return t;
}

/** Once nothing in a project waits for review, prompt its assessors to draft the report (once per batch). */
export async function promptReportWhenReviewed(projectId: string) {
  const [open, confirmed] = await Promise.all([
    prisma.finding.count({ where: { projectId, verificationStatus: { in: OPEN_REVIEW } } }),
    prisma.finding.count({ where: { projectId, verificationStatus: "confirmed" } }),
  ]);
  if (open || !confirmed) return;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return;
  const link = `/reports/new?project=${projectId}`;
  const recent = await prisma.notification.findFirst({ where: { link, createdAt: { gt: new Date(Date.now() - 86400_000) } } });
  if (recent) return;
  const team = await teamIds(projectId);
  const writers = (await activeUsers(team?.ids ?? [])).filter((u) => can(u.role, "generate_reports") && u.role !== "administrator").map((u) => u.id);
  await notify({ title: "Ready for a report", message: `Every finding in ${project.code} ${project.name} has been reviewed. Draft the report and submit it for approval.`, tone: "success", link }, "reportReady", writers.length ? writers : undefined);
}

/** Reminds owners of overdue fixes, then escalates to the lead. Each step happens once per task. */
export async function remindOverdueFixes() {
  const tasks = await prisma.remediationTask.findMany({ where: { status: { notIn: CLOSED_FIX }, dueDate: { lt: new Date() } } });
  for (const t of tasks) {
    const link = `/remediation?task=${t.id}`;
    const days = Math.max(1, Math.floor((Date.now() - t.dueDate.getTime()) / 86400_000));
    if (!(await prisma.notification.findFirst({ where: { link, title: "Fix overdue" } })))
      await notify({ title: "Fix overdue", message: `${t.code} (${t.title}) is ${days} day${days === 1 ? "" : "s"} past its due date.`, tone: "critical", link }, "remediationDue", [t.ownerId]);
    if (days > ESCALATE_AFTER_DAYS && !(await prisma.notification.findFirst({ where: { link, title: "Overdue fix escalated" } }))) {
      const f = await prisma.finding.findUnique({ where: { id: t.findingId }, select: { projectId: true } });
      const leads = f ? await projectLeads(f.projectId, [t.ownerId]) : [];
      if (leads.length) {
        await notify({ title: "Overdue fix escalated", message: `${t.code} (${t.title}) is ${days} days overdue and still not fixed.`, tone: "critical", link }, "remediationDue", leads);
        await log(t.ownerId, "remediation_updated", "remediation", t.id, t.code, `Escalated to the lead: ${days} days overdue`);
      }
    }
  }
}

/** When someone is deactivated or loses a role, their open work goes to others on each project. */
export async function handOverWork(userId: string, actorId: string, keep: { reviews: boolean; fixes: boolean; leads: boolean }) {
  const moved: string[] = [];
  const person = await prisma.user.findUnique({ where: { id: userId } });
  if (!keep.reviews) {
    const findings = await prisma.finding.findMany({ where: { assignedAssessorId: userId, verificationStatus: { in: OPEN_REVIEW } } });
    const byProject = new Map<string, typeof findings>();
    for (const f of findings) byProject.set(f.projectId, [...(byProject.get(f.projectId) ?? []), f]);
    for (const [projectId, list] of byProject) {
      const to = await pickAssessor(projectId, [userId]);
      if (!to) continue;
      await prisma.finding.updateMany({ where: { id: { in: list.map((f) => f.id) } }, data: { assignedAssessorId: to } });
      await notify({ title: "Findings handed over to you", message: `${list.length} finding${list.length === 1 ? "" : "s"} from ${person?.name ?? "a former team member"} need your review.`, tone: "info", link: "/my-work" }, "findingUpdates", [to]);
      moved.push(`${list.length} review(s)`);
    }
  }
  if (!keep.fixes) {
    const tasks = await prisma.remediationTask.findMany({ where: { OR: [{ ownerId: userId }, { retestAssigneeId: userId }], status: { notIn: CLOSED_FIX } } });
    for (const t of tasks) {
      const f = await prisma.finding.findUnique({ where: { id: t.findingId }, select: { projectId: true } });
      if (!f) continue;
      const data: { ownerId?: string; retestAssigneeId?: string | null } = {};
      if (t.ownerId === userId) { const to = await pickRemediationOwner(f.projectId, [userId]); if (to) data.ownerId = to; }
      if (t.retestAssigneeId === userId) data.retestAssigneeId = await pickAssessor(f.projectId, [userId]);
      if (!Object.keys(data).length) continue;
      await prisma.remediationTask.update({ where: { id: t.id }, data });
      const to = data.ownerId ?? data.retestAssigneeId;
      if (to) await notify({ title: "Fix handed over to you", message: `${t.code}: ${t.title}`, tone: "info", link: `/remediation?task=${t.id}` }, "remediationDue", [to]);
      moved.push(t.code);
    }
  }
  if (!keep.leads) {
    for (const p of await prisma.project.findMany({ where: { OR: [{ leadId: userId }, { remediationOwnerId: userId }] } })) {
      const data: { leadId?: string | null; remediationOwnerId?: string | null } = {};
      if (p.leadId === userId) data.leadId = (await projectLeads(p.id, [userId]))[0] ?? null;
      if (p.remediationOwnerId === userId) data.remediationOwnerId = null;
      await prisma.project.update({ where: { id: p.id }, data });
      if (data.leadId) await notify({ title: "You are now the project lead", message: `${p.code} ${p.name}`, tone: "info", link: `/projects/${p.id}` }, undefined, [data.leadId]);
      moved.push(p.code);
    }
  }
  if (moved.length) await log(actorId, "user_updated", "user", userId, person?.name ?? userId, `Handed over open work: ${moved.join(", ")}`);
  return moved.length;
}
