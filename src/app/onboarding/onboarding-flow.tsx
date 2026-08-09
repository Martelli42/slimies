"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { AvatarUpload } from "@/components/game/avatar-upload";
import { Icon } from "@/components/icon";
import { Alert, Button, Field, Input, Panel, cx } from "@/components/ui/primitives";
import { APP_NAME, ATTRIBUTE_LIST, GOALS } from "@/lib/constants";
import { detectTimezone } from "@/lib/time";

type Step = "identity" | "goals" | "avatar" | "complete";

const STEP_ORDER: Step[] = ["identity", "goals", "avatar", "complete"];

export function OnboardingFlow({
  defaultDisplayName,
  suggestedUsername,
  userId,
}: {
  defaultDisplayName: string;
  suggestedUsername: string;
  userId: string;
}) {
  const router = useRouter();

  const [step, setStep] = React.useState<Step>("identity");
  const [displayName, setDisplayName] = React.useState(defaultDisplayName);
  const [username, setUsername] = React.useState(suggestedUsername);
  const [goals, setGoals] = React.useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const index = STEP_ORDER.indexOf(step);

  function toggleGoal(value: string) {
    setGoals((current) =>
      current.includes(value)
        ? current.filter((g) => g !== value)
        : current.length >= 4
          ? current
          : [...current, value],
    );
  }

  async function finish() {
    setError(null);
    setLoading(true);

    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        displayName,
        goals,
        timezone: detectTimezone(),
        avatarUrl,
      }),
    });

    const body = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      setError(body.error ?? "Could not complete your awakening. Try again.");
      setStep("identity");
      return;
    }

    setStep("complete");
  }

  if (step === "complete") {
    return <AwakeningComplete onContinue={() => router.replace("/dashboard")} />;
  }

  return (
    <div className="animate-rise">
      <div className="mb-6 flex gap-1.5" aria-hidden>
        {STEP_ORDER.slice(0, 3).map((s, i) => (
          <span
            key={s}
            className={cx(
              "h-1 flex-1 rounded-full transition-colors",
              i <= index ? "bg-accent" : "bg-hairline",
            )}
          />
        ))}
      </div>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {step === "identity" ? (
        <IdentityStep
          displayName={displayName}
          username={username}
          onDisplayName={setDisplayName}
          onUsername={setUsername}
          onNext={() => {
            if (!/^[a-z0-9_]{3,20}$/.test(username)) {
              setError("Usernames use 3-20 lowercase letters, numbers or underscores.");
              return;
            }
            if (!displayName.trim()) {
              setError("Pick a name to display.");
              return;
            }
            setError(null);
            setStep("goals");
          }}
        />
      ) : null}

      {step === "goals" ? (
        <GoalsStep
          goals={goals}
          onToggle={toggleGoal}
          onBack={() => setStep("identity")}
          onNext={() => setStep("avatar")}
        />
      ) : null}

      {step === "avatar" ? (
        <AvatarStep
          userId={userId}
          displayName={displayName}
          avatarUrl={avatarUrl}
          onAvatar={setAvatarUrl}
          onBack={() => setStep("goals")}
          onFinish={finish}
          loading={loading}
        />
      ) : null}
    </div>
  );
}

function IdentityStep({
  displayName,
  username,
  onDisplayName,
  onUsername,
  onNext,
}: {
  displayName: string;
  username: string;
  onDisplayName: (v: string) => void;
  onUsername: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <>
      <p className="label-eyebrow">Step 1 of 3</p>
      <h1 className="mt-1 font-display text-2xl font-extrabold">Who are you becoming?</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Your username is permanent-ish and appears on leaderboards.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onNext();
        }}
      >
        <Field label="Display name" htmlFor="displayName">
          <Input
            id="displayName"
            value={displayName}
            maxLength={40}
            onChange={(e) => onDisplayName(e.target.value)}
            placeholder="Allan"
          />
        </Field>

        <Field
          label="Username"
          htmlFor="username"
          hint="Lowercase letters, numbers and underscores."
        >
          <Input
            id="username"
            value={username}
            maxLength={20}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => onUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            placeholder="allan"
          />
        </Field>

        <Button type="submit" fullWidth>
          Continue
        </Button>
      </form>
    </>
  );
}

