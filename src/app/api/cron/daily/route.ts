import { NextResponse } from "next/server";

import { pushConfigured, sendPushToUser } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { localDate } from "@/lib/time";

/**
 * Daily maintenance: issue each player's quest board and nudge the ones whose
 * streak is about to lapse.
 *
 * Scheduled from vercel.json. On plans that allow more than one run per day you
 * can switch the schedule to hourly — the handler already targets players by
 * their *local* hour, so nobody gets pinged at 4am.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QUIET_START = 8;
const QUIET_END = 22;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function localHour(timeZone: string): number {
  try {
    return Number(
      new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(
        new Date(),
      ),
    );
  } catch {
    return 12;
  }
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: players } = await admin
    .from("profiles")
    .select("id, timezone, current_streak, last_active_date")
    .eq("onboarded", true)
    .limit(1000);

  let boards = 0;
  let questNudges = 0;
  let streakNudges = 0;

  for (const player of players ?? []) {
    const timezone = player.timezone || "UTC";
    const hour = localHour(timezone);
    if (hour < QUIET_START || hour > QUIET_END) continue;

    const today = localDate(timezone);
    await admin.rpc("ensure_daily_quests", { p_user: player.id, p_date: today });
    boards += 1;

    if (!pushConfigured()) continue;

    const { data: quests } = await admin
      .from("daily_quests")
      .select("completed, is_bonus")
      .eq("user_id", player.id)
      .eq("quest_date", today);

    const core = (quests ?? []).filter((q) => !q.is_bonus);
    const outstanding = core.filter((q) => !q.completed).length;

    if (outstanding > 0 && hour <= 11) {
      questNudges += await sendPushToUser(
        player.id,
        {
          title: "Daily quests issued",
          body: `${outstanding} objective${outstanding === 1 ? "" : "s"} waiting.`,
          url: "/quests",
          tag: "daily-quests",
        },
        "notify_daily_quests",
      );
    }

    const streakAtRisk =
      player.current_streak >= 3 && player.last_active_date !== today && hour >= 19;

    if (streakAtRisk) {
      streakNudges += await sendPushToUser(
        player.id,
        {
          title: `${player.current_streak} day streak at risk`,
          body: "Log one activity before midnight to keep it alive.",
          url: "/activity/new",
          tag: "streak-risk",
        },
        "notify_streak_risk",
      );
    }
  }

  return NextResponse.json({ boards, questNudges, streakNudges });
}
