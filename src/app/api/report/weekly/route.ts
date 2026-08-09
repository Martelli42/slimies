import { NextResponse } from "next/server";

import { databaseError, requireUser } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const weekStart = new URL(request.url).searchParams.get("week");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("weekly_report", {
    p_user: user.id,
    p_week_start: weekStart,
  });

  if (error) return databaseError(error);
  return NextResponse.json(data);
}
