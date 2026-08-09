"use client";

import * as React from "react";

import { Icon } from "@/components/icon";
import { XPBar } from "@/components/game/xp-bar";
import { Button, cx } from "@/components/ui/primitives";
import { ATTRIBUTE_LIST, type AttributeKey } from "@/lib/constants";
import type { AwardResult } from "@/lib/types/database";

/**
 * The payoff.
 *
 * Shown once, full screen, after a successful submission: the attribute gains
 * count in one at a time, the level bar animates from where it was, and any
 * level, rank, quest or achievement events stack underneath.
 *
 * Sound is intentionally not wired up but the structure is ready for it — each
 * reveal stage fires on a timer that an audio cue could hook into.
 */
export function RewardOverlay({
  result,
  notes,
  onDismiss,
}: {
  result: AwardResult;
  notes?: string[];
  onDismiss: () => void;
}) {
  const [stage, setStage] = React.useState(0);

  const gains = React.useMemo(
    () =>
      ATTRIBUTE_LIST.map((attr) => ({
        attr,
        value: result.awarded[attr.key as AttributeKey] ?? 0,
      })).filter((gain) => gain.value > 0),
    [result.awarded],
  );

  // Reveal each attribute gain in turn — the stagger is what makes it land.
  React.useEffect(() => {
    const timers = gains.map((_, index) =>
      setTimeout(() => setStage((current) => Math.max(current, index + 1)), 220 + index * 180),
    );
    return () => timers.forEach(clearTimeout);
  }, [gains]);

  const levelledUp = result.level.after > result.level.before;
  const rankedUp = result.rank.after !== result.rank.before;
  const zeroXp = result.awarded.player === 0 && gains.length === 0;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center overflow-y-auto bg-void/94 px-5 py-10 backdrop-blur-md">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <div className="relative mx-auto mb-5 flex size-20 items-center justify-center">
            {!zeroXp ? (
              <span className="absolute inset-0 animate-pulse-ring rounded-full border border-accent/60" />
            ) : null}
            <Icon
              name={zeroXp ? "x" : "check"}
              size={34}
              strokeWidth={2.4}
              className={zeroXp ? "text-ink-faint" : "text-accent-soft"}
            />
          </div>

          <p className="label-eyebrow">{zeroXp ? "No progression" : "Quest complete"}</p>
          <h2
            className={cx(
              "mt-1 font-display text-2xl font-extrabold",
              !zeroXp && "glow-text text-accent-soft",
            )}
          >
            {zeroXp ? "Nothing earned" : `+${result.awarded.player} XP`}
          </h2>
        </div>

        {gains.length > 0 ? (
          <ul className="mt-6 space-y-2">
            {gains.map((gain, index) => (
              <li
                key={gain.attr.key}
                className={cx(
                  "flex items-center justify-between rounded-xl border border-hairline bg-surface/70 px-4 py-3 transition-all duration-300",
                  stage > index ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
                )}
              >
                <span
                  className="font-display text-sm font-extrabold tracking-[0.16em]"
                  style={{ color: `var(${gain.attr.cssVar})` }}
                >
                  {gain.attr.code}
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="numeral text-lg"
                    style={{ color: `var(${gain.attr.cssVar})` }}
                  >
                    +{gain.value}
                  </span>
                  <Icon
                    name="arrowUp"
                    size={13}
                    strokeWidth={2.4}
                    style={{ color: `var(${gain.attr.cssVar})` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-6">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="label-eyebrow">Level {result.level.after}</span>
            <span className="numeral text-xs text-ink-muted">
              {result.level.into_level} / {result.level.required}
            </span>
          </div>
          <XPBar
            value={result.level.into_level}
            max={result.level.required}
            from={Math.max(0, result.level.into_level - result.awarded.player)}
            height={12}
          />
        </div>

        <div className="mt-5 space-y-2">
          {levelledUp ? (
            <Banner
              icon="chevron"
              tone="accent"
              title={`Level ${result.level.after} reached`}
              body="Your ceiling just moved."
            />
          ) : null}

          {rankedUp ? (
            <Banner
              icon="crown"
              tone="warning"
              title={`${result.rank.after} unlocked`}
              body="New insignia earned."
            />
          ) : null}

          {result.streak.increased ? (
            <Banner
              icon="flame"
              tone="warning"
              title={`${result.streak.current} day streak`}
              body={
                result.streak.shield_used
                  ? "A streak shield covered your missed day."
                  : "Consistency compounds."
              }
            />
          ) : null}

          {result.quests_completed.map((quest) => (
            <Banner
              key={quest.id}
              icon={quest.is_bonus ? "star" : "target"}
              tone="success"
              title={quest.is_bonus ? "Board cleared" : "Quest complete"}
              body={quest.title}
            />
          ))}

          {result.achievements.map((achievement) => (
            <Banner
              key={achievement.code}
              icon={achievement.icon}
              tone="accent"
              title={achievement.name}
              body={achievement.description}
            />
          ))}

          {(notes ?? []).map((note) => (
            <p key={note} className="text-center text-xs text-ink-faint">
              {note}
            </p>
          ))}
        </div>

        <Button className="mt-7" size="lg" fullWidth onClick={onDismiss}>
          Continue
        </Button>
      </div>
    </div>
  );
}

function Banner({
  icon,
  title,
  body,
  tone,
}: {
  icon: string;
  title: string;
  body: string;
  tone: "accent" | "success" | "warning";
}) {
  const tones = {
    accent: "border-accent/45 bg-accent/12 text-accent-soft",
    success: "border-success/45 bg-success/10 text-success",
    warning: "border-warning/45 bg-warning/10 text-warning",
  } as const;

  return (
    <div
      className={cx("flex animate-pop items-center gap-3 rounded-xl border px-3.5 py-2.5", tones[tone])}
    >
      <Icon name={icon} size={17} />
      <span className="min-w-0">
        <span className="block font-display text-xs font-bold">{title}</span>
        <span className="block truncate text-[0.7rem] opacity-80">{body}</span>
      </span>
    </div>
  );
}
