/**
 * Global brand + domain constants.
 *
 * ASCENDANT is an original product. Nothing here references or reuses any
 * third-party franchise's artwork, naming, or rank terminology.
 */

export const APP_NAME = "ASCENDANT";
export const APP_TAGLINE = "Level up your real life";
export const APP_DESCRIPTION =
  "Turn your workouts, your knowledge and your discipline into a character sheet. Log real-world activities, earn XP, raise your attributes and climb the ranks with friends.";

/** The five MVP attributes. Additional attributes can be appended later. */
export const ATTRIBUTE_KEYS = [
  "strength",
  "agility",
  "wisdom",
  "discipline",
  "endurance",
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export type AttributeMeta = {
  key: AttributeKey;
  code: "STR" | "AGI" | "WIS" | "DSC" | "END";
  label: string;
  blurb: string;
  /** CSS custom-property name defined in globals.css. */
  cssVar: string;
  /** Fallback hex, used for inline SVG fills where var() is inconvenient. */
  hex: string;
  /** Column name on `profiles` / `activities` / `xp_ledger`. */
  column: `${AttributeKey}_xp`;
};

export const ATTRIBUTES: Record<AttributeKey, AttributeMeta> = {
  strength: {
    key: "strength",
    code: "STR",
    label: "Strength",
    blurb: "Raw physical force — lifting, resistance work, hard labour.",
    cssVar: "--attr-strength",
    hex: "#ff4d6d",
    column: "strength_xp",
  },
  agility: {
    key: "agility",
    code: "AGI",
    label: "Agility",
    blurb: "Speed, coordination and athletic skill.",
    cssVar: "--attr-agility",
    hex: "#3ddc97",
    column: "agility_xp",
  },
  wisdom: {
    key: "wisdom",
    code: "WIS",
    label: "Wisdom",
    blurb: "Knowledge that measurably improves your life or career.",
    cssVar: "--attr-wisdom",
    hex: "#4ea8ff",
    column: "wisdom_xp",
  },
  discipline: {
    key: "discipline",
    code: "DSC",
    label: "Discipline",
    blurb: "Showing up when motivation does not.",
    cssVar: "--attr-discipline",
    hex: "#b07bff",
    column: "discipline_xp",
  },
  endurance: {
    key: "endurance",
    code: "END",
    label: "Endurance",
    blurb: "Stamina under sustained load.",
    cssVar: "--attr-endurance",
    hex: "#ffab47",
    column: "endurance_xp",
  },
};

export const ATTRIBUTE_LIST: AttributeMeta[] = ATTRIBUTE_KEYS.map(
  (k) => ATTRIBUTES[k],
);

/** Empty attribute bag — handy starting point for accumulators. */
export function zeroAttributes(): Record<AttributeKey, number> {
  return { strength: 0, agility: 0, wisdom: 0, discipline: 0, endurance: 0 };
}

export const DIFFICULTIES = [
  { value: "easy", label: "Light", multiplier: 0.85, blurb: "Low effort" },
  { value: "moderate", label: "Standard", multiplier: 1, blurb: "Normal effort" },
  { value: "hard", label: "Hard", multiplier: 1.2, blurb: "Genuinely tough" },
  { value: "extreme", label: "Brutal", multiplier: 1.4, blurb: "Near your limit" },
] as const;

export type Difficulty = (typeof DIFFICULTIES)[number]["value"];

export const DIFFICULTY_VALUES = DIFFICULTIES.map((d) => d.value) as Difficulty[];

export function difficultyMultiplier(d: Difficulty): number {
  return DIFFICULTIES.find((x) => x.value === d)?.multiplier ?? 1;
}

/** Onboarding goals. Used to bias daily quest generation. */
export const GOALS = [
  { value: "stronger", label: "Become stronger", attribute: "strength" },
  { value: "lose_weight", label: "Lose weight", attribute: "endurance" },
  { value: "athletic", label: "Become more athletic", attribute: "agility" },
  { value: "learn", label: "Learn more", attribute: "wisdom" },
  { value: "finances", label: "Improve my finances", attribute: "wisdom" },
  { value: "disciplined", label: "Become more disciplined", attribute: "discipline" },
  { value: "career", label: "Improve career skills", attribute: "wisdom" },
  { value: "habits", label: "Build better habits", attribute: "discipline" },
] as const;

export type GoalValue = (typeof GOALS)[number]["value"];
export const GOAL_VALUES = GOALS.map((g) => g.value) as GoalValue[];
