/**
 * Rank tiers.
 *
 * Eight original tiers, each split into three divisions (III -> I). Purely a
 * function of level, so it never needs its own storage and can be recomputed
 * anywhere. Deliberately unlike any franchise's ranking language.
 */

export type RankTierKey =
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond"
  | "master"
  | "legend"
  | "mythic";

export type RankTier = {
  key: RankTierKey;
  label: string;
  /** Gradient stops used by the rank badge. */
  colors: [string, string];
  glow: string;
};

export const RANK_TIERS: Record<RankTierKey, RankTier> = {
  bronze: { key: "bronze", label: "Bronze", colors: ["#b87333", "#7a4a1d"], glow: "#c98a4b" },
  silver: { key: "silver", label: "Silver", colors: ["#dfe6ee", "#8c98a8"], glow: "#cfd8e3" },
  gold: { key: "gold", label: "Gold", colors: ["#ffd76e", "#c9942a"], glow: "#ffcf5c" },
  platinum: { key: "platinum", label: "Platinum", colors: ["#9ef0e0", "#3f9c93"], glow: "#7fe3d3" },
  diamond: { key: "diamond", label: "Diamond", colors: ["#8fd0ff", "#3b6df0"], glow: "#79c2ff" },
  master: { key: "master", label: "Master", colors: ["#c79bff", "#6b34d6"], glow: "#b385ff" },
  legend: { key: "legend", label: "Legend", colors: ["#ff9a6b", "#e02f5f"], glow: "#ff7a5c" },
  mythic: { key: "mythic", label: "Mythic", colors: ["#ff6fd8", "#4a2bff"], glow: "#ff7ae0" },
};

type RankStep = { tier: RankTierKey; division: 1 | 2 | 3; minLevel: number };

/**
 * Division 3 is the entry division of a tier, division 1 the highest — so the
 * ladder reads Bronze III -> Bronze II -> Bronze I -> Silver III ...
 */
export const RANK_LADDER: RankStep[] = [
  { tier: "bronze", division: 3, minLevel: 1 },
  { tier: "bronze", division: 2, minLevel: 4 },
  { tier: "bronze", division: 1, minLevel: 6 },
  { tier: "silver", division: 3, minLevel: 8 },
  { tier: "silver", division: 2, minLevel: 11 },
  { tier: "silver", division: 1, minLevel: 14 },
  { tier: "gold", division: 3, minLevel: 17 },
  { tier: "gold", division: 2, minLevel: 20 },
  { tier: "gold", division: 1, minLevel: 23 },
  { tier: "platinum", division: 3, minLevel: 27 },
  { tier: "platinum", division: 2, minLevel: 31 },
  { tier: "platinum", division: 1, minLevel: 35 },
  { tier: "diamond", division: 3, minLevel: 40 },
  { tier: "diamond", division: 2, minLevel: 45 },
  { tier: "diamond", division: 1, minLevel: 50 },
  { tier: "master", division: 3, minLevel: 56 },
  { tier: "master", division: 2, minLevel: 62 },
  { tier: "master", division: 1, minLevel: 68 },
  { tier: "legend", division: 3, minLevel: 75 },
  { tier: "legend", division: 2, minLevel: 83 },
  { tier: "legend", division: 1, minLevel: 91 },
  { tier: "mythic", division: 3, minLevel: 100 },
  { tier: "mythic", division: 2, minLevel: 115 },
  { tier: "mythic", division: 1, minLevel: 130 },
];

const ROMAN = { 1: "I", 2: "II", 3: "III" } as const;

export type Rank = {
  index: number;
  tier: RankTier;
  division: 1 | 2 | 3;
  /** e.g. "Gold III" */
  label: string;
  minLevel: number;
  /** Level at which the next rank unlocks, or null at the top of the ladder. */
  nextLevel: number | null;
  nextLabel: string | null;
};

export function rankForLevel(level: number): Rank {
  const lvl = Math.max(1, Math.floor(level));
  let index = 0;
  for (let i = 0; i < RANK_LADDER.length; i++) {
    if (lvl >= RANK_LADDER[i].minLevel) index = i;
  }
  const step = RANK_LADDER[index];
  const next = RANK_LADDER[index + 1] ?? null;
  return {
    index,
    tier: RANK_TIERS[step.tier],
    division: step.division,
    label: `${RANK_TIERS[step.tier].label} ${ROMAN[step.division]}`,
    minLevel: step.minLevel,
    nextLevel: next?.minLevel ?? null,
    nextLabel: next ? `${RANK_TIERS[next.tier].label} ${ROMAN[next.division]}` : null,
  };
}
