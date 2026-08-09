import { NextResponse } from "next/server";

import { databaseError, requireUser, zodError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { leaderboardQuerySchema } from "@/lib/validation";

/** Leaderboards are read-only aggregates, so the user's own session is enough. */
export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const url = new URL(request.url);
  const parsed = leaderboardQuerySchema.safeParse({
    scope: url.searchParams.get("scope") ?? undefined,
    metric: url.searchParams.get("metric") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("leaderboard", {
    p_user: user.id,
    p_scope: parsed.data.scope,
    p_metric: parsed.data.metric,
    p_limit: parsed.data.limit,
  });
  if (error) return databaseError(error);

  return NextResponse.json({ rows: data ?? [] });
}
