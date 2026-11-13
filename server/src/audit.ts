import type { ActivityType, EntityType, Notification } from "@/types";
import { newId, prisma } from "./db.ts";
import { sealPending } from "./auditChain.ts";

/**
 * Appends an activity log entry and seals it into the tamper-evident chain.
 * There is no API to edit or delete these rows.
 */
export async function log(userId: string, type: ActivityType, entityType: EntityType, entityId: string | undefined, entityLabel: string, description: string) {
  const row = await prisma.activityLog.create({ data: { id: newId("act"), type, userId, timestamp: new Date(), entityType, entityId: entityId ?? null, entityLabel, description } });
  await sealPending();
  return row;
}

/**
 * Adds a notification. With `recipients`, each person gets their own copy (shown only to them);
 * without, it is shown to everyone.
 */
export async function notify(n: Omit<Notification, "id" | "createdAt" | "read" | "userId">, settingKey?: "findingUpdates" | "scanEvents" | "remediationDue" | "reportReady", recipients?: string[]) {
  if (settingKey) {
    const s = await prisma.appSetting.findUnique({ where: { id: "app" } });
    const prefs = (s?.value as { notifications?: Record<string, boolean> } | undefined)?.notifications;
    if (prefs && prefs[settingKey] === false) return;
  }
  const base = { title: n.title, message: n.message, tone: n.tone, link: n.link ?? null, createdAt: new Date(), read: false };
  if (!recipients) return void (await prisma.notification.create({ data: { id: newId("ntf"), ...base } }));
  for (const userId of [...new Set(recipients)]) await prisma.notification.create({ data: { id: newId("ntf"), userId, ...base } });
}
