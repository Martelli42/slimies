import { NextResponse } from "next/server";

import { sendPushToUser } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

/** Sunday summary: writes a notification and pushes it if the player opted in. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: players } = await admin
    .from("profiles")
    .select("id")
    .eq("onboarded", true)
    .gt("activities_count", 0)
    .limit(1000);

  let sent = 0;

  for (const player of players ?? []) {
    const { data: report } = await admin.rpc("weekly_report", {
      p_user: player.id,
      p_week_start: null,
    });

    if (!report || (report as { activities: number }).activities === 0) continue;

    const summary = report as {
      activities: number;
      player_xp: number;
      active_days: number;
      weakest: string;
    };

    await admin.rpc("app_notify", {
      p_user: player.id,
      p_kind: "weekly_report",
      p_title: "Your week in review",
      p_message: `${summary.activities} activities · ${summary.player_xp} XP · ${summary.active_days}/7 active days. Focus next week: ${summary.weakest}.`,
      p_href: "/profile",
      p_meta: report,
    });

    sent += await sendPushToUser(
      player.id,
      {
        title: "Weekly report ready",
        body: `${summary.player_xp} XP across ${summary.activities} activities.`,
        url: "/profile",
        tag: "weekly-report",
      },
      "notify_weekly_report",
    );
  }

  return NextResponse.json({ sent });
}
