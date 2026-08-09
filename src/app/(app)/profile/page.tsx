import Link from "next/link";
import type { Metadata } from "next";

import { StreakFlame } from "@/components/game/ambient";
import { AttributeBars, AttributeRadar } from "@/components/game/attributes";
import { Avatar } from "@/components/game/avatar";
import { FriendCode } from "@/components/game/friend-code";
import { RankBadge } from "@/components/game/rank-badge";
import { WeeklyReportCard } from "@/components/game/weekly-report";
import { XPBar } from "@/components/game/xp-bar";
import { Icon } from "@/components/icon";
import { Panel, PanelHeader } from "@/components/ui/primitives";
import { getAchievements, getFriends, requireProfile } from "@/lib/data";
import { formatMonthYear, formatNumber } from "@/lib/format";
import { levelFromTotalXp } from "@/lib/leveling";
import { rankForLevel } from "@/lib/ranks";
import { createClient } from "@/lib/supabase/server";
import type { WeeklyReport } from "@/lib/types/database";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const profile = await requireProfile();

  const supabase = await createClient();
  const [achievements, friends, { data: report }] = await Promise.all([
    getAchievements(profile.id),
    getFriends(profile.id),
    supabase.rpc("weekly_report", { p_user: profile.id, p_week_start: null }),
  ]);

  const progress = levelFromTotalXp(profile.total_xp);
  const rank = rankForLevel(profile.level);
  const unlocked = achievements.filter((a) => a.unlockedAt).length;
  const visibleTotal = achievements.filter((a) => !a.hidden || a.unlockedAt).length;

  const attributes = {
    strength: profile.strength_xp,
    agility: profile.agility_xp,
    wisdom: profile.wisdom_xp,
    discipline: profile.discipline_xp,
    endurance: profile.endurance_xp,
  };

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------- character sheet */}
      <Panel className="relative overflow-hidden animate-rise">
        <div className="absolute inset-x-0 top-0 h-px beam-line" />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 left-1/2 size-56 -translate-x-1/2 rounded-full opacity-20 blur-3xl"
          style={{ background: rank.tier.glow }}
        />

        <div className="relative flex flex-col items-center pt-2 text-center">
          <Avatar name={profile.display_name} src={profile.avatar_url} size={84} ring />

          <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight">
            {profile.display_name}
          </h1>
          <p className="text-xs text-ink-faint">@{profile.username}</p>

          <p className="mt-4 numeral text-5xl leading-none glow-text text-accent-soft">
            {progress.level}
          </p>
          <p className="label-eyebrow mt-1">Level</p>

          <div className="mt-4">
            <RankBadge level={profile.level} size={54} showLabel />
          </div>

          <div className="mt-5 w-full">
            <div className="mb-1.5 flex items-baseline justify-between text-xs">
              <span className="label-eyebrow">Experience</span>
              <span className="numeral text-ink-muted">
                {formatNumber(progress.intoLevel)} / {formatNumber(progress.required)}
              </span>
            </div>
            <XPBar value={progress.intoLevel} max={progress.required} height={12} />
          </div>
        </div>
      </Panel>

      {/* ------------------------------------------------------------ radar */}
      <Panel className="animate-rise" style={{ animationDelay: "60ms" }}>
        <PanelHeader eyebrow="Distribution" title="Attributes" />
        <AttributeRadar values={attributes} />
        <div className="mt-4">
          <AttributeBars values={attributes} />
        </div>
      </Panel>

      {/* ------------------------------------------------------------ stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Current streak"
          value={<StreakFlame days={profile.current_streak} />}
          footnote={`Best: ${profile.longest_streak} days`}
        />
        <StatTile
          label="Shields"
          value={<span className="numeral text-lg">{profile.streak_shields}</span>}
          footnote="Absorbs one missed day"
        />
        <StatTile
          label="Activities"
          value={
            <span className="numeral text-lg">{formatNumber(profile.activities_count)}</span>
          }
          footnote={`${formatNumber(Math.round(profile.total_minutes / 60))} hours`}
        />
        <StatTile
          label="Allies"
          value={<span className="numeral text-lg">{friends.length}</span>}
          footnote="Compare on the ranking tab"
        />
      </div>

      {/* --------------------------------------------------- weekly report */}
      {report ? <WeeklyReportCard report={report as WeeklyReport} /> : null}

      {/* ------------------------------------------------------ achievements */}
      <Panel className="animate-rise">
        <PanelHeader
          eyebrow={`${unlocked} of ${visibleTotal}`}
          title="Achievements"
          action={
            <Link
              href="/achievements"
              className="text-xs text-ink-faint transition-colors hover:text-ink"
            >
              View all
            </Link>
          }
        />
        <div className="flex flex-wrap gap-2">
          {achievements
            .filter((a) => a.unlockedAt)
            .slice(0, 8)
            .map((achievement) => (
              <span
                key={achievement.id}
                title={achievement.name}
                className="flex size-11 items-center justify-center rounded-xl border border-accent/35 bg-accent/12 text-accent-soft"
              >
                <Icon name={achievement.icon} size={19} />
              </span>
            ))}
          {unlocked === 0 ? (
            <p className="text-xs text-ink-faint">
              Nothing unlocked yet. The first one is a single activity away.
            </p>
          ) : null}
        </div>
      </Panel>

      <FriendCode code={profile.friend_code} />

      <p className="pt-2 text-center text-[0.7rem] text-ink-faint">
        Awakened {formatMonthYear(profile.created_at)}
      </p>
    </div>
  );
}

function StatTile({
  label,
  value,
  footnote,
}: {
  label: string;
  value: React.ReactNode;
  footnote: string;
}) {
  return (
    <div className="panel-flat p-3.5">
      <p className="label-eyebrow">{label}</p>
      <div className="mt-2">{value}</div>
      <p className="mt-1.5 text-[0.66rem] text-ink-faint">{footnote}</p>
    </div>
  );
}
