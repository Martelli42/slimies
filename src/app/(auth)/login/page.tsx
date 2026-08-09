import Link from "next/link";
import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <>
      <p className="label-eyebrow">Identity check</p>
      <h1 className="mt-1 font-display text-2xl font-extrabold">Sign in</h1>
      <p className="mt-1 text-sm text-ink-muted">Pick up where your progress left off.</p>

      <LoginForm next={next} linkError={error} />

      <p className="mt-6 text-center text-xs text-ink-muted">
        No account yet?{" "}
        <Link href="/register" className="font-semibold text-accent-soft hover:underline">
          Begin awakening
        </Link>
      </p>
    </>
  );
}
