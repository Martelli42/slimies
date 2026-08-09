import { NextResponse } from "next/server";

import { getActivityType } from "@/lib/activities";
import { databaseError, jsonError, readJson, requireUser, zodError } from "@/lib/api";
import { resolveActivity } from "@/lib/classify";
import { ATTRIBUTE_KEYS } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { localDate } from "@/lib/time";
import type { AwardResult } from "@/lib/types/database";
import { activityInputSchema } from "@/lib/validation";
import { computeAward } from "@/lib/xp/engine";

/**
 * Log an activity.
 *
 * The flow, in order, and never any other order:
 *   validate input -> classify -> read today's totals -> compute XP ->
 *   hand the *derived* award to the database, which clamps it against the
 *   day's real numbers inside a transaction and returns the rewards.
 *
 * The client sends what it did, never what it earned.
 */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = activityInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);
  const input = parsed.data;

  const admin = createAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("timezone, onboarded")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) return databaseError(profileError);
  if (!profile.onboarded) {
    return jsonError("Finish onboarding first.", 409, { code: "not_onboarded" });
  }

  const timezone = input.timezone || profile.timezone || "UTC";
  const occurredAt = new Date(input.occurredAt);
  const day = localDate(timezone, occurredAt);

  // Evaluate what was actually done. For catalogue activities this is a
  // no-op; for free-form entries it decides the category and the credit.
  const classification = await resolveActivity({
    text: [input.title, input.description].filter(Boolean).join(". "),
    durationMinutes: input.durationMinutes,
    activityType: input.activityType,
  });

  const { data: ledger } = await admin
    .from("xp_ledger")
    .select("strength_xp, agility_xp, wisdom_xp, discipline_xp, endurance_xp, player_xp")
    .eq("user_id", user.id)
    .eq("local_date", day)
    .eq("source", "activity");

  const dailyEarned = { strength: 0, agility: 0, wisdom: 0, discipline: 0, endurance: 0 };
  let dailyPlayerXp = 0;
  for (const row of ledger ?? []) {
    for (const key of ATTRIBUTE_KEYS) {
      dailyEarned[key] += (row as Record<string, number>)[`${key}_xp`] ?? 0;
    }
    dailyPlayerXp += row.player_xp ?? 0;
  }

  const award = computeAward({
    rates: classification.rates,
    durationMinutes: input.durationMinutes,
    difficulty: input.difficulty as never,
    quality: classification.quality,
    dailyEarned,
    dailyPlayerXp,
  });

  const resolvedType = getActivityType(classification.activityType)
    ? classification.activityType
    : input.activityType;

  const { data, error } = await admin.rpc("award_activity", {
    p_user: user.id,
    p_payload: {
      activity_type: resolvedType,
      title: input.title || classification.title,
      description: input.description ?? null,
      duration_minutes: input.durationMinutes,
      difficulty: input.difficulty,
      occurred_at: occurredAt.toISOString(),
      proof_url: input.proofUrl ?? null,
      timezone,
      classification: {
        provider: classification.provider,
        usefulness: classification.usefulness,
        quality: classification.quality,
        reason: classification.reason,
        confidence: classification.confidence,
      },
    },
    p_award: {
      strength: award.attributes.strength,
      agility: award.attributes.agility,
      wisdom: award.attributes.wisdom,
      discipline: award.attributes.discipline,
      endurance: award.attributes.endurance,
      player: award.playerXp,
    },
  });

  if (error) return databaseError(error);

  return NextResponse.json({
    ...(data as AwardResult),
    evaluation: {
      usefulness: classification.usefulness,
      reason: classification.reason,
      provider: classification.provider,
    },
    notes: award.notes,
  });
}
