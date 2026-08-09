"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { AvatarUpload } from "@/components/game/avatar-upload";
import { PushToggle } from "@/components/pwa/push-toggle";
import { Icon } from "@/components/icon";
import {
  Button,
  Field,
  Input,
  Panel,
  PanelHeader,
  Select,
  Textarea,
  cx,
} from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { detectTimezone } from "@/lib/time";
import type { Profile, UserSettings } from "@/lib/types/database";

const NOTIFICATION_OPTIONS: { key: keyof UserSettings; label: string; hint: string }[] = [
  {
    key: "notify_daily_quests",
    label: "Daily quests",
    hint: "One morning nudge when a new board is issued.",
  },
  {
    key: "notify_streak_risk",
    label: "Streak at risk",
    hint: "An evening warning if the day is still empty.",
  },
  {
    key: "notify_friend_activity",
    label: "Friend milestones",
    hint: "When an ally levels up or hits a streak.",
  },
  {
    key: "notify_leaderboard",
    label: "Leaderboard moves",
    hint: "When someone passes you.",
  },
  {
    key: "notify_achievements",
    label: "Achievements",
    hint: "When you unlock something.",
  },
  {
    key: "notify_weekly_report",
    label: "Weekly report",
    hint: "Your Sunday summary.",
  },
];

export function SettingsForm({
  profile,
  settings,
}: {
  profile: Profile;
  settings: UserSettings | null;
}) {
  const router = useRouter();
  const toast = useToast();

  const [displayName, setDisplayName] = React.useState(profile.display_name);
  const [bio, setBio] = React.useState(profile.bio ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState(profile.avatar_url);
  const [timezone, setTimezone] = React.useState(profile.timezone);
  const [privacy, setPrivacy] = React.useState(profile.privacy);
  const [prefs, setPrefs] = React.useState(settings);
  const [saving, setSaving] = React.useState(false);

  const browserTimezone = React.useMemo(() => detectTimezone(), []);

  async function saveProfile() {
    setSaving(true);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName,
        bio: bio.trim() || null,
        avatarUrl,
        timezone,
        privacy,
      }),
    });
    const body = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      toast.push({ title: "Could not save", message: body.error, tone: "danger" });
      return;
    }

    toast.push({ title: "Saved", tone: "success" });
    router.refresh();
  }

  async function togglePreference(key: keyof UserSettings, value: boolean) {
    setPrefs((current) => (current ? { ...current, [key]: value } : current));

    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });

    if (!response.ok) {
      setPrefs((current) => (current ? { ...current, [key]: !value } : current));
      toast.push({ title: "Could not update that preference", tone: "danger" });
    }
  }

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------ profile */}
      <Panel>
        <PanelHeader eyebrow="You" title="Profile" />

        <div className="flex justify-center py-2">
          <AvatarUpload
            userId={profile.id}
            name={displayName}
            value={avatarUrl}
            onChange={setAvatarUrl}
            size={88}
          />
        </div>

        <div className="mt-3 space-y-4">
          <Field label="Display name" htmlFor="displayName">
            <Input
              id="displayName"
              value={displayName}
              maxLength={40}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>

          <Field label="Bio" htmlFor="bio" hint={`${bio.length}/200`}>
            <Textarea
              id="bio"
              value={bio}
              maxLength={200}
              onChange={(e) => setBio(e.target.value)}
              placeholder="One line about what you are chasing."
            />
          </Field>

          <Field
            label="Timezone"
            htmlFor="timezone"
            hint="Quests reset and streaks tick over at your local midnight."
          >
            <div className="flex gap-2">
              <Input
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
              {timezone !== browserTimezone ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setTimezone(browserTimezone)}
                >
                  Use {browserTimezone}
                </Button>
              ) : null}
            </div>
          </Field>

          <p className="text-xs text-ink-faint">
            Username <span className="text-ink">@{profile.username}</span> · Friend code{" "}
            <span className="text-ink">{profile.friend_code}</span>
          </p>
        </div>
      </Panel>

      {/* ------------------------------------------------------------ privacy */}
      <Panel>
        <PanelHeader eyebrow="Visibility" title="Privacy" />

        <div className="space-y-4">
          <Field label="Who can see your profile" htmlFor="visibility">
            <Select
              id="visibility"
              value={privacy?.profile ?? "friends"}
              onChange={(e) =>
                setPrivacy({ ...privacy, profile: e.target.value as "public" | "friends" })
              }
            >
              <option value="friends">Friends only</option>
              <option value="public">Anyone signed in</option>
            </Select>
          </Field>

          <Toggle
            label="Share activity in the friend feed"
            checked={privacy?.activity ?? true}
            onChange={(value) => setPrivacy({ ...privacy, activity: value })}
          />
          <Toggle
            label="Appear on the global leaderboard"
            checked={privacy?.leaderboards ?? true}
            onChange={(value) => setPrivacy({ ...privacy, leaderboards: value })}
          />
        </div>
      </Panel>

      <Button fullWidth onClick={saveProfile} loading={saving}>
        Save changes
      </Button>

      {/* ------------------------------------------------------ notifications */}
      <Panel>
        <PanelHeader eyebrow="Alerts" title="Notifications" />
        <PushToggle />

        <div className="mt-4 space-y-3">
          {NOTIFICATION_OPTIONS.map((option) => (
            <Toggle
              key={String(option.key)}
              label={option.label}
              hint={option.hint}
              checked={Boolean(prefs?.[option.key] ?? true)}
              onChange={(value) => togglePreference(option.key, value)}
            />
          ))}
        </div>
      </Panel>

      {/* --------------------------------------------------------- session */}
      <Panel>
        <PanelHeader eyebrow="Session" title="Account" />
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="secondary" fullWidth>
            <Icon name="logout" size={15} /> Sign out
          </Button>
        </form>
      </Panel>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-sm">{label}</span>
        {hint ? <span className="block text-[0.68rem] text-ink-faint">{hint}</span> : null}
      </span>

      <span className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          className={cx(
            "block h-6 w-11 rounded-full border transition-colors",
            checked ? "border-accent/60 bg-accent/40" : "border-hairline bg-abyss",
          )}
        />
        <span
          className={cx(
            "absolute top-1 left-1 size-4 rounded-full transition-transform",
            checked ? "translate-x-5 bg-accent-soft" : "bg-ink-faint",
          )}
        />
      </span>
    </label>
  );
}
