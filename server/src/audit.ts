import type { ActivityType, EntityType, Notification } from "@/types";
import { newId, prisma } from "./db.ts";

/** Appends an activity log entry. There is no API to edit or delete these rows. */
export function log(userId: string, type: ActivityType, entityType: EntityType, entityId: string | undefined, entityLabel: string, description: string) {
  return prisma.activityLog.create({ data: { id: newId("act"), type, userId, timestamp: new Date(), entityType, entityId: entityId ?? null, entityLabel, description } });
}

export async function notify(n: Omit<Notification, "id" | "createdAt" | "read">, settingKey?: "findingUpdates" | "scanEvents" | "remediationDue" | "reportReady") {
  if (settingKey) {
    const s = await prisma.appSetting.findUnique({ where: { id: "app" } });
    const prefs = (s?.value as { notifications?: Record<string, boolean> } | undefined)?.notifications;
    if (prefs && prefs[settingKey] === false) return;
  }
  await prisma.notification.create({ data: { id: newId("ntf"), title: n.title, message: n.message, tone: n.tone, link: n.link ?? null, createdAt: new Date(), read: false } });
}
