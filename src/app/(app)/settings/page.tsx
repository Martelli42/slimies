import type { Metadata } from "next";

import { SettingsForm } from "@/components/game/settings-form";
import { getSettings, requireProfile } from "@/lib/data";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const profile = await requireProfile();
  const settings = await getSettings(profile.id);

  return (
    <div className="space-y-4">
      <header>
        <p className="label-eyebrow">Configuration</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold">Settings</h1>
      </header>

      <SettingsForm profile={profile} settings={settings} />
    </div>
  );
}
