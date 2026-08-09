/**
 * The level curve.
 *
 * Single source of truth for progression. The database does NOT re-implement
 * this maths — `scripts/generate-level-curve.mjs` renders the same table into
 * `supabase/migrations/0002_level_curve.sql`, so SQL and TypeScript can never
 * drift apart. Run `npm run curve:check` to verify they still agree.
 *
 * Shape: a power curve with an early-game boost so the first handful of levels
 * come quickly (100 -> 155 -> 200 XP) and later levels settle into a steady,
 * grindable slope instead of exploding exponentially.
 *
 *   requirement(L) = round5( A * L^P * (1 + BOOST * e^(-(L-1)/TAU)) )
 *
 * There is no maximum level: past MAX_TABLE_LEVEL the same formula keeps
 * evaluating, the table is only a precomputed cache.
 */

export const CURVE = {
  A: 74,
  P: 0.72,
  BOOST: 0.35,
  TAU: 5,
  /** Requirements are rounded to this step so numbers stay readable. */
  ROUND_TO: 5,
} as const;

/** Levels precomputed into the DB cache table. */
export const MAX_TABLE_LEVEL = 500;

const roundTo = (x: number, step: number) => Math.round(x / step) * step;

/** XP required to advance from `level` to `level + 1`. */
export function xpRequiredForLevel(level: number): number {
  const L = Math.max(1, Math.floor(level));
  const raw =
    CURVE.A *
    Math.pow(L, CURVE.P) *
    (1 + CURVE.BOOST * Math.exp(-(L - 1) / CURVE.TAU));
  return roundTo(raw, CURVE.ROUND_TO);
}

const cumulativeCache: number[] = [0, 0];

/** Total lifetime XP needed to *reach* `level` (level 1 costs nothing). */
export function totalXpForLevel(level: number): number {
  const target = Math.max(1, Math.floor(level));
  while (cumulativeCache.length <= target) {
    const L = cumulativeCache.length - 1;
    cumulativeCache.push(cumulativeCache[L] + xpRequiredForLevel(L));
  }
  return cumulativeCache[target];
}

export type LevelProgress = {
  level: number;
  /** XP accumulated inside the current level. */
  intoLevel: number;
  /** XP needed to finish the current level. */
  required: number;
  /** 0..1 */
  ratio: number;
  totalXp: number;
};

/** Resolve a lifetime XP total into a level and in-level progress. */
export function levelFromTotalXp(totalXp: number): LevelProgress {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  // Grow the cache until the next level is out of reach.
  while (totalXpForLevel(level + 1) <= xp) {
    level += 1;
    // Hard stop guards against pathological input; the curve itself is unbounded.
    if (level > 100_000) break;
  }
  const base = totalXpForLevel(level);
  const required = xpRequiredForLevel(level);
  const intoLevel = xp - base;
  return {
    level,
    intoLevel,
    required,
    ratio: required > 0 ? Math.min(1, intoLevel / required) : 0,
    totalXp: xp,
  };
}

/** Rows for the generated SQL cache table. */
export function levelCurveRows(max = MAX_TABLE_LEVEL) {
  const rows: { level: number; xpRequired: number; cumulativeXp: number }[] = [];
  for (let level = 1; level <= max; level++) {
    rows.push({
      level,
      xpRequired: xpRequiredForLevel(level),
      cumulativeXp: totalXpForLevel(level),
    });
  }
  return rows;
}
