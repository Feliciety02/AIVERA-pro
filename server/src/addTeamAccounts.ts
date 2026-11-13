/**
 * Adds any starting account that is missing (for example the Security Lead and Developer added
 * with the team roles) to an existing database. Nothing else is changed or deleted: existing
 * accounts keep their passwords, and a project only gets a lead or remediation owner if it has none.
 *
 *   npm run db:accounts
 */
import { seedProjects, seedUsers } from "@/data/seed";
import { hashPassword } from "./auth.ts";
import { prisma } from "./db.ts";
import { env } from "./env.ts";

async function main() {
  if (!env.seedPassword || env.seedPassword.length < 10) throw new Error("Set SEED_DEMO_PASSWORD (min. 10 characters) in server/.env first.");
  const added: string[] = [];
  let passwordHash: string | undefined;
  for (const u of seedUsers) {
    if (await prisma.user.findUnique({ where: { email: u.email } })) continue;
    passwordHash ??= await hashPassword(env.seedPassword);
    await prisma.user.create({ data: { ...u, passwordHash, createdAt: new Date(u.createdAt), lastActiveAt: new Date(u.lastActiveAt) } });
    added.push(`${u.email} (${u.role})`);
  }
  // Projects made before team roles existed have no lead, and people now only see projects they
  // are on. Give each such project the starting team so nobody loses sight of existing work.
  const seedTeam = seedProjects[0]!;
  const team = await prisma.user.findMany({ where: { id: { in: seedTeam.memberIds } }, select: { id: true } });
  const exists = (id?: string) => !!id && team.some((u) => u.id === id);
  let joined = 0;
  for (const row of await prisma.project.findMany({ include: { members: true } })) {
    if (row.leadId) continue;
    for (const { id } of team) if (!row.members.some((m) => m.userId === id)) await prisma.projectMember.create({ data: { projectId: row.id, userId: id } });
    await prisma.project.update({
      where: { id: row.id },
      data: { leadId: exists(seedTeam.leadId) ? seedTeam.leadId : null, remediationOwnerId: row.remediationOwnerId ?? (exists(seedTeam.remediationOwnerId) ? seedTeam.remediationOwnerId : null) },
    });
    joined++;
  }
  if (joined) console.log(`Put the starting team on ${joined} project(s) that had no lead.`);
  console.log(added.length ? `Added ${added.join(", ")}. They use the SEED_DEMO_PASSWORD password.` : "All starting accounts already exist. Nothing changed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
