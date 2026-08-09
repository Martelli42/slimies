import { NextResponse } from "next/server";

import { databaseError, readJson, requireUser, zodError } from "@/lib/api";
import { sendPushToUser } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { friendCodeSchema } from "@/lib/validation";
import { z } from "zod";

const bodySchema = z.object({ code: friendCodeSchema });

/** Send a friend request by friend code (or username). */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("send_friend_request", {
    p_user: user.id,
    p_code: parsed.data.code,
  });
  if (error) return databaseError(error);

  // Best effort — a failed push must never fail the request itself.
  const target = (data as { target?: { username?: string } })?.target;
  if (target?.username) {
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("username", target.username)
      .single();
    const { data: me } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();

    if (targetProfile?.id) {
      await sendPushToUser(targetProfile.id, {
        title: "New ally request",
        body: `${me?.display_name ?? "A player"} wants to team up.`,
        url: "/friends",
      });
    }
  }

  return NextResponse.json(data);
}
