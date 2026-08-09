import webpush from "web-push";

import { createAdminClient } from "./supabase/admin";

/**
 * Web Push delivery.
 *
 * Notifications are always written to the `notifications` table by the game
 * logic; push is an *additional* channel that may or may not be configured.
 * Every helper here is best-effort and never throws into a request path.
 */

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

let configured: boolean | null = null;

export function pushConfigured(): boolean {
  if (configured !== null) return configured;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:notifications@example.com";

  if (!publicKey || !privateKey) {
    configured = false;
    return configured;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return configured;
}

/** Preference column that gates each notification kind. */
export type PushPreference =
  | "notify_daily_quests"
  | "notify_streak_risk"
  | "notify_friend_activity"
  | "notify_leaderboard"
  | "notify_achievements"
  | "notify_weekly_report";

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
  preference?: PushPreference,
): Promise<number> {
  if (!pushConfigured()) return 0;

  const admin = createAdminClient();

  if (preference) {
    const { data: settings } = await admin
      .from("user_settings")
      .select(preference)
      .eq("user_id", userId)
      .single();
    if (settings && (settings as Record<string, boolean>)[preference] === false) {
      return 0;
    }
  }

  const { data: subscriptions } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (!subscriptions?.length) return 0;

  let delivered = 0;
  const expired: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
        delivered += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        // 404/410 mean the browser dropped the subscription — clean it up.
        if (statusCode === 404 || statusCode === 410) expired.push(sub.id);
      }
    }),
  );

  if (expired.length) {
    await admin.from("push_subscriptions").delete().in("id", expired);
  }

  return delivered;
}
