import { NextResponse } from "next/server";
import { z } from "zod";

import { databaseError, readJson, requireUser, zodError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ friendId: z.string().uuid() });

export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("remove_friend", {
    p_user: user.id,
    p_friend: parsed.data.friendId,
  });
  if (error) return databaseError(error);

  return NextResponse.json(data);
}
