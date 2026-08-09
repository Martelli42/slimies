import { NextResponse } from "next/server";

import { databaseError, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Check off a manual quest. Automatic quests progress from logged activities
 * and cannot be completed this way — the database enforces that.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("complete_manual_quest", {
    p_user: user.id,
    p_quest: id,
  });

  if (error) return databaseError(error);
  return NextResponse.json(data);
}
