import { NextResponse } from "next/server";

/** The VAPID public key, or null when push has not been configured. */
export async function GET() {
  return NextResponse.json({
    key: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  });
}
