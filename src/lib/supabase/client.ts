"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Only ever holds the anon key, so every read it
 * performs is filtered by Row Level Security.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
