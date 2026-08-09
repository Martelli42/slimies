import { Icon } from "@/components/icon";
import { ATTRIBUTES, type AttributeKey } from "@/lib/constants";
import type { DailyQuest } from "@/lib/types/database";

/**
 * The System speaking.
 *
 * A deliberately in-character panel that reads like a terminal issuing orders,
 * rather than a habit tracker listing tasks. It is the one place in the app
 * that breaks the fourth wall on purpose.
 */
export function SystemNotice({
  quests,
  completed,
  bonusXp,
  date,
}: {
  quests: DailyQuest[];
  completed: number;
  bonusXp: number;
  date: string;
}) {
  const allDone = quests.length > 0 && completed === quests.length;

  return (
    <section className="panel relative overflow-hidden p-5 animate-rise">
      <div className="absolute inset-x-0 top-0 h-px beam-line" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full opacity-25 blur-3xl"
        style={{ background: "var(--color-accent)" }}
      />

      <header className="flex items-center gap-2">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-pulse-ring rounded-full bg-beam opacity-70" />
          <span className="relative inline-flex size-2 rounded-full bg-beam" />
        </span>
        <p className="label-eyebrow">
          {allDone ? "All objectives cleared" : "Daily quest issued"}
        </p>
        <time className="ml-auto text-[0.66rem] text-ink-faint" dateTime={date}>
          {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "short",
          })}
        </time>
      </header>

      <ul className="mt-4 space-y-1.5 font-mono text-[0.82rem]">
        {quests.map((quest) => (
          <li key={quest.id} className="flex items-start gap-2.5">
            <span className={quest.completed ? "text-success" : "text-ink-faint"}>
              {quest.completed ? (
                <Icon name="check" size={13} strokeWidth={2.6} className="mt-1" />
              ) : (
                <span className="mt-1 block size-3 rounded-[3px] border border-ink-faint" />
              )}
            </span>
            <span className={quest.completed ? "text-ink-faint line-through" : "text-ink"}>
              {objectiveLine(quest)}
            </span>
          </li>
        ))}
      </ul>

      <footer className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
        <p className="text-[0.7rem] text-ink-muted">
          {allDone ? (
            <span className="text-success">Bonus reward granted.</span>
          ) : (
            <>
              Complete all objectives:{" "}
              <span className="font-display font-bold text-accent-soft">
                +{bonusXp} bonus XP
              </span>
            </>
          )}
        </p>
        <p className="numeral text-sm">
          {completed}
          <span className="text-ink-faint"> / {quests.length}</span>
        </p>
      </footer>
    </section>
  );
}

function objectiveLine(quest: DailyQuest): string {
  const reward = Object.entries(quest.reward ?? {})
    .filter(([, value]) => value)
    .map(([key, value]) =>
      key === "player"
        ? `+${value} XP`
        : `+${value} ${ATTRIBUTES[key as AttributeKey]?.code ?? key}`,
    )
    .join(" ");

  const target =
    quest.kind === "manual"
      ? ""
      : quest.kind.endsWith("minutes")
        ? `: ${quest.target} min`
        : `: ${quest.target}`;

  return `${quest.title}${target}  ${reward}`.trim();
}