function GoalsStep({
  goals,
  onToggle,
  onBack,
  onNext,
}: {
  goals: string[];
  onToggle: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <p className="label-eyebrow">Step 2 of 3</p>
      <h1 className="mt-1 font-display text-2xl font-extrabold">What are you chasing?</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Pick up to four. Your daily quests lean toward what you choose.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-2">
        {GOALS.map((goal) => {
          const selected = goals.includes(goal.value);
          return (
            <button
              key={goal.value}
              type="button"
              onClick={() => onToggle(goal.value)}
              aria-pressed={selected}
              className={cx(
                "rounded-xl border p-3 text-left text-sm transition-all active:scale-[0.98]",
                selected
                  ? "border-accent/60 bg-accent/12 text-ink"
                  : "border-hairline bg-surface/60 text-ink-muted hover:border-accent/30",
              )}
            >
              <span className="flex items-start justify-between gap-2">
                <span>{goal.label}</span>
                {selected ? (
                  <Icon name="check" size={14} className="mt-0.5 shrink-0 text-accent-soft" />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex gap-2">
        <Button variant="secondary" onClick={onBack} className="w-28">
          Back
        </Button>
        <Button onClick={onNext} fullWidth>
          Continue
        </Button>
      </div>
    </>
  );
}

function AvatarStep({
  userId,
  displayName,
  avatarUrl,
  onAvatar,
  onBack,
  onFinish,
  loading,
}: {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  onAvatar: (url: string | null) => void;
  onBack: () => void;
  onFinish: () => void;
  loading: boolean;
}) {
  return (
    <>
      <p className="label-eyebrow">Step 3 of 3</p>
      <h1 className="mt-1 font-display text-2xl font-extrabold">Choose a face</h1>
      <p className="mt-1 text-sm text-ink-muted">Optional — you can add one later.</p>

      <div className="mt-8 flex justify-center">
        <AvatarUpload
          userId={userId}
          name={displayName}
          value={avatarUrl}
          onChange={onAvatar}
          size={112}
        />
      </div>

      <div className="mt-8 flex gap-2">
        <Button variant="secondary" onClick={onBack} className="w-28" disabled={loading}>
          Back
        </Button>
        <Button onClick={onFinish} fullWidth loading={loading}>
          Awaken
        </Button>
      </div>
    </>
  );
}

function AwakeningComplete({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="text-center">
      <div className="relative mx-auto mb-8 flex size-28 items-center justify-center">
        <span className="absolute inset-0 animate-pulse-ring rounded-full border border-accent/50" />
        <span className="absolute inset-3 rounded-full border border-beam/30" />
        <Icon name="bolt" size={44} className="relative text-accent-soft" />
      </div>

      <p className="label-eyebrow animate-fade-in">{APP_NAME}</p>
      <h1 className="mt-2 animate-rise font-display text-3xl font-extrabold glow-text text-accent-soft">
        AWAKENING COMPLETE
      </h1>
      <p className="mt-3 text-sm text-ink-muted">
        Your character sheet exists. Every attribute starts at zero — that is the point.
      </p>

      <Panel className="mt-8 text-left">
        <p className="label-eyebrow mb-3">Level 1 · Bronze III</p>
        <ul className="space-y-2">
          {ATTRIBUTE_LIST.map((attr) => (
            <li key={attr.key} className="flex items-center justify-between text-sm">
              <span
                className="font-display font-extrabold tracking-[0.14em]"
                style={{ color: `var(${attr.cssVar})` }}
              >
                {attr.code}
              </span>
              <span className="numeral text-ink-muted">1</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Button className="mt-8" fullWidth size="lg" onClick={onContinue}>
        Enter the system
      </Button>
    </div>
  );
}
