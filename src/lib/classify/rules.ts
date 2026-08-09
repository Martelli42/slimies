import { ACTIVITY_TYPE_MAP, getActivityType } from "../activities";
import type {
  ActivityClassifier,
  Classification,
  ClassificationInput,
  Usefulness,
} from "./types";

/**
 * Rule-based activity evaluator.
 *
 * This is the default implementation and the safety net behind the LLM one: if
 * the model is unavailable or returns nonsense, the app still classifies
 * sensibly and deterministically. It is deliberately sceptical — describing
 * something as "learning" is not enough, the text has to point at a subject
 * that plausibly builds a skill, body or understanding.
 */

type Rule = { type: string; keywords: string[] };

const RULES: Rule[] = [
  {
    type: "strength_training",
    keywords: [
      "weight training", "weightlifting", "lifted weights", "lifting", "barbell",
      "dumbbell", "bench press", "squat", "deadlift", "overhead press", "gym session",
      "strength workout", "resistance training", "hypertrophy", "powerlifting", "leg day",
      "chest day", "back day", "arms day", "kettlebell",
    ],
  },
  {
    type: "calisthenics",
    keywords: [
      "push-up", "pushup", "push ups", "pull-up", "pullup", "pull ups", "chin-up",
      "dips", "bodyweight", "calisthenics", "burpees", "plank",
    ],
  },
  {
    type: "running",
    keywords: [
      "run", "ran ", "running", "jog", "sprint", "5k", "10k", "half marathon",
      "marathon", "treadmill", "track workout", "intervals",
    ],
  },
  {
    type: "walking",
    keywords: ["walk", "walking", "steps", "rucking", "ruck", "stroll", "hiked around town"],
  },
  {
    type: "cycling",
    keywords: ["cycling", "cycle", "biking", "bike ride", "rode my bike", "peloton", "spin class"],
  },
  {
    type: "swimming",
    keywords: ["swim", "swimming", "laps in the pool", "open water"],
  },
  {
    type: "hiking",
    keywords: ["hike", "hiking", "trail", "trek", "summit", "backpacking"],
  },
  {
    type: "sport",
    keywords: [
      "pickleball", "basketball", "soccer", "football", "tennis", "volleyball",
      "badminton", "hockey", "baseball", "golf", "padel", "squash", "rugby",
      "cricket", "ultimate frisbee", "skateboard", "surfing", "climbing", "bouldering",
    ],
  },
  {
    type: "martial_arts",
    keywords: [
      "boxing", "bjj", "jiu-jitsu", "jiu jitsu", "judo", "karate", "muay thai",
      "mma", "wrestling", "sparring", "taekwondo", "kickboxing", "grappling",
    ],
  },
  {
    type: "mobility",
    keywords: ["yoga", "stretching", "stretched", "mobility", "pilates", "foam roll"],
  },
  {
    type: "finance_education",
    keywords: [
      "finance", "financial", "investing", "investment", "mortgage", "compound interest",
      "stock market", "stocks", "budgeting", "budget", "taxes", "retirement", "401k",
      "index fund", "etf", "economics", "accounting", "real estate", "personal finance",
      "bonds", "interest rates", "credit score",
    ],
  },
  {
    type: "programming",
    keywords: [
      "programming", "coding", "wrote code", "leetcode", "algorithm", "typescript",
      "javascript", "python", "rust", "golang", "react", "sql", "database", "debugging",
      "software engineering", "system design", "api", "refactor",
    ],
  },
  {
    type: "career_learning",
    keywords: [
      "career", "certification", "interview prep", "resume", "sales training",
      "management training", "leadership", "public speaking", "negotiation",
      "marketing course", "business course", "product management", "project management",
      "professional development", "licensing exam",
    ],
  },
  {
    type: "language_learning",
    keywords: [
      "spanish", "french", "german", "japanese", "mandarin", "chinese", "korean",
      "italian", "portuguese", "arabic", "duolingo", "vocabulary", "learning a language",
      "language practice", "conjugation",
    ],
  },
  {
    type: "studying",
    keywords: [
      "studied", "studying", "course", "lecture", "class", "exam", "homework",
      "university", "revision", "tutorial", "documentary", "science", "history",
      "biology", "chemistry", "physics", "psychology", "statistics", "mathematics",
      "math", "engineering", "medicine", "anatomy", "law", "philosophy",
    ],
  },
  {
    type: "reading",
    keywords: [
      "read", "reading", "book", "chapter", "pages", "textbook", "article",
      "essay", "whitepaper", "research paper", "biography",
    ],
  },
  {
    type: "meditation",
    keywords: ["meditat", "mindfulness", "breathwork", "journaling", "journalled", "journaled"],
  },
  {
    type: "deep_work",
    keywords: [
      "deep work", "focus session", "difficult task", "task i've been avoiding",
      "task i have been avoiding", "procrastinating", "paperwork", "admin work",
      "cleaned", "chores", "organised", "organized", "inbox zero",
    ],
  },
];

