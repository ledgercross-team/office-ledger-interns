import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { env } from "./env";

const enabled = !!(env.PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
if (enabled) webpush.setVapidDetails(env.VAPID_SUBJECT, env.PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);

export const pushEnabled = enabled;

export async function sendPush(userIds: string[], payload: { title: string; body?: string | null; link?: string | null }) {
  if (!enabled || !userIds.length) return;
  const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: payload.title, body: payload.body ?? "", url: payload.link ?? "/app" }),
          { TTL: 3600 },
        );
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
      }
    }),
  );
}
