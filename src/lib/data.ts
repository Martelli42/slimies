import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "./env";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import { localDate } from "./time";
import type {
  Achievement,
  Activity,
  AppNotification,
  DailyQuest,
  FeedEvent,
  FriendRequest,
  Profile,
  UserAchievement,
  UserSettings,
} from "./types/database";

/**
 * Server-side reads used by pages. Everything here goes through the *session*
 * client, so Row Level Security is the backstop even if a page forgets a
 * filter.
 */

export async function getProfile(): Promise<Profile | null> {
  // A fresh clone with no project configured should render the marketing page
  // rather than crash on a missing URL.
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return (data as Profile) ?? null;
}

/** For pages inside the app shell: bounces to login/onboarding as needed. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.onboarded) redirect("/onboarding");
  return profile;
}

export async function getSettings(userId: string): Promise<UserSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .single();
  return (data as UserSettings) ?? null;
}

/**
 * Generates today's board if it does not exist yet, then returns it. Uses the
 * service role because quest creation is game logic, not a user write.
 */
export async function ensureTodayQuests(profile: Profile): Promise<{
  date: string;
  quests: DailyQuest[];
}> {
  const date = localDate(profile.timezone);
  const admin = createAdminClient();
  const { data } = await admin.rpc("ensure_daily_quests", {
    p_user: profile.id,
    p_date: date,
  });

  const quests = ((data as DailyQuest[]) ?? []).sort(
    (a, b) =>
      Number(a.is_bonus) - Number(b.is_bonus) ||
      a.sort_order - b.sort_order ||
      a.created_at.localeCompare(b.created_at),
  );

  return { date, quests };
}

export async function getTodayQuests(profile: Profile): Promise<{
  date: string;
  quests: DailyQuest[];
}> {
  const supabase = await createClient();
  const date = localDate(profile.timezone);

  const { data } = await supabase
    .from("daily_quests")
    .select("*")
    .eq("user_id", profile.id)
    .eq("quest_date", date)
    .order("is_bonus", { ascending: true })
    .order("sort_order", { ascending: true });

  return { date, quests: (data as DailyQuest[]) ?? [] };
}

export async function getRecentActivities(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<Activity[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);
  return (data as Activity[]) ?? [];
}

export async function getTodaySummary(profile: Profile) {
  const supabase = await createClient();
  const date = localDate(profile.timezone);

  const { data } = await supabase
    .from("activities")
    .select("duration_minutes, xp_total, activity_type")
    .eq("user_id", profile.id)
    .eq("local_date", date);

  const rows = data ?? [];
  const { data: catalog } = await supabase
    .from("activity_catalog")
    .select("code, activity_group");

  const groupOf = new Map<string, string>(
    (catalog ?? []).map((c: { code: string; activity_group: string }) => [
      c.code,
      c.activity_group,
    ]),
  );

  return {
    activities: rows.length,
    xp: rows.reduce((sum, r) => sum + (r.xp_total ?? 0), 0),
    trainingMinutes: rows
      .filter((r) => groupOf.get(r.activity_type) === "physical")
      .reduce((sum, r) => sum + (r.duration_minutes ?? 0), 0),
    learningMinutes: rows
      .filter((r) => groupOf.get(r.activity_type) === "mind")
      .reduce((sum, r) => sum + (r.duration_minutes ?? 0), 0),
  };
}

export async function getFriendFeed(userId: string, limit = 12): Promise<FeedEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("friend_feed", { p_user: userId, p_limit: limit });
  return (data as FeedEvent[]) ?? [];
}

export async function getFriends(userId: string) {
  const supabase = await createClient();

  const { data: friendships } = await supabase
    .from("friendships")
    .select("user_1, user_2")
    .or(`user_1.eq.${userId},user_2.eq.${userId}`);

  const ids = (friendships ?? []).map((f) => (f.user_1 === userId ? f.user_2 : f.user_1));
  if (ids.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select(
      "id, username, display_name, avatar_url, level, total_xp, current_streak, privacy",
    )
    .in("id", ids);

  return (profiles ?? []) as Pick<
    Profile,
    | "id"
    | "username"
    | "display_name"
    | "avatar_url"
    | "level"
    | "total_xp"
    | "current_streak"
    | "privacy"
  >[];
}

export async function getFriendRequests(userId: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("friend_requests")
    .select("*")
    .eq("status", "pending")
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  const requests = (data as FriendRequest[]) ?? [];
  const otherIds = requests.map((r) => (r.sender_id === userId ? r.receiver_id : r.sender_id));

  type RequestProfile = Pick<
    Profile,
    "id" | "username" | "display_name" | "avatar_url" | "level"
  >;

  const profiles: RequestProfile[] = otherIds.length
    ? (((
        await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, level")
          .in("id", otherIds)
      ).data ?? []) as RequestProfile[])
    : [];

  const byId = new Map(profiles.map((entry) => [entry.id, entry]));

  return {
    incoming: requests
      .filter((r) => r.receiver_id === userId)
      .map((r) => ({ request: r, profile: byId.get(r.sender_id) })),
    outgoing: requests
      .filter((r) => r.sender_id === userId)
      .map((r) => ({ request: r, profile: byId.get(r.receiver_id) })),
  };
}

export async function getAchievements(userId: string) {
  const supabase = await createClient();

  const [{ data: catalog }, { data: unlocked }] = await Promise.all([
    supabase.from("achievements").select("*").order("sort_order"),
    supabase.from("user_achievements").select("*").eq("user_id", userId),
  ]);

  const unlockedMap = new Map(
    ((unlocked as UserAchievement[]) ?? []).map((u) => [u.achievement_id, u.unlocked_at]),
  );

  return ((catalog as Achievement[]) ?? []).map((achievement) => ({
    ...achievement,
    unlockedAt: unlockedMap.get(achievement.id) ?? null,
  }));
}

export async function getNotifications(userId: string, limit = 40) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as AppNotification[]) ?? [];
}

export async function getUnreadCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false);
  return count ?? 0;
}
