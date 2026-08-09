/**
 * Configuration probes.
 *
 * A fresh clone with no Supabase project should still render something useful
 * rather than crashing, so the auth screens check this before wiring up a
 * client. `NEXT_PUBLIC_*` values are inlined at build time, which is why they
 * are referenced literally here rather than through a dynamic lookup.
 */

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function isPushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}

export function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  }
  return "http://localhost:3000";
}
