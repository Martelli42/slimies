"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Alert, Button, Field, Input } from "@/components/ui/primitives";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";

const LINK_ERRORS: Record<string, string> = {
  missing_code: "That link was incomplete. Request a new one.",
  expired_link: "That link has expired. Request a new one.",
};

export function LoginForm({
  next,
  linkError,
}: {
  next?: string;
  linkError?: string;
}) {
  const router = useRouter();
  const configured = isSupabaseConfigured();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(
    linkError ? (LINK_ERRORS[linkError] ?? "Something went wrong with that link.") : null,
  );
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(
        signInError.message === "Invalid login credentials"
          ? "That email and password do not match."
          : signInError.message,
      );
      setLoading(false);
      return;
    }

    router.replace(next && next.startsWith("/") ? next : "/dashboard");
    router.refresh();
  }

  if (!configured) return <NotConfigured />;

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      {error ? <Alert>{error}</Alert> : null}

      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </Field>

      <Button type="submit" fullWidth loading={loading}>
        Sign in
      </Button>

      <p className="text-center text-xs">
        <Link href="/forgot-password" className="text-ink-faint hover:text-ink-muted">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}

export function NotConfigured() {
  return (
    <div className="mt-6">
      <Alert tone="warning">
        <p className="font-semibold">Supabase is not configured yet.</p>
        <p className="mt-1">
          Copy <code className="text-ink">.env.example</code> to{" "}
          <code className="text-ink">.env.local</code>, fill in your project URL and keys,
          then restart the dev server. The README walks through it.
        </p>
      </Alert>
    </div>
  );
}
