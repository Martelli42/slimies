import { NextResponse } from "next/server";

import { databaseError, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Delete an activity and unwind exactly the XP it granted, including the
 * quest progress it contributed. Handled by the database in one transaction.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const { id } = await params;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("remove_activity", {
    p_user: user.id,
    p_activity: id,
  });

  if (error) return databaseError(error);
  return NextResponse.json(data);
}
