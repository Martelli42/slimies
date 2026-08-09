import type { AttributeKey } from "./constants";

/**
 * Activity catalogue.
 *
 * `rates` are XP per minute for the first 30 minutes of an activity at
 * standard difficulty, before any diminishing returns. They are the *only*
 * place per-minute payouts are defined; the XP engine composes everything else
 * from them.
 */
export type ActivityRates = Partial<Record<AttributeKey, number>>;

export type ActivityType = {
  code: string;
  label: string;
  /** Grouping used by the picker UI. */
  group: "physical" | "mind" | "other";
  icon: string;
  blurb: string;
  rates: ActivityRates;
  /** Sanity ceiling on a single submission, in minutes. */
  maxMinutes: number;
  /**
   * When true the activity's payout depends on what the user actually did, so
   * the description is run through the classifier before XP is awarded.
   */
  evaluated?: boolean;
};

export const ACTIVITY_TYPES: ActivityType[] = [
  {
    code: "strength_training",
    label: "Strength Training",
    group: "physical",
    icon: "dumbbell",
    blurb: "Weights, resistance work, heavy compound lifts.",
    rates: { strength: 0.5, discipline: 0.14, endurance: 0.05 },
    maxMinutes: 240,
  },
  {
    code: "calisthenics",
    label: "Calisthenics",
    group: "physical",
    icon: "pushup",
    blurb: "Push-ups, pull-ups, dips, bodyweight circuits.",
    rates: { strength: 0.42, agility: 0.06, discipline: 0.14, endurance: 0.1 },
    maxMinutes: 180,
  },
  {
    code: "running",
    label: "Running",
    group: "physical",
    icon: "run",
    blurb: "Jogging, tempo runs, sprints, intervals.",
    rates: { agility: 0.4, endurance: 0.45, discipline: 0.2 },
    maxMinutes: 300,
  },
  {
    code: "walking",
    label: "Walking",
    group: "physical",
    icon: "walk",
    blurb: "Steps, rucking, an intentional long walk.",
    rates: { agility: 0.06, endurance: 0.14, discipline: 0.1 },
    maxMinutes: 300,
  },
  {
    code: "cycling",
    label: "Cycling",
    group: "physical",
    icon: "bike",
    blurb: "Road, trail or stationary riding.",
    rates: { agility: 0.1, endurance: 0.4, discipline: 0.16 },
    maxMinutes: 360,
  },
  {
    code: "swimming",
    label: "Swimming",
    group: "physical",
    icon: "swim",
    blurb: "Laps, open water, water conditioning.",
    rates: { strength: 0.1, agility: 0.14, endurance: 0.42, discipline: 0.18 },
    maxMinutes: 240,
  },
  {
    code: "hiking",
    label: "Hiking",
    group: "physical",
    icon: "mountain",
    blurb: "Trails, elevation, long time on feet.",
    rates: { strength: 0.08, agility: 0.06, endurance: 0.38, discipline: 0.16 },
    maxMinutes: 480,
  },
  {
    code: "sport",
    label: "Sport",
    group: "physical",
    icon: "ball",
    blurb: "Pickleball, basketball, soccer, tennis, team play.",
    rates: { strength: 0.06, agility: 0.33, endurance: 0.17, discipline: 0.07 },
    maxMinutes: 300,
  },
  {
    code: "martial_arts",
    label: "Martial Arts",
    group: "physical",
    icon: "fist",
    blurb: "Striking, grappling, sparring, technical drilling.",
    rates: { strength: 0.18, agility: 0.34, endurance: 0.18, discipline: 0.16 },
    maxMinutes: 240,
  },
  {
    code: "mobility",
    label: "Mobility & Yoga",
    group: "physical",
    icon: "stretch",
    blurb: "Stretching, mobility work, recovery flows.",
    rates: { agility: 0.16, endurance: 0.1, discipline: 0.18 },
    maxMinutes: 180,
  },
  {
    code: "studying",
    label: "Studying",
    group: "mind",
    icon: "book",
    blurb: "Coursework, structured study, exam prep.",
    rates: { wisdom: 0.6, discipline: 0.16 },
    maxMinutes: 300,
    evaluated: true,
  },
  {
    code: "reading",
    label: "Reading",
    group: "mind",
    icon: "pages",
    blurb: "Non-fiction, technical or skill-building reading.",
    rates: { wisdom: 0.55, discipline: 0.14 },
    maxMinutes: 300,
    evaluated: true,
  },
  {
    code: "finance_education",
    label: "Finance Education",
    group: "mind",
    icon: "chart",
    blurb: "Investing fundamentals, budgeting, financial literacy.",
    rates: { wisdom: 0.67, discipline: 0.17 },
    maxMinutes: 240,
    evaluated: true,
  },
  {
    code: "programming",
    label: "Programming",
    group: "mind",
    icon: "code",
    blurb: "Building, debugging, deliberate practice.",
    rates: { wisdom: 0.62, discipline: 0.16 },
    maxMinutes: 360,
    evaluated: true,
  },
  {
    code: "career_learning",
    label: "Career Learning",
    group: "mind",
    icon: "briefcase",
    blurb: "Professional skills, certifications, craft improvement.",
    rates: { wisdom: 0.6, discipline: 0.16 },
    maxMinutes: 300,
    evaluated: true,
  },
  {
    code: "language_learning",
    label: "Language Learning",
    group: "mind",
    icon: "globe",
    blurb: "Vocabulary, grammar, speaking practice.",
    rates: { wisdom: 0.58, discipline: 0.16 },
    maxMinutes: 240,
    evaluated: true,
  },
  {
    code: "meditation",
    label: "Meditation",
    group: "mind",
    icon: "spark",
    blurb: "Focused breathing, stillness, mental training.",
    rates: { wisdom: 0.1, discipline: 0.34 },
    maxMinutes: 120,
  },
  {
    code: "deep_work",
    label: "Deep Work",
    group: "mind",
    icon: "target",
    blurb: "The hard task you have been avoiding, done properly.",
    rates: { wisdom: 0.3, discipline: 0.4 },
    maxMinutes: 240,
  },
  {
    code: "custom",
    label: "Something Else",
    group: "other",
    icon: "quill",
    blurb: "Describe it and the system will evaluate it for you.",
    rates: {},
    maxMinutes: 300,
    evaluated: true,
  },
];

export const ACTIVITY_TYPE_MAP: Record<string, ActivityType> = Object.fromEntries(
  ACTIVITY_TYPES.map((t) => [t.code, t]),
);

export const ACTIVITY_TYPE_CODES = ACTIVITY_TYPES.map((t) => t.code);

export function getActivityType(code: string): ActivityType | undefined {
  return ACTIVITY_TYPE_MAP[code];
}

export const ACTIVITY_GROUPS: {
  key: ActivityType["group"];
  label: string;
}[] = [
  { key: "physical", label: "Body" },
  { key: "mind", label: "Mind" },
  { key: "other", label: "Other" },
];
