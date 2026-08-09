import { z } from "zod";

import { ACTIVITY_TYPE_CODES } from "./activities";
import { DIFFICULTY_VALUES, GOAL_VALUES } from "./constants";
import { MAX_BACKDATE_DAYS } from "./xp/limits";

/**
 * Every API input is parsed through one of these. Note what is *absent*:
 * nothing here accepts an XP value. The server derives all rewards.
 */

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "At least 3 characters")
  .max(20, "At most 20 characters")
  .regex(/^[a-z0-9_]+$/, "Letters, numbers and underscores only");

export const timezoneSchema = z.string().trim().min(1).max(64).default("UTC");

export const activityInputSchema = z.object({
  activityType: z.enum(ACTIVITY_TYPE_CODES as [string, ...string[]]),
  title: z.string().trim().max(80).optional(),
  description: z.string().trim().max(600).optional(),
  durationMinutes: z.coerce.number().int().min(1).max(480),
  difficulty: z.enum(DIFFICULTY_VALUES as [string, ...string[]]).default("moderate"),
  occurredAt: z
    .string()
    .datetime({ offset: true })
    .default(() => new Date().toISOString()),
  proofUrl: z.string().url().max(500).optional().nullable(),
  timezone: timezoneSchema,
});

export type ActivityInput = z.infer<typeof activityInputSchema>;

export const classifyInputSchema = z.object({
  text: z.string().trim().min(3).max(600),
  durationMinutes: z.coerce.number().int().min(1).max(480),
  activityType: z.string().max(40).optional().nullable(),
});

export const onboardingSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(40),
  goals: z.array(z.enum(GOAL_VALUES as [string, ...string[]])).max(8).default([]),
  timezone: timezoneSchema,
  avatarUrl: z.string().url().max(500).optional().nullable(),
});

export const friendCodeSchema = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[A-Za-z0-9_-]+$/, "Friend codes look like NOVA-7F92");

export const friendActionSchema = z.object({
  requestId: z.string().uuid().optional(),
  friendId: z.string().uuid().optional(),
  accept: z.boolean().optional(),
});

export const customQuestSchema = z.object({
  title: z.string().trim().min(2).max(60),
  activityType: z.enum(ACTIVITY_TYPE_CODES as [string, ...string[]]).optional().nullable(),
  targetMinutes: z.coerce.number().int().min(5).max(240),
  cadence: z.enum(["daily", "weekly", "specific_days", "once"]).default("daily"),
  daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
});

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(40).optional(),
  bio: z.string().trim().max(200).optional().nullable(),
  avatarUrl: z.string().url().max(500).optional().nullable(),
  timezone: timezoneSchema.optional(),
  privacy: z
    .object({
      profile: z.enum(["public", "friends"]),
      activity: z.boolean(),
      stats: z.boolean(),
      leaderboards: z.boolean(),
    })
    .partial()
    .optional(),
});

export const settingsSchema = z.object({
  notify_daily_quests: z.boolean().optional(),
  notify_streak_risk: z.boolean().optional(),
  notify_friend_activity: z.boolean().optional(),
  notify_leaderboard: z.boolean().optional(),
  notify_achievements: z.boolean().optional(),
  notify_weekly_report: z.boolean().optional(),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(600),
  keys: z.object({
    p256dh: z.string().min(10).max(300),
    auth: z.string().min(4).max(200),
  }),
});

export const leaderboardQuerySchema = z.object({
  scope: z.enum(["friends", "global"]).default("friends"),
  metric: z
    .enum([
      "weekly",
      "monthly",
      "level",
      "strength",
      "agility",
      "wisdom",
      "discipline",
      "endurance",
      "streak",
    ])
    .default("weekly"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Human-readable bounds shared with the UI. */
export const LIMITS = {
  maxBackdateDays: MAX_BACKDATE_DAYS,
};
