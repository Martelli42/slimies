import { NextResponse } from "next/server";

import { databaseError, readJson, requireUser, zodError } from "@/lib/api";
import { resolveActivity } from "@/lib/classify";
import { ATTRIBUTE_KEYS } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { localDate } from "@/lib/time";
import { activityInputSchema } from "@/lib/validation";
import { computeAward } from "@/lib/xp/engine";

/**
 * Dry run of a submission: same classifier, same engine, same daily totals —
 * but nothing is written. Powers the live "suggested XP" readout on the log
 * screen so the reduction rules are visible *before* you commit.
 */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = activityInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);
  const input = parsed.data;

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("timezone")
    .eq("id", user.id)
    .single();
  if (error) return databaseError(error);

  const timezone = input.timezone || profile?.timezone || "UTC";
  const day = localDate(timezone, new Date(input.occurredAt));

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

  return NextResponse.json({
    attributes: award.attributes,
    playerXp: award.playerXp,
    notes: award.notes,
    evaluation: {
      activityType: classification.activityType,
      title: classification.title,
      usefulness: classification.usefulness,
      reason: classification.reason,
      provider: classification.provider,
      confidence: classification.confidence,
    },
  });
}
