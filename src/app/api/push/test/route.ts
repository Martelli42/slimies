import { NextResponse } from "next/server";

import { jsonError, requireUser } from "@/lib/api";
import { pushConfigured, sendPushToUser } from "@/lib/push";

/** Fires a single notification at the caller, so they can verify the setup. */
export async function POST() {
  const { user, response } = await requireUser();
  if (!user) return response;

  if (!pushConfigured()) {
    return jsonError("Push notifications are not configured on this deployment.", 503, {
      code: "push_not_configured",
    });
  }

  const delivered = await sendPushToUser(user.id, {
    title: "Notifications are live",
    body: "This is what an alert from the system looks like.",
    url: "/dashboard",
    tag: "test",
  });

  if (delivered === 0) {
    return jsonError("No active subscription for this device yet.", 409, {
      code: "no_subscription",
    });
  }

  return NextResponse.json({ delivered });
}