/** Things that are entertainment, not progression. These pay nothing. */
const NO_VALUE_PATTERNS: string[] = [
  "cocomelon", "cartoon", "burnout video", "car burnout", "meme", "memes",
  "tiktok", "doomscroll", "doom scroll", "scrolling", "instagram", "reels",
  "youtube shorts", "netflix", "reality tv", "sitcom", "soap opera", "gossip",
  "celebrity", "binge watched", "binge-watched", "twitch stream", "random videos",
  "prank video", "compilation video", "reaction video", "gambling", "slots",
  "sports betting", "shopping haul", "unboxing",
];

/** Words that claim value without demonstrating it. */
const VAGUE_LEARNING_PATTERNS = [
  "learned stuff", "learned things", "watched a video", "watched videos",
  "watched some videos", "learning", "learned something", "educational content",
  "self improvement", "researched",
];

/** Weight the user's chosen category carries when picking a type. */
const HINT_WEIGHT = 6;

/**
 * Keyword score at which a description counts as naming a real subject rather
 * than gesturing at one. Two solid topic words clear it; "I learned things"
 * never does.
 */
const SUBJECT_EVIDENCE = 4;

const MIND_TYPES = new Set([
  "studying", "reading", "finance_education", "programming",
  "career_learning", "language_learning",
]);

export class RuleBasedClassifier implements ActivityClassifier {
  readonly name = "rules" as const;

  async classify(input: ClassificationInput): Promise<Classification> {
    return classifyWithRules(input);
  }
}

export function classifyWithRules(input: ClassificationInput): Classification {
  const text = (input.text ?? "").toLowerCase();
  const hinted = input.activityType && input.activityType !== "custom"
    ? getActivityType(input.activityType)
    : undefined;

  const blocked = NO_VALUE_PATTERNS.find((p) => text.includes(p));

  // Score every rule; longer keyword matches are stronger evidence.
  const keywordScores = new Map<string, number>();
  for (const rule of RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (text.includes(kw)) score += Math.max(1, Math.round(kw.length / 4));
    }
    if (score > 0) keywordScores.set(rule.type, score);
  }

  // The user's chosen category breaks ties, but it is not *evidence* — a
  // picked category with an empty description must not read as a real subject.
  const scores = new Map(keywordScores);
  if (hinted) {
    scores.set(hinted.code, (scores.get(hinted.code) ?? 0) + HINT_WEIGHT);
  }

  let bestType = "";
  let bestScore = 0;
  for (const [type, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  if (!bestType) {
    return {
      activityType: "custom",
      title: titleFrom(input.text) || "Unclassified activity",
      rates: {},
      quality: 0,
      usefulness: "none",
      primaryAttribute: null,
      reason:
        "Could not identify a physical, educational or discipline-building activity in that description. Add more detail about what you actually did.",
      confidence: 0.3,
      provider: "rules",
    };
  }

  const type = ACTIVITY_TYPE_MAP[bestType];
  const isMind = MIND_TYPES.has(bestType);
  const evidence = keywordScores.get(bestType) ?? 0;

  if (blocked) {
    return {
      activityType: bestType,
      title: titleFrom(input.text) || type.label,
      rates: {},
      quality: 0,
      usefulness: "none",
      primaryAttribute: null,
      reason: "No meaningful skill progression detected — this reads as entertainment.",
      confidence: 0.85,
      provider: "rules",
    };
  }

  let usefulness: Usefulness = "high";
  let reason = `Recognised as ${type.label.toLowerCase()}.`;

  if (isMind) {
    const vagueOnly =
      VAGUE_LEARNING_PATTERNS.some((p) => text.includes(p)) && evidence < SUBJECT_EVIDENCE;
    const subjectSignal = evidence >= SUBJECT_EVIDENCE;
    if (vagueOnly && !subjectSignal) {
      usefulness = "low";
      reason =
        "Described as learning, but no concrete subject was identified. Partial credit only — say what you studied.";
    } else if (!subjectSignal) {
      usefulness = "medium";
      reason = `Plausible ${type.label.toLowerCase()}, though the description is thin.`;
    } else {
      usefulness = "high";
      reason = `Clear ${type.label.toLowerCase()} with real skill or knowledge value.`;
    }
  }

  const quality = qualityFor(usefulness);

  return {
    activityType: bestType,
    title: titleFrom(input.text) || type.label,
    rates: type.rates,
    quality,
    usefulness,
    primaryAttribute: primaryAttributeOf(bestType),
    reason,
    confidence: Math.min(0.95, 0.45 + bestScore / 30),
    provider: "rules",
  };
}

export function qualityFor(usefulness: Usefulness): number {
  switch (usefulness) {
    case "high":
      return 1;
    case "medium":
      return 0.75;
    case "low":
      return 0.4;
    default:
      return 0;
  }
}

export function primaryAttributeOf(activityType: string): string | null {
  const type = ACTIVITY_TYPE_MAP[activityType];
  if (!type) return null;
  let best: string | null = null;
  let bestRate = 0;
  for (const [key, rate] of Object.entries(type.rates)) {
    if ((rate ?? 0) > bestRate) {
      bestRate = rate ?? 0;
      best = key;
    }
  }
  return best;
}

function titleFrom(text: string): string {
  const clean = (text ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return "";
  const firstSentence = clean.split(/[.!?\n]/)[0] ?? clean;
  const trimmed = firstSentence.slice(0, 60);
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
