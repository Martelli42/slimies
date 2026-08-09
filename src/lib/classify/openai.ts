import { ACTIVITY_TYPE_CODES, ACTIVITY_TYPE_MAP } from "../activities";
import { classifyWithRules, primaryAttributeOf, qualityFor } from "./rules";
import type {
  ActivityClassifier,
  Classification,
  ClassificationInput,
  Usefulness,
} from "./types";

/**
 * LLM-backed evaluator.
 *
 * Enabled automatically when OPENAI_API_KEY is present. It only ever chooses a
 * *category* and a *usefulness rating* — the XP itself is still computed by the
 * engine from the catalogue rates, so a compromised or hallucinating model can
 * never mint XP.
 *
 * Any failure falls back to the rule-based classifier rather than blocking a
 * submission.
 */

const SYSTEM_PROMPT = `You evaluate real-world self-improvement activities for an RPG progression app.

Given a user's description, decide:
1. Which activity category it belongs to (from the provided list).
2. How much genuine progression value it has.

Rate usefulness as one of: none, low, medium, high.

Rules you must follow:
- Physical training, sport and deliberate practice are genuine progression.
- Educational value requires a real subject that improves knowledge, career,
  finances, health, decision-making or a concrete skill.
- Passive entertainment has NO value even if the user calls it learning:
  cartoons, memes, short-form scrolling, reaction videos, reality TV,
  celebrity content, random clips. Rate these "none".
- Do not reward vague claims. "I learned some stuff" with no subject is "low".
- Be fair: a documentary on economics or an audiobook on nutrition is "high".

Respond with JSON only.`;

type OpenAIResponse = {
  activity_type?: string;
  usefulness?: string;
  title?: string;
  reason?: string;
  confidence?: number;
};

export class OpenAIClassifier implements ActivityClassifier {
  readonly name = "openai" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.OPENAI_MODEL || "gpt-4o-mini",
  ) {}

  async classify(input: ClassificationInput): Promise<Classification> {
    const fallback = classifyWithRules(input);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                `Categories: ${ACTIVITY_TYPE_CODES.join(", ")}`,
                `Duration: ${input.durationMinutes} minutes`,
                input.activityType ? `User-selected category: ${input.activityType}` : "",
                `Description: ${input.text}`,
                `Respond as {"activity_type": string, "usefulness": "none"|"low"|"medium"|"high", "title": string, "reason": string, "confidence": number}`,
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
        }),
      });

      clearTimeout(timeout);
      if (!res.ok) return fallback;

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const raw = json.choices?.[0]?.message?.content;
      if (!raw) return fallback;

      const parsed = JSON.parse(raw) as OpenAIResponse;
      const activityType =
        parsed.activity_type && ACTIVITY_TYPE_MAP[parsed.activity_type]
          ? parsed.activity_type
          : fallback.activityType;
      const usefulness = normaliseUsefulness(parsed.usefulness) ?? fallback.usefulness;
      const type = ACTIVITY_TYPE_MAP[activityType];

      return {
        activityType,
        title: (parsed.title || fallback.title).slice(0, 80),
        rates: usefulness === "none" ? {} : (type?.rates ?? {}),
        quality: qualityFor(usefulness),
        usefulness,
        primaryAttribute: usefulness === "none" ? null : primaryAttributeOf(activityType),
        reason:
          (parsed.reason || fallback.reason).slice(0, 240) ||
          "No meaningful skill progression detected.",
        confidence: clampConfidence(parsed.confidence ?? 0.7),
        provider: "openai",
      };
    } catch {
      return fallback;
    }
  }
}

function normaliseUsefulness(value: unknown): Usefulness | null {
  if (typeof value !== "string") return null;
  const v = value.toLowerCase().trim();
  return v === "none" || v === "low" || v === "medium" || v === "high" ? v : null;
}

function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0.7;
  return Math.min(1, Math.max(0, n));
}
