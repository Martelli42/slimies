import type { ActivityRates } from "../activities";

export type Usefulness = "none" | "low" | "medium" | "high";

export type ClassificationInput = {
  /** Free text written by the user. */
  text: string;
  durationMinutes: number;
  /** Optional hint when the user already picked a category. */
  activityType?: string | null;
};

export type Classification = {
  /** Resolved activity type code from the catalogue. */
  activityType: string;
  /** Suggested short title for the activity. */
  title: string;
  /** Per-minute attribute rates the XP engine should use. */
  rates: ActivityRates;
  /** 0..1 multiplier applied to the whole payout. */
  quality: number;
  usefulness: Usefulness;
  /** Primary attribute this activity develops, if any. */
  primaryAttribute: string | null;
  /** Short explanation shown to the user. */
  reason: string;
  confidence: number;
  provider: "rules" | "openai";
};

export interface ActivityClassifier {
  readonly name: "rules" | "openai";
  classify(input: ClassificationInput): Promise<Classification>;
}
