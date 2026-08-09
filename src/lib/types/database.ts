import type { AttributeKey, Difficulty } from "../constants";

/**
 * Hand-maintained database types.
 *
 * Kept deliberately small: only the tables the client and route handlers read
 * directly. Regenerate-from-Supabase is an option later, but a hand-written
 * version keeps the domain vocabulary (AttributeKey, Difficulty) instead of
 * widening everything to `string`.
 */

export type AttributeColumns = {
  strength_xp: number;
  agility_xp: number;
  wisdom_xp: number;
  discipline_xp: number;
  endurance_xp: number;
};

export type Privacy = {
  profile: "public" | "friends";
  activity: boolean;
  stats: boolean;
  leaderboards: boolean;
};

export type Profile = AttributeColumns & {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  friend_code: string;
  bio: string | null;
  timezone: string;
  goals: string[];
  level: number;
  total_xp: number;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  streak_shields: number;
  activities_count: number;
  total_minutes: number;
  onboarded: boolean;
  privacy: Privacy;
  created_at: string;
  updated_at: string;
};

export type UserSettings = {
  user_id: string;
  notify_daily_quests: boolean;
  notify_streak_risk: boolean;
  notify_friend_activity: boolean;
  notify_leaderboard: boolean;
  notify_achievements: boolean;
  notify_weekly_report: boolean;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
};

export type Activity = AttributeColumns & {
  id: string;
  user_id: string;
  activity_type: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  difficulty: Difficulty;
  occurred_at: string;
  local_date: string;
  xp_total: number;
  proof_url: string | null;
  classification: Record<string, unknown> | null;
  created_at: string;
};

export type QuestKind =
  | "physical_minutes"
  | "learning_minutes"
  | "activity_minutes"
  | "specific_type"
  | "activity_count"
  | "attribute_xp"
  | "manual"
  | "bonus";

export type QuestReward = Partial<Record<AttributeKey | "player", number>>;

export type DailyQuest = {
  id: string;
  user_id: string;
  quest_date: string;
  kind: QuestKind;
  title: string;
  description: string | null;
  attribute: AttributeKey | null;
  activity_type: string | null;
  target: number;
  progress: number;
  reward: QuestReward;
  completed: boolean;
  completed_at: string | null;
  is_bonus: boolean;
  custom_quest_id: string | null;
  sort_order: number;
  created_at: string;
};

export type CustomQuest = {
  id: string;
  user_id: string;
  title: string;
  activity_type: string | null;
  attribute: AttributeKey | null;
  target_minutes: number;
  cadence: "daily" | "weekly" | "specific_days" | "once";
  days_of_week: number[];
  xp_reward: number;
  active: boolean;
  created_at: string;
};

export type Achievement = {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  metric: string;
  threshold: number;
  activity_type: string | null;
  xp_reward: number;
  hidden: boolean;
  sort_order: number;
};

export type UserAchievement = {
  user_id: string;
  achievement_id: string;
  unlocked_at: string;
};

export type FriendRequest = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
  responded_at: string | null;
};

export type Friendship = {
  id: string;
  user_1: string;
  user_2: string;
  created_at: string;
};

export type NotificationKind =
  | "quest"
  | "friend_request"
  | "friend_accepted"
  | "level_up"
  | "rank_up"
  | "achievement"
  | "streak"
  | "leaderboard"
  | "weekly_report"
  | "system";

export type AppNotification = {
  id: string;
  user_id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  href: string | null;
  meta: Record<string, unknown>;
  read: boolean;
  created_at: string;
};

export type FeedEvent = {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  kind: "activity" | "level_up" | "rank_up" | "achievement" | "streak";
  title: string;
  detail: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export type LeaderboardRow = {
  rank_position: number;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  level: number;
  current_streak: number;
  value: number;
  movement: number;
  is_self: boolean;
};

export type PublicProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  is_self: boolean;
  is_friend: boolean;
  friend_request: "incoming" | "outgoing" | null;
  visible: boolean;
  level: number | null;
  total_xp: number | null;
  attributes: Record<AttributeKey, number> | null;
  current_streak: number | null;
  longest_streak: number | null;
  activities_count: number | null;
  achievements: number | null;
  friends: number;
};

export type WeeklyReport = {
  week_start: string;
  week_end: string;
  level_start: number;
  level_end: number;
  player_xp: number;
  attributes: Record<AttributeKey, number>;
  active_days: number;
  activities: number;
  minutes: number;
  friend_rank: number | null;
  friend_count: number;
  strongest: string;
  weakest: string;
};

/** Shape returned by the `award_activity` RPC. */
export type AwardResult = {
  activity: Activity;
  awarded: Record<AttributeKey | "player", number>;
  clamped: boolean;
  level: {
    before: number;
    after: number;
    total_xp: number;
    into_level: number;
    required: number;
  };
  rank: { before: string; after: string };
  streak: {
    current: number;
    longest: number;
    increased: boolean;
    shield_used: boolean;
    shields: number;
  };
  quests_completed: { id: string; title: string; is_bonus: boolean; reward: QuestReward }[];
  achievements: {
    code: string;
    name: string;
    description: string;
    icon: string;
    xp_reward: number;
    hidden: boolean;
  }[];
};
