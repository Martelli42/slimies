import { getActivityType } from "../activities";
import { OpenAIClassifier } from "./openai";
import { RuleBasedClassifier } from "./rules";
import type { ActivityClassifier, Classification, ClassificationInput } from "./types";

export * from "./types";
export { classifyWithRules } from "./rules";

let cached: ActivityClassifier | null = null;

/**
 * Returns the active evaluator. Swap in another provider here — nothing else
 * in the app knows or cares which implementation is running.
 */
export function getClassifier(): ActivityClassifier {
  if (cached) return cached;
  const key = process.env.OPENAI_API_KEY;
  cached = key ? new OpenAIClassifier(key) : new RuleBasedClassifier();
  return cached;
}

/**
 * Resolve the rates + quality for a submission.
 *
 * A catalogue activity with a plain description is trusted as-is; anything
 * free-form, or a category whose payout depends on content, goes through the
 * evaluator first.
 */
export async function resolveActivity(
  input: ClassificationInput,
): Promise<Classification> {
  const type = input.activityType ? getActivityType(input.activityType) : undefined;
  const hasText = (input.text ?? "").trim().length > 0;

  if (type && !type.evaluated) {
    return {
      activityType: type.code,
      title: type.label,
      rates: type.rates,
      quality: 1,
      usefulness: "high",
      primaryAttribute: null,
      reason: `${type.label} logged.`,
      confidence: 1,
      provider: "rules",
    };
  }

  if (type && type.evaluated && !hasText && type.code !== "custom") {
    // A picked category with no description still earns, but conservatively:
    // we have no evidence of what was actually studied.
    return {
      activityType: type.code,
      title: type.label,
      rates: type.rates,
      quality: 0.75,
      usefulness: "medium",
      primaryAttribute: null,
      reason: "Logged without detail — add a description for full credit.",
      confidence: 0.5,
      provider: "rules",
    };
  }

  return getClassifier().classify(input);
}

export type { Classification };
