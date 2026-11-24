/**
 * Loads the starting data. It REPLACES everything in the database, so it protects existing data:
 *
 *   npm run db:seed                 refuses if the database already has data
 *   npm run db:seed -- --if-empty   seeds a new database, does nothing otherwise (used by db:setup)
 *   npm run db:seed -- --force      backs the database up to server/prisma/backups, then replaces it
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { dbFilePath, prisma } from "./db.ts";
import { seedDatabase } from "./seedData.ts";

const args = process.argv.slice(2);
const force = args.includes("--force");
const ifEmpty = args.includes("--if-empty");

async function main() {
  // Any account means the database is in use; a brand-new database has none.
  const users = await prisma.user.count().catch(() => 0);
  if (users > 0) {
    if (ifEmpty) {
      console.log("Database already has data, so the starting data was not loaded. Your data is unchanged.");
      return;
    }
    if (!force) {
      console.error(
        "Stopped: this database already has data, and seeding would erase all of it (websites, scans, findings, reports).\n" +
          "To replace it anyway, run: npm run db:seed -- --force   (a backup is saved first)",
      );
      process.exitCode = 1;
      return;
    }
    if (existsSync(dbFilePath)) {
      const dir = join(dirname(dbFilePath), "backups");
      mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
      const backup = join(dir, `${basename(dbFilePath, ".db")}-before-seed-${stamp}.db`);
      // VACUUM INTO takes a consistent copy even while the API server has the database open.
      await prisma.$executeRawUnsafe(`VACUUM INTO '${backup.replace(/'/g, "''")}'`).catch(() => copyFileSync(dbFilePath, backup));
      console.log(`Backed up the current database to ${backup}`);
    }
  }
  await seedDatabase();
  const counts = { users: await prisma.user.count(), projects: await prisma.project.count(), findings: await prisma.finding.count() };
  console.log("Loaded AIVERA starting data (UMERCH3.0):", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
