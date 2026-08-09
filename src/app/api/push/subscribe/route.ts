import { NextResponse } from "next/server";
import { z } from "zod";

import { databaseError, readJson, requireUser, zodError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushSubscriptionSchema } from "@/lib/validation";

/** Register this browser for push. Re-registering the same endpoint is a no-op. */
export async function POST(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = pushSubscriptionSchema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);

  const admin = createAdminClient();
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
    },
    { onConflict: "endpoint" },
  );

  if (error) return databaseError(error);
  return NextResponse.json({ subscribed: true });
}

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

export async function DELETE(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;

  const parsed = unsubscribeSchema.safeParse(await readJson(request));
  if (!parsed.success) return zodError(parsed.error);

  const admin = createAdminClient();
  const { error } = await admin
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", parsed.data.endpoint);

  if (error) return databaseError(error);
  return NextResponse.json({ subscribed: false });
}
