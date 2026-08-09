"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { NotConfigured } from "@/app/(auth)/login/login-form";
import { Alert, Button, Field, Input } from "@/components/ui/primitives";
import { isSupabaseConfigured, siteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

export function RegisterForm() {
  const router = useRouter();
  const configured = isSupabaseConfigured();

  const [displayName, setDisplayName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [checkEmail, setCheckEmail] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${siteUrl()}/auth/callback?next=/onboarding`,
        data: { display_name: displayName.trim() },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // With email confirmation on, Supabase returns a user but no session.
    if (!data.session) {
      setCheckEmail(true);
      setLoading(false);
      return;
    }

    router.replace("/onboarding");
    router.refresh();
  }

  if (!configured) return <NotConfigured />;

  if (checkEmail) {
    return (
      <div className="mt-6">
        <Alert tone="info">
          <p className="font-semibold">Check your inbox.</p>
          <p className="mt-1">
            We sent a confirmation link to {email}. Open it on this device and your
            awakening continues.
          </p>
        </Alert>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      {error ? <Alert>{error}</Alert> : null}

      <Field label="Display name" htmlFor="displayName">
        <Input
          id="displayName"
          name="displayName"
          autoComplete="nickname"
          required
          maxLength={40}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="What should we call you?"
        />
      </Field>

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

      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </Field>

      <Button type="submit" fullWidth loading={loading}>
        Create account
      </Button>
    </form>
  );
}
