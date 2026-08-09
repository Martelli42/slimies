import { NextResponse } from "next/server";
import type { ZodError } from "zod";

import { isSupabaseConfigured } from "./env";
import { createClient } from "./supabase/server";

/**
 * Shared plumbing for route handlers: session resolution, uniform error
 * envelopes and friendly text for the error codes the database raises.
 */

export type ApiError = { error: string; code?: string; details?: unknown };

export function jsonError(
  message: string,
  status = 400,
  extra?: Omit<ApiError, "error">,
) {
  return NextResponse.json<ApiError>({ error: message, ...extra }, { status });
}

export function zodError(error: ZodError) {
  const first = error.issues[0];
  return jsonError(first?.message ?? "Invalid request", 422, {
    code: "invalid_input",
    details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  });
}

/** Resolves the signed-in user, or null. Never trusts a client-sent user id. */
export async function getSessionUser() {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    return { user: null, response: jsonError("Not signed in", 401, { code: "unauthenticated" }) };
  }
  return { user, response: null };
}

/** Maps the codes raised by the SQL functions onto messages worth reading. */
const DB_MESSAGES: Record<string, string> = {
  invalid_duration: "That duration is outside the allowed range.",
  activity_in_future: "You cannot log an activity in the future.",
  activity_too_old: "Activities can only be backdated by a few days.",
  rate_limited: "Slow down — wait a moment before logging again.",
  daily_activity_limit: "You have hit today's activity limit.",
  overlapping_activity: "That overlaps an activity you already logged.",
  unknown_activity_type: "That activity type does not exist.",
  profile_not_found: "Finish setting up your profile first.",
  activity_not_found: "That activity no longer exists.",
  quest_not_found: "That quest no longer exists.",
  quest_not_manual: "That quest completes automatically when you log activities.",
  player_not_found: "No player found with that code.",
  cannot_add_self: "You cannot add yourself.",
  already_friends: "You are already allies.",
  request_already_pending: "That request is already pending.",
  request_not_found: "That request is no longer available.",
  invalid_username: "Usernames use 3-20 letters, numbers or underscores.",
  username_taken: "That username is taken.",
};

type PostgrestLikeError = { message?: string; code?: string; details?: string };

export function databaseError(error: PostgrestLikeError | null | undefined) {
  const raw = error?.message ?? "";
  for (const [code, message] of Object.entries(DB_MESSAGES)) {
    if (raw.includes(code)) {
      return jsonError(message, 400, { code });
    }
  }
  console.error("Unhandled database error", error);
  return jsonError("Something went wrong. Try again.", 500, { code: "server_error" });
}

/** Reads and parses a JSON body without throwing on malformed input. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
