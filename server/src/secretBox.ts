/**
 * Encrypts small secrets at rest (the test-account session used by authenticated scans).
 * AES-256-GCM with a key that lives only in server/.env (AIVERA_SECRET_KEY), so a copy of the
 * database alone does not reveal the session. Decrypted values are only ever passed to the
 * scan worker, never returned by the API or written to the activity log.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(process.cwd(), "server/.env");

function secretKey(): Buffer {
  let key = process.env.AIVERA_SECRET_KEY?.trim();
  if (!key) {
    key = randomBytes(32).toString("hex");
    process.env.AIVERA_SECRET_KEY = key;
    try {
      appendFileSync(ENV_PATH, `\n# Encrypts stored scan credentials. Never share or commit it; changing it makes saved credentials unreadable.\nAIVERA_SECRET_KEY=${key}\n`);
    } catch {
      console.warn("[secrets] Could not save AIVERA_SECRET_KEY to server/.env; saved scan credentials will be unreadable after a restart.");
    }
  }
  return createHash("sha256").update(key).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function open(sealed: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Stored credential has an unknown format.");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
