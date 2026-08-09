"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { RewardOverlay } from "@/components/game/reward-overlay";
import { Icon } from "@/components/icon";
import {
  Alert,
  Button,
  Field,
  Input,
  Panel,
  Skeleton,
  Textarea,
  cx,
} from "@/components/ui/primitives";
import { ACTIVITY_GROUPS, ACTIVITY_TYPES, getActivityType } from "@/lib/activities";
import { ATTRIBUTES, DIFFICULTIES, type AttributeKey } from "@/lib/constants";
import { toDateTimeLocalValue } from "@/lib/time";
import type { AwardResult } from "@/lib/types/database";

type Preview = {
  attributes: Record<AttributeKey, number>;
  playerXp: number;
  notes: string[];
  evaluation: {
    activityType: string;
    title: string;
    usefulness: "none" | "low" | "medium" | "high";
    reason: string;
    provider: string;
  };
};

const DURATION_PRESETS = [15, 30, 45, 60, 90];

export function LogActivityForm({ timezone }: { timezone: string }) {
  const router = useRouter();

  const [activityType, setActivityType] = React.useState("strength_training");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [duration, setDuration] = React.useState(45);
  const [difficulty, setDifficulty] = React.useState("moderate");
  const [occurredAt, setOccurredAt] = React.useState(() => toDateTimeLocalValue());
  const [proofUrl, setProofUrl] = React.useState("");

  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ award: AwardResult; notes: string[] } | null>(
    null,
  );

  const selected = getActivityType(activityType);

  const payload = React.useMemo(
    () => ({
      activityType,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      durationMinutes: duration,
      difficulty,
      occurredAt: new Date(occurredAt).toISOString(),
      proofUrl: proofUrl.trim() || undefined,
      timezone,
    }),
    [activityType, title, description, duration, difficulty, occurredAt, proofUrl, timezone],
  );

  // Live estimate. Debounced so typing a description does not hammer the API.
  React.useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      if (cancelled) return;
      setPreviewing(true);
      try {
        const response = await fetch("/api/activities/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error("preview failed");
        const body = (await response.json()) as Preview;
        if (!cancelled) setPreview(body);
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [payload]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const response = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    setSubmitting(false);

    if (!response.ok) {
      setError(body.error ?? "Could not log that activity.");
      return;
    }

    setResult({ award: body as AwardResult, notes: body.notes ?? [] });
  }

  if (result) {
    return (
      <RewardOverlay
        result={result.award}
        notes={result.notes}
        onDismiss={() => {
          setResult(null);
          router.push("/dashboard");
          router.refresh();
        }}
      />
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}

      {/* ------------------------------------------------------- category */}
      <Panel>
        <p className="label-eyebrow mb-3">Category</p>
        {ACTIVITY_GROUPS.map((group) => (
          <div key={group.key} className="mb-3 last:mb-0">
            <p className="mb-2 text-[0.68rem] text-ink-faint">{group.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {ACTIVITY_TYPES.filter((type) => type.group === group.key).map((type) => (
                <button
                  key={type.code}
                  type="button"
                  onClick={() => setActivityType(type.code)}
                  aria-pressed={activityType === type.code}
                  className={cx(
                    "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs transition-all active:scale-[0.97]",
                    activityType === type.code
                      ? "border-accent/60 bg-accent/15 text-ink"
                      : "border-hairline bg-abyss/50 text-ink-muted hover:border-accent/30",
                  )}
                >
                  <Icon name={type.icon} size={14} />
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {selected ? (
          <p className="mt-1 text-[0.7rem] text-ink-faint">{selected.blurb}</p>
        ) : null}
      </Panel>

      {/* -------------------------------------------------------- details */}
      <Panel className="space-y-4">
        <Field label="Duration" htmlFor="duration">
          <div className="flex flex-wrap gap-1.5">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDuration(preset)}
                aria-pressed={duration === preset}
                className={cx(
                  "numeral rounded-lg border px-3 py-2 text-xs transition-colors",
                  duration === preset
                    ? "border-accent/60 bg-accent/15 text-ink"
                    : "border-hairline text-ink-muted hover:border-accent/30",
                )}
              >
                {preset}m
              </button>
            ))}
            <Input
              id="duration"
              type="number"
              min={1}
              max={selected?.maxMinutes ?? 480}
              value={duration}
              onChange={(e) => setDuration(Math.max(1, Number(e.target.value)))}
              className="w-24"
              aria-label="Duration in minutes"
            />
          </div>
        </Field>

        <Field
          label="What did you do?"
          htmlFor="description"
          hint={
            selected?.evaluated
              ? "Be specific — vague descriptions earn partial credit."
              : "Optional, but it makes your history worth reading."
          }
        >
          <Textarea
            id="description"
            value={description}
            maxLength={600}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              selected?.evaluated
                ? "45-minute video on how mortgages and compound interest work"
                : "Chest and triceps — bench, incline, dips"
            }
          />
        </Field>

        <Field label="Title" htmlFor="title" hint="Leave blank and one is generated.">
          <Input
            id="title"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={selected?.label}
          />
        </Field>

        <Field label="Effort" htmlFor="difficulty">
          <div className="grid grid-cols-4 gap-1.5">
            {DIFFICULTIES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setDifficulty(option.value)}
                aria-pressed={difficulty === option.value}
                className={cx(
                  "rounded-lg border px-2 py-2 text-xs transition-colors",
                  difficulty === option.value
                    ? "border-accent/60 bg-accent/15 text-ink"
                    : "border-hairline text-ink-muted hover:border-accent/30",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="When" htmlFor="occurredAt">
          <Input
            id="occurredAt"
            type="datetime-local"
            value={occurredAt}
            max={toDateTimeLocalValue()}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        </Field>

        <details className="group">
          <summary className="cursor-pointer list-none text-xs text-ink-faint hover:text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <Icon name="camera" size={13} />
              Add proof (optional)
            </span>
          </summary>
          <div className="mt-3">
            <Field
              label="Proof link"
              htmlFor="proof"
              hint="A link to a photo, workout export or screenshot."
            >
              <Input
                id="proof"
                type="url"
                value={proofUrl}
                onChange={(e) => setProofUrl(e.target.value)}
                placeholder="https://"
              />
            </Field>
          </div>
        </details>
      </Panel>

      {/* -------------------------------------------------------- estimate */}
      <PreviewPanel preview={preview} loading={previewing} />

      <Button type="submit" size="lg" fullWidth loading={submitting}>
        Submit activity
      </Button>
    </form>
  );
}

function PreviewPanel({ preview, loading }: { preview: Preview | null; loading: boolean }) {
  if (loading && !preview) {
    return (
      <Panel className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-full" />
      </Panel>
    );
  }

  if (!preview) {
    return (
      <Panel>
        <p className="label-eyebrow">Estimated reward</p>
        <p className="mt-2 text-xs text-ink-faint">
          Fill in the details above and the system will evaluate them.
        </p>
      </Panel>
    );
  }

  const gains = Object.entries(preview.attributes).filter(([, value]) => value > 0);
  const worthless = preview.evaluation.usefulness === "none";

  return (
    <Panel className={cx("relative overflow-hidden", loading && "opacity-60")}>
      <div className="absolute inset-x-0 top-0 h-px beam-line" />
      <div className="flex items-baseline justify-between">
        <p className="label-eyebrow">Estimated reward</p>
        <p
          className={cx(
            "numeral text-xl",
            worthless ? "text-ink-faint" : "glow-text text-accent-soft",
          )}
        >
          +{preview.playerXp} XP
        </p>
      </div>

      {gains.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {gains.map(([key, value]) => {
            const attr = ATTRIBUTES[key as AttributeKey];
            return (
              <li
                key={key}
                className="rounded-lg border px-2.5 py-1.5 font-display text-xs font-bold"
                style={{
                  color: `var(${attr.cssVar})`,
                  borderColor: `color-mix(in oklab, var(${attr.cssVar}) 40%, transparent)`,
                  background: `color-mix(in oklab, var(${attr.cssVar}) 10%, transparent)`,
                }}
              >
                {attr.code} +{value}
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className={cx("mt-3 text-xs", worthless ? "text-danger" : "text-ink-muted")}>
        {preview.evaluation.reason}
      </p>

      {preview.notes.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {preview.notes.map((note) => (
            <li key={note} className="text-[0.7rem] text-ink-faint">
              · {note}
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
}
