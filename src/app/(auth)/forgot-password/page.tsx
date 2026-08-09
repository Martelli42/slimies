import Link from "next/link";
import type { Metadata } from "next";

import { ForgotPasswordForm } from "./forgot-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <p className="label-eyebrow">Recovery</p>
      <h1 className="mt-1 font-display text-2xl font-extrabold">Reset your password</h1>
      <p className="mt-1 text-sm text-ink-muted">
        We will email you a link that signs you in so you can set a new one.
      </p>

      <ForgotPasswordForm />

      <p className="mt-6 text-center text-xs text-ink-muted">
        <Link href="/login" className="font-semibold text-accent-soft hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}
