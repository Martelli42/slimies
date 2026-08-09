import { NextResponse } from "next/server";
import { z } from "zod";

import { databaseError, readJson, requireUser, zodError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ ids: z.array(z.string().uuid()).max(200).optional() });

/** Mark notifications read — all of them, or a specific set. */
export async function PATCH(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await createClient();
  let query = supabase.from("notifications").update({ read: true }).eq("user_id", user.id);
  if (parsed.data.ids?.length) query = query.in("id", parsed.data.ids);

  const { error } = await query;
  if (error) return databaseError(error);

  return NextResponse.json({ ok: true });
}
