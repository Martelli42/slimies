import Link from "next/link";
import type { Metadata } from "next";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <>
      <p className="label-eyebrow">Registration</p>
      <h1 className="mt-1 font-display text-2xl font-extrabold">Begin awakening</h1>
      <p className="mt-1 text-sm text-ink-muted">
        One account, one character sheet. It starts at level 1.
      </p>

      <RegisterForm />

      <p className="mt-6 text-center text-xs text-ink-muted">
        Already registered?{" "}
        <Link href="/login" className="font-semibold text-accent-soft hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
