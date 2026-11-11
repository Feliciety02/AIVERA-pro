import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

const envPath = resolve(process.cwd(), "server/.env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const cliUrl = databaseUrl.startsWith("file:./")
  ? `file:./server/prisma/${databaseUrl.slice("file:./".length)}`
  : databaseUrl;

export default defineConfig({
  schema: "server/prisma/schema.prisma",
  datasource: { url: cliUrl },
});
