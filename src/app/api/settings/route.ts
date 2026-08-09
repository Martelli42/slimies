import { NextResponse } from "next/server";

import { databaseError, readJson, requireUser, zodError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { settingsSchema } from "@/lib/validation";

export async function PATCH(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = settingsSchema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_settings")
    .update(parsed.data)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return databaseError(error);
  return NextResponse.json(data);
}
