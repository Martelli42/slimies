import { NextResponse } from "next/server";

import { databaseError, readJson, requireUser, zodError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { onboardingSchema } from "@/lib/validation";

/** Claims a username, records goals, and issues the first quest board. */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = onboardingSchema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("complete_onboarding", {
    p_user: user.id,
    p_username: parsed.data.username,
    p_display_name: parsed.data.displayName,
    p_goals: parsed.data.goals,
    p_timezone: parsed.data.timezone,
    p_avatar_url: parsed.data.avatarUrl ?? null,
  });

  if (error) return databaseError(error);
  return NextResponse.json(data);
}
