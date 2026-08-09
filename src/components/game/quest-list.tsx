"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { Icon } from "@/components/icon";
import { Spinner, cx } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ATTRIBUTES, type AttributeKey } from "@/lib/constants";
import type { DailyQuest } from "@/lib/types/database";

/**
 * The quest board. Automatic quests fill from logged activities; manual ones
 * are the only kind the player checks off, and even then the server decides
 * whether the reward is paid.
 */
export function QuestList({
  quests,
  compact = false,
}: {
  quests: DailyQuest[];
  compact?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState<string | null>(null);

  async function complete(quest: DailyQuest) {
    setPending(quest.id);

    const response = await fetch(`/api/quests/${quest.id}/complete`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setPending(null);

    if (!response.ok) {
      toast.push({
        title: "Could not complete that",
        message: body.error ?? "Try again in a moment.",
        tone: "danger",
      });
      return;
    }

    const completed = (body.quests_completed ?? []) as { title: string; is_bonus: boolean }[];
    const bonus = completed.find((q) => q.is_bonus);

    toast.push({
      title: bonus ? "Board cleared" : "Quest complete",
      message: bonus ? "Every objective done — bonus XP awarded." : quest.title,
      tone: "success",
    });
    router.refresh();
  }

  const core = quests.filter((q) => !q.is_bonus);
  const bonus = quests.find((q) => q.is_bonus);

  return (
    <ul className={cx("space-y-2", compact && "space-y-1.5")}>
      {core.map((quest) => (
        <QuestRow
          key={quest.id}
          quest={quest}
          compact={compact}
          pending={pending === quest.id}
          onComplete={quest.kind === "manual" ? () => complete(quest) : undefined}
        />
      ))}

      {bonus ? (
        <li>
          <div
            className={cx(
              "flex items-center gap-3 rounded-xl border p-3",
              bonus.completed
                ? "border-warning/45 bg-warning/10"
                : "border-dashed border-hairline bg-abyss/40",
            )}
          >
            <Icon
              name="star"
              size={18}
              filled={bonus.completed}
              className={bonus.completed ? "text-warning" : "text-ink-faint"}
            />
            <div className="min-w-0 flex-1">
              <p className="font-display text-xs font-bold">{bonus.title}</p>
              <p className="text-[0.68rem] text-ink-faint">
                {bonus.progress} / {bonus.target} objectives · {rewardText(bonus.reward)}
              </p>
            </div>
          </div>
        </li>
      ) : null}
    </ul>
  );
}

function QuestRow({
  quest,
  compact,
  pending,
  onComplete,
}: {
  quest: DailyQuest;
  compact: boolean;
  pending: boolean;
  onComplete?: () => void;
}) {
  const ratio = quest.target > 0 ? Math.min(1, quest.progress / quest.target) : 0;
  const interactive = Boolean(onComplete) && !quest.completed;

  const body = (
    <>
      <span
        className={cx(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          quest.completed
            ? "border-success bg-success/20 text-success"
            : interactive
              ? "border-hairline text-transparent group-hover:border-accent/60"
              : "border-hairline text-transparent",
        )}
      >
        {pending ? <Spinner className="size-3" /> : <Icon name="check" size={13} strokeWidth={2.4} />}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={cx(
            "block text-sm",
            quest.completed ? "text-ink-faint line-through" : "text-ink",
          )}
        >
          {quest.title}
        </span>

        {!compact && quest.description ? (
          <span className="mt-0.5 block text-[0.7rem] text-ink-faint">
            {quest.description}
          </span>
        ) : null}

        {quest.kind !== "manual" ? (
          <span className="mt-1.5 block">
            <span className="block h-1 w-full overflow-hidden rounded-full bg-abyss">
              <span
                className="block h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${ratio * 100}%` }}
              />
            </span>
            <span className="mt-1 block text-[0.66rem] text-ink-faint">
              {quest.progress} / {quest.target}
              {quest.kind.endsWith("minutes") ? " min" : ""} · {rewardText(quest.reward)}
            </span>
          </span>
        ) : (
          <span className="mt-1 block text-[0.66rem] text-ink-faint">
            {rewardText(quest.reward)}
          </span>
        )}
      </span>
    </>
  );

  return (
    <li>
      {interactive ? (
        <button
          type="button"
          onClick={onComplete}
          disabled={pending}
          className="group flex w-full items-start gap-3 rounded-xl border border-hairline bg-abyss/40 p-3 text-left transition-colors hover:border-accent/40 disabled:opacity-60"
        >
          {body}
        </button>
      ) : (
        <div
          className={cx(
            "flex items-start gap-3 rounded-xl border p-3",
            quest.completed
              ? "border-success/35 bg-success/8"
              : "border-hairline bg-abyss/40",
          )}
        >
          {body}
        </div>
      )}
    </li>
  );
}

function rewardText(reward: DailyQuest["reward"]): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(reward ?? {})) {
    if (!value) continue;
    if (key === "player") parts.push(`+${value} XP`);
    else parts.push(`+${value} ${ATTRIBUTES[key as AttributeKey]?.code ?? key.toUpperCase()}`);
  }
  return parts.join(" · ") || "No reward";
}
