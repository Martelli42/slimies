import {
  ATTRIBUTE_KEYS,
  difficultyMultiplier,
  zeroAttributes,
  type AttributeKey,
  type Difficulty,
} from "../constants";
import type { ActivityRates } from "../activities";
import {
  DAILY_ATTRIBUTE_CAP,
  DAILY_FATIGUE_TIERS,
  DAILY_PLAYER_XP_CAP,
  DURATION_TIERS,
  MAX_ATTRIBUTE_XP_PER_ACTIVITY,
  MAX_PLAYER_XP_PER_ACTIVITY,
  PLAYER_XP_RATIO,
} from "./limits";

/**
 * The XP engine.
 *
 * Pure functions only — no I/O, no framework imports. Everything the app knows
 * about "how much is this worth" lives here so it can be unit-tested, reused by
 * the API layer and previewed by the UI without duplicating rules.
 */

export type AttributeBag = Record<AttributeKey, number>;

export type AwardInput = {
  /** Per-minute base rates for the first 30 minutes at standard difficulty. */
  rates: ActivityRates;
  durationMinutes: number;
  difficulty: Difficulty;
  /**
   * 0..1 quality factor from the activity evaluator. 0 means the activity has
   * no meaningful progression value and pays nothing.
   */
  quality?: number;
  /** Attribute XP already earned today from activities. */
  dailyEarned?: Partial<AttributeBag>;
  /** Player XP already earned today from activities. */
  dailyPlayerXp?: number;
};

export type Award = {
  attributes: AttributeBag;
  playerXp: number;
  attributeTotal: number;
  /** Effective minutes after intra-activity diminishing returns. */
  effectiveMinutes: number;
  /** Human-readable explanations of any reduction that was applied. */
  notes: string[];
  cappedAttributes: AttributeKey[];
};

/**
 * Minutes re-weighted by the duration tiers: the first half hour counts fully,
 * later blocks progressively less.
 */
export function effectiveMinutes(durationMinutes: number): number {
  let remaining = Math.max(0, durationMinutes);
  let consumed = 0;
  let weighted = 0;
  for (const tier of DURATION_TIERS) {
    if (remaining <= 0) break;
    const span = tier.upToMinutes - consumed;
    const slice = Math.min(remaining, span);
    weighted += slice * tier.multiplier;
    remaining -= slice;
    consumed += slice;
  }
  return weighted;
}

/** Payout multiplier for an attribute given how much of it was earned today. */
export function dailyFatigueMultiplier(
  attribute: AttributeKey,
  earnedToday: number,
): number {
  const cap = DAILY_ATTRIBUTE_CAP[attribute];
  const ratio = cap > 0 ? earnedToday / cap : 1;
  for (const tier of DAILY_FATIGUE_TIERS) {
    if (ratio < tier.upToCapRatio) return tier.multiplier;
  }
  return 0;
}

/**
 * The core calculation. Deterministic, and never reads client-supplied XP.
 */
export function computeAward(input: AwardInput): Award {
  const quality = clamp01(input.quality ?? 1);
  const duration = Math.max(0, Math.round(input.durationMinutes));
  const minutes = effectiveMinutes(duration);
  const diff = difficultyMultiplier(input.difficulty);
  const earned = { ...zeroAttributes(), ...(input.dailyEarned ?? {}) };

  const attributes = zeroAttributes();
  const notes: string[] = [];
  const cappedAttributes: AttributeKey[] = [];

  if (duration > 90) {
    notes.push("Long-session diminishing returns applied.");
  }
  if (quality === 0) {
    notes.push("No meaningful skill progression detected.");
  } else if (quality < 1) {
    notes.push("Partial credit — limited progression value.");
  }

  for (const key of ATTRIBUTE_KEYS) {
    const rate = input.rates[key];
    if (!rate) continue;

    const base = rate * minutes * diff * quality;
    if (base <= 0) continue;

    const fatigue = dailyFatigueMultiplier(key, earned[key]);
    let value = Math.round(base * fatigue);

    if (fatigue === 0 && base > 0) {
      cappedAttributes.push(key);
    } else if (fatigue < 1 && base > 0) {
      notes.push(`${labelOf(key)} reduced — heavy training already logged today.`);
    }

    // Never exceed the per-activity ceiling…
    value = Math.min(value, MAX_ATTRIBUTE_XP_PER_ACTIVITY);
    // …nor push the day past its cap.
    const room = Math.max(0, DAILY_ATTRIBUTE_CAP[key] - earned[key]);
    if (value > room) {
      value = room;
      if (!cappedAttributes.includes(key)) cappedAttributes.push(key);
    }
    attributes[key] = value;
  }

  const attributeTotal = ATTRIBUTE_KEYS.reduce((sum, k) => sum + attributes[k], 0);

  let playerXp = Math.round(attributeTotal * PLAYER_XP_RATIO);
  playerXp = Math.min(playerXp, MAX_PLAYER_XP_PER_ACTIVITY);
  const playerRoom = Math.max(0, DAILY_PLAYER_XP_CAP - (input.dailyPlayerXp ?? 0));
  if (playerXp > playerRoom) {
    playerXp = playerRoom;
    notes.push("Daily player XP cap reached.");
  }

  for (const key of cappedAttributes) {
    notes.push(`Daily ${labelOf(key)} cap reached — no further XP today.`);
  }

  return {
    attributes,
    playerXp,
    attributeTotal,
    effectiveMinutes: minutes,
    notes: dedupe(notes),
    cappedAttributes,
  };
}

function labelOf(key: AttributeKey): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}

/** Sum of an attribute bag. */
export function attributeTotal(bag: Partial<AttributeBag>): number {
  return ATTRIBUTE_KEYS.reduce((sum, k) => sum + (bag[k] ?? 0), 0);
}
