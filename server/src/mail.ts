/** Optional SMTP delivery for the few notices that need to reach people outside the app. */
import nodemailer from "nodemailer";
import { prisma } from "./db.ts";

const urgent = (title: string) => title === "New account waiting for approval"
  || title === "Fix overdue" || title === "Overdue fix escalated"
  || title.startsWith("Critical finding needs your sign-off");

export async function sendUrgentEmail(title: string, message: string, link: string | undefined, recipients: string[] | undefined) {
  if (!urgent(title) || !recipients?.length) return;
  const host = process.env.AIVERA_SMTP_HOST?.trim();
  const from = process.env.AIVERA_SMTP_FROM?.trim();
  if (!host || !from) return;
  const port = Number(process.env.AIVERA_SMTP_PORT || 587);
  const user = process.env.AIVERA_SMTP_USER?.trim();
  const pass = process.env.AIVERA_SMTP_PASSWORD;
  const transport = nodemailer.createTransport({ host, port, secure: port === 465, requireTLS: port !== 465,
    auth: user && pass ? { user, pass } : undefined, tls: { minVersion: "TLSv1.2" } });
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(recipients)] }, status: "active" }, select: { email: true } });
  const base = process.env.AIVERA_APP_URL?.trim();
  let actionUrl = "";
  if (base && link?.startsWith("/")) {
    try { actionUrl = new URL(link, base).href; } catch { /* omit an invalid link */ }
  }
  for (const person of people) {
    try {
      await transport.sendMail({ from, to: person.email, subject: `AIVERA: ${title}`,
        text: `${message}${actionUrl ? `\n\nOpen in AIVERA: ${actionUrl}` : ""}\n` });
    } catch (e) {
      console.error(`[mail] urgent notice delivery failed for ${person.email}: ${(e as Error).message}`);
    }
  }
  transport.close();
}
