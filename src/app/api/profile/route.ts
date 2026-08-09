import { NextResponse } from "next/server";

import { databaseError, readJson, requireUser, zodError } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { profileUpdateSchema } from "@/lib/validation";

/**
 * Cosmetic profile edits only. Progression columns are rejected by a database
 * trigger even if something tried to smuggle them through.
 */
export async function PATCH(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = profileUpdateSchema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);

  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  if (parsed.data.displayName !== undefined) patch.display_name = parsed.data.displayName;
  if (parsed.data.bio !== undefined) patch.bio = parsed.data.bio;
  if (parsed.data.avatarUrl !== undefined) patch.avatar_url = parsed.data.avatarUrl;
  if (parsed.data.timezone !== undefined) patch.timezone = parsed.data.timezone;

  if (parsed.data.privacy) {
    const { data: current } = await supabase
      .from("profiles")
      .select("privacy")
      .eq("id", user.id)
      .single();
    patch.privacy = { ...(current?.privacy ?? {}), ...parsed.data.privacy };
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ updated: false });
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id)
    .select()
    .single();

  if (error) return databaseError(error);
  return NextResponse.json(data);
}
