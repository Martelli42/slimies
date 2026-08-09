import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { Ambient } from "@/components/game/ambient";
import { getProfile } from "@/lib/data";

import { OnboardingFlow } from "./onboarding-flow";

export const metadata: Metadata = { title: "Awakening" };

export default async function OnboardingPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.onboarded) redirect("/dashboard");

  return (
    <div className="relative flex min-h-dvh flex-col">
      <Ambient />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <OnboardingFlow
          defaultDisplayName={profile.display_name}
          suggestedUsername={
            profile.username.startsWith("player_")
              ? slugify(profile.display_name)
              : profile.username
          }
          userId={profile.id}
        />
      </main>
    </div>
  );
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
  return base.length >= 3 ? base : "";
}
