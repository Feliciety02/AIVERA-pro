import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Load server/.env (Node 21.7+ built-in) before anything reads process.env.
const envPath = resolve(process.cwd(), "server/.env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

export const env = {
  port: Number(process.env.PORT ?? 4000),
  isProd: process.env.NODE_ENV === "production",
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? 8),
  seedPassword: process.env.SEED_DEMO_PASSWORD ?? "",
};

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy server/.env.example to server/.env.");
}
