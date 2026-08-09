/**
 * Unit tests for the pure game maths: the level curve, the rank ladder, the
 * XP engine and the activity evaluator.
 *
 * Run with `npm test`. These cover the rules that decide what effort is worth,
 * which is exactly the code that must not drift silently.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ACTIVITY_TYPE_MAP } from "../src/lib/activities";
import { classifyWithRules } from "../src/lib/classify/rules";
import { levelFromTotalXp, totalXpForLevel, xpRequiredForLevel } from "../src/lib/leveling";
import { rankForLevel } from "../src/lib/ranks";
import { attributeTier } from "../src/lib/format";
import { computeAward, effectiveMinutes } from "../src/lib/xp/engine";
import {
  DAILY_ATTRIBUTE_CAP,
  MAX_ATTRIBUTE_XP_PER_ACTIVITY,
  MAX_PLAYER_XP_PER_ACTIVITY,
} from "../src/lib/xp/limits";

const award = (
  type: string,
  minutes: number,
  extra: Partial<Parameters<typeof computeAward>[0]> = {},
) =>
  computeAward({
    rates: ACTIVITY_TYPE_MAP[type].rates,
    durationMinutes: minutes,
    difficulty: "moderate",
    ...extra,
  });

test("level curve starts where the design says it should", () => {
  assert.equal(xpRequiredForLevel(1), 100);
  assert.equal(totalXpForLevel(1), 0);
  assert.equal(totalXpForLevel(2), 100);

  // Strictly increasing, forever.
  for (let level = 1; level < 400; level++) {
    assert.ok(
      xpRequiredForLevel(level + 1) >= xpRequiredForLevel(level),
      `requirement dipped at level ${level}`,
    );
  }
});

test("level lookup agrees with the cumulative table at every boundary", () => {
  for (let level = 1; level <= 120; level++) {
    const base = totalXpForLevel(level);
    assert.equal(levelFromTotalXp(base).level, level);
    assert.equal(levelFromTotalXp(base).intoLevel, 0);
    if (level > 1) {
      assert.equal(levelFromTotalXp(base - 1).level, level - 1);
    }
  }
});

test("progression stays reachable — not an exponential wall", () => {
  // A committed player earning ~80 XP a day should be around level 30 after
  // half a year, and level 100 should take years rather than decades.
  assert.ok(totalXpForLevel(30) / 80 < 260, "level 30 takes too long");
  assert.ok(totalXpForLevel(30) / 80 > 100, "level 30 arrives too cheaply");
  assert.ok(totalXpForLevel(100) / 80 > 1000, "level 100 is not rare enough");
});

test("rank ladder is monotonic and matches its anchors", () => {
  assert.equal(rankForLevel(1).label, "Bronze III");
  assert.equal(rankForLevel(17).label, "Gold III");
  assert.equal(rankForLevel(27).label, "Platinum III");
  assert.equal(rankForLevel(100).label, "Mythic III");
  assert.equal(rankForLevel(9999).label, "Mythic I");

  let previous = -1;
  for (let level = 1; level <= 200; level++) {
    const index = rankForLevel(level).index;
    assert.ok(index >= previous, `rank went backwards at level ${level}`);
    previous = index;
  }
});

test("long sessions earn less per minute", () => {
  assert.equal(effectiveMinutes(30), 30);
  assert.equal(effectiveMinutes(60), 30 + 30 * 0.8);
  assert.ok(effectiveMinutes(240) < 240 * 0.7);

  const short = award("strength_training", 30).attributeTotal;
  const long = award("strength_training", 120).attributeTotal;
  assert.ok(long < short * 4, "four times the minutes should not pay four times the XP");
});

test("payouts land near the values the design brief specifies", () => {
  // The brief's illustrative numbers (28 STR for a 65 minute lift) land within
  // a point of these once the duration tiers are applied.
  const lifting = award("strength_training", 65);
  assert.equal(lifting.attributes.strength, 29);
  assert.equal(lifting.attributes.discipline, 8);

  const running = award("running", 30);
  assert.equal(running.attributes.agility, 12);
  assert.equal(running.attributes.endurance, 14);

  const finance = award("finance_education", 30);
  assert.equal(finance.attributes.wisdom, 20);
  assert.equal(finance.attributes.discipline, 5);

  const pickleball = award("sport", 90);
  assert.equal(pickleball.attributes.agility, 24);
  assert.equal(pickleball.attributes.endurance, 12);
  assert.equal(pickleball.attributes.discipline, 5);
});

test("difficulty scales the payout but never the caps", () => {
  const standard = award("strength_training", 45);
  const brutal = award("strength_training", 45, { difficulty: "extreme" });
  const light = award("strength_training", 45, { difficulty: "easy" });

  assert.ok(brutal.attributes.strength > standard.attributes.strength);
  assert.ok(light.attributes.strength < standard.attributes.strength);

  const absurd = award("strength_training", 480, { difficulty: "extreme" });
  assert.ok(absurd.attributes.strength <= MAX_ATTRIBUTE_XP_PER_ACTIVITY);
  assert.ok(absurd.playerXp <= MAX_PLAYER_XP_PER_ACTIVITY);
});

test("daily fatigue and caps make farming pointless", () => {
  const fresh = award("strength_training", 60);
  const tired = award("strength_training", 60, {
    dailyEarned: { strength: DAILY_ATTRIBUTE_CAP.strength * 0.8 },
  });
  const spent = award("strength_training", 60, {
    dailyEarned: { strength: DAILY_ATTRIBUTE_CAP.strength },
  });

  assert.ok(tired.attributes.strength < fresh.attributes.strength);
  assert.equal(spent.attributes.strength, 0);
  assert.ok(spent.notes.some((note) => note.includes("cap")));

  // Ten maximum-effort sessions can never exceed the daily ceiling.
  let earned = 0;
  for (let i = 0; i < 10; i++) {
    earned += award("strength_training", 240, {
      difficulty: "extreme",
      dailyEarned: { strength: earned },
    }).attributes.strength;
  }
  assert.ok(
    earned <= DAILY_ATTRIBUTE_CAP.strength,
    `daily cap leaked: ${earned} > ${DAILY_ATTRIBUTE_CAP.strength}`,
  );
});

test("zero-quality activities pay nothing", () => {
  const result = award("studying", 60, { quality: 0 });
  assert.equal(result.attributeTotal, 0);
  assert.equal(result.playerXp, 0);
});

test("the evaluator refuses to reward entertainment", () => {
  const burnouts = classifyWithRules({
    text: "I watched 30 minutes of car burnout videos",
    durationMinutes: 30,
  });
  assert.equal(burnouts.usefulness, "none");
  assert.equal(burnouts.quality, 0);

  const cocomelon = classifyWithRules({
    text: "Watched Cocomelon with the kids",
    durationMinutes: 45,
  });
  assert.equal(cocomelon.quality, 0);

  const scrolling = classifyWithRules({
    text: "Spent an hour scrolling TikTok, learned some stuff",
    durationMinutes: 60,
  });
  assert.equal(scrolling.quality, 0);
});

test("the evaluator rewards genuine learning", () => {
  const mortgages = classifyWithRules({
    text: "I watched a 45-minute video explaining how mortgages and compound interest work",
    durationMinutes: 45,
  });
  assert.equal(mortgages.activityType, "finance_education");
  assert.equal(mortgages.usefulness, "high");
  assert.equal(mortgages.quality, 1);

  const pickleball = classifyWithRules({
    text: "I practiced pickleball for 90 minutes",
    durationMinutes: 90,
  });
  assert.equal(pickleball.activityType, "sport");
  assert.equal(pickleball.quality, 1);

  const lifting = classifyWithRules({
    text: "Weight training — bench press and dips",
    durationMinutes: 60,
  });
  assert.equal(lifting.activityType, "strength_training");
});

test("vague claims of learning get partial credit at most", () => {
  const vague = classifyWithRules({
    text: "watched a video and learned something",
    durationMinutes: 40,
  });
  assert.ok(vague.quality < 1, "vague learning should not earn full credit");
});

test("attribute tiers advance without ever stalling", () => {
  assert.equal(attributeTier(0).tier, 1);
  assert.equal(attributeTier(99).tier, 1);
  assert.equal(attributeTier(100).tier, 2);

  let previous = 0;
  for (let xp = 0; xp < 60_000; xp += 137) {
    const tier = attributeTier(xp).tier;
    assert.ok(tier >= previous, "attribute tier went backwards");
    previous = tier;
  }
  assert.ok(previous > 30, "tiers grow far too slowly");
});
