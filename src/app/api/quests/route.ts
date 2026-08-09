import { NextResponse } from "next/server";

import { databaseError, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { localDate } from "@/lib/time";

/**
 * The day's quest board, generated on demand for the player's local date.
 * Idempotent: calling it repeatedly returns the same board.
 */
export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();
  if (profileError) return databaseError(profileError);

  const day = localDate(profile?.timezone ?? "UTC");
  const { data, error } = await admin.rpc("ensure_daily_quests", {
    p_user: user.id,
    p_date: day,
  });
  if (error) return databaseError(error);

  return NextResponse.json({ date: day, quests: data ?? [] });
}
