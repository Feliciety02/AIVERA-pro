import { prisma } from "./db.ts";
import { seedDatabase } from "./seedData.ts";

seedDatabase()
  .then(async () => {
    const counts = { users: await prisma.user.count(), projects: await prisma.project.count(), findings: await prisma.finding.count() };
    console.log("Seeded AEGIS demo data:", counts);
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
