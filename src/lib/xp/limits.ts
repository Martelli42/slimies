import type { AttributeKey } from "../constants";

/**
 * Anti-farming limits.
 *
 * These are enforced twice: optimistically here (so the UI can explain the
 * reduction before you submit) and authoritatively inside the `award_activity`
 * database function, which clamps against the day's real totals inside a
 * transaction. The database always wins.
 */

/** Hard ceiling on attribute XP a single submission can pay out. */
export const MAX_ATTRIBUTE_XP_PER_ACTIVITY = 60;

/** Hard ceiling on player XP a single submission can pay out. */
export const MAX_PLAYER_XP_PER_ACTIVITY = 60;

/** Attribute XP a single day can produce, per attribute, from activities. */
export const DAILY_ATTRIBUTE_CAP: Record<AttributeKey, number> = {
  strength: 110,
  agility: 110,
  wisdom: 110,
  discipline: 90,
  endurance: 110,
};

/** Player XP a single day can produce from activities (quests are separate). */
export const DAILY_PLAYER_XP_CAP = 260;

/** Maximum activities accepted per local day. */
export const MAX_ACTIVITIES_PER_DAY = 20;

/** Minimum seconds between two submissions. */
export const MIN_SECONDS_BETWEEN_SUBMISSIONS = 20;

/** How far back an activity may be backdated, in days. */
export const MAX_BACKDATE_DAYS = 7;

/** Tolerated clock skew for "now", in minutes. */
export const FUTURE_SKEW_MINUTES = 5;

export const MIN_DURATION_MINUTES = 1;

/**
 * Within a single activity, later minutes are worth less. Stops one enormous
 * eight-hour submission from out-earning a week of honest work.
 */
export const DURATION_TIERS: { upToMinutes: number; multiplier: number }[] = [
  { upToMinutes: 30, multiplier: 1 },
  { upToMinutes: 60, multiplier: 0.8 },
  { upToMinutes: 90, multiplier: 0.6 },
  { upToMinutes: Infinity, multiplier: 0.45 },
];

/**
 * Across a day, an attribute's payout fades as it approaches its cap:
 * roughly "first hour 100%, second 70%, third 45%, then nothing".
 */
export const DAILY_FATIGUE_TIERS: { upToCapRatio: number; multiplier: number }[] = [
  { upToCapRatio: 0.5, multiplier: 1 },
  { upToCapRatio: 0.75, multiplier: 0.7 },
  { upToCapRatio: 1, multiplier: 0.45 },
];

/** Player XP is a fraction of the attribute XP an activity produced. */
export const PLAYER_XP_RATIO = 0.6;
