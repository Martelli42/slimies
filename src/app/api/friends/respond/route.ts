import { NextResponse } from "next/server";
import { z } from "zod";

import { databaseError, readJson, requireUser, zodError } from "@/lib/api";
import { sendPushToUser } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  requestId: z.string().uuid(),
  accept: z.boolean(),
});

/** Accept or decline an incoming friend request. */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("respond_friend_request", {
    p_user: user.id,
    p_request: parsed.data.requestId,
    p_accept: parsed.data.accept,
  });
  if (error) return databaseError(error);

  const result = data as { status: string; friend_id?: string };
  if (result.status === "accepted" && result.friend_id) {
    const { data: me } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    await sendPushToUser(result.friend_id, {
      title: "Request accepted",
      body: `${me?.display_name ?? "A player"} is now your ally.`,
      url: "/friends",
    });
  }

  return NextResponse.json(data);
}
