import type { Metadata } from "next";

import { Icon } from "@/components/icon";
import { Panel, cx } from "@/components/ui/primitives";
import { getAchievements, requireProfile } from "@/lib/data";

export const metadata: Metadata = { title: "Achievements" };

export default async function AchievementsPage() {
  const profile = await requireProfile();
  const achievements = await getAchievements(profile.id);

  const unlocked = achievements.filter((a) => a.unlockedAt);
  const locked = achievements.filter((a) => !a.unlockedAt && !a.hidden);
  const secrets = achievements.filter((a) => !a.unlockedAt && a.hidden);

  return (
    <div className="space-y-4">
      <header>
        <p className="label-eyebrow">Record</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold">Achievements</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {unlocked.length} of {achievements.length - secrets.length} unlocked
          {secrets.length > 0 ? ` · ${secrets.length} hidden` : ""}
        </p>
      </header>

      {unlocked.length > 0 ? (
        <Section title="Unlocked">
          {unlocked.map((achievement) => (
            <AchievementRow
              key={achievement.id}
              icon={achievement.icon}
              name={achievement.name}
              description={achievement.description}
              xp={achievement.xp_reward}
              unlockedAt={achievement.unlockedAt}
            />
          ))}
        </Section>
      ) : null}

      {locked.length > 0 ? (
        <Section title="In progress">
          {locked.map((achievement) => (
            <AchievementRow
              key={achievement.id}
              icon={achievement.icon}
              name={achievement.name}
              description={achievement.description}
              xp={achievement.xp_reward}
              unlockedAt={null}
            />
          ))}
        </Section>
      ) : null}

      {secrets.length > 0 ? (
        <Section title={`Hidden · ${secrets.length}`}>
          <div className="flex flex-wrap gap-2 p-3.5">
            {secrets.map((achievement) => (
              <span
                key={achievement.id}
                title="Hidden achievement"
                className="flex size-11 items-center justify-center rounded-xl border border-dashed border-hairline text-ink-faint"
              >
                <Icon name="spark" size={17} />
              </span>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="label-eyebrow mb-2">{title}</h2>
      <Panel className="divide-y divide-hairline p-0">{children}</Panel>
    </section>
  );
}

function AchievementRow({
  icon,
  name,
  description,
  xp,
  unlockedAt,
}: {
  icon: string;
  name: string;
  description: string;
  xp: number;
  unlockedAt: string | null;
}) {
  return (
    <div className="flex items-center gap-3 p-3.5">
      <span
        className={cx(
          "flex size-11 shrink-0 items-center justify-center rounded-xl border",
          unlockedAt
            ? "border-accent/40 bg-accent/12 text-accent-soft"
            : "border-hairline bg-abyss/50 text-ink-faint",
        )}
      >
        <Icon name={icon} size={19} />
      </span>

      <div className="min-w-0 flex-1">
        <p className={cx("text-sm font-semibold", !unlockedAt && "text-ink-muted")}>{name}</p>
        <p className="text-[0.7rem] text-ink-faint">{description}</p>
      </div>

      {xp > 0 ? (
        <span
          className={cx(
            "numeral shrink-0 text-xs",
            unlockedAt ? "text-accent-soft" : "text-ink-faint",
          )}
        >
          +{xp}
        </span>
      ) : null}
    </div>
  );
}
