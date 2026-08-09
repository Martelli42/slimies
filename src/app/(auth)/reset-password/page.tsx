import type { Metadata } from "next";

import { ResetPasswordForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <>
      <p className="label-eyebrow">Recovery</p>
      <h1 className="mt-1 font-display text-2xl font-extrabold">Set a new password</h1>
      <p className="mt-1 text-sm text-ink-muted">
        You are signed in through the reset link. Choose something you will remember.
      </p>

      <ResetPasswordForm />
    </>
  );
}
