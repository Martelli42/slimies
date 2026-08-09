import type { Metadata } from "next";

import { requireProfile } from "@/lib/data";

import { LogActivityForm } from "./log-activity-form";

export const metadata: Metadata = { title: "Log activity" };

export default async function NewActivityPage() {
  const profile = await requireProfile();

  return (
    <div className="space-y-4">
      <header>
        <p className="label-eyebrow">Submission</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold">Log an activity</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Describe what you actually did. The system decides what it was worth.
        </p>
      </header>

      <LogActivityForm timezone={profile.timezone} />
    </div>
  );
}
