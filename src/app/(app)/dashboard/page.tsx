import Link from "next/link";
import type { Metadata } from "next";

import { AttributeBars } from "@/components/game/attributes";
import { RankBadge } from "@/components/game/rank-badge";
import { CountUp, XPBar } from "@/components/game/xp-bar";
import { Icon } from "@/components/icon";
import { QuestList } from "@/components/game/quest-list";
import { Badge, EmptyState, Panel, PanelHeader } from "@/components/ui/primitives";
import { Avatar } from "@/components/game/avatar";
import {
  getFriendFeed,
  getTodayQuests,
  getTodaySummary,
  requireProfile,
} from "@/lib/data";
import { formatDuration, formatNumber, relativeTime } from "@/lib/format";
import { levelFromTotalXp } from "@/lib/leveling";
import { rankForLevel } from "@/lib/ranks";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const profile = await requireProfile();
  const [{ quests }, summary, feed] = await Promise.all([
    getTodayQuests(profile),
    getTodaySummary(profile),
    getFriendFeed(profile.id, 8),
  ]);

  const progress = levelFromTotalXp(profile.total_xp);
  const rank = rankForLevel(profile.level);
  const core = quests.filter((q) => !q.is_bonus);
  const done = core.filter((q) => q.completed).length;

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------- status card */}
      <Panel className="relative overflow-hidden animate-rise">
        <div className="absolute inset-x-0 top-0 h-px beam-line" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="label-eyebrow">Player</p>
            <h1 className="mt-0.5 truncate font-display text-xl font-extrabold">
              {profile.display_name}
            </h1>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="numeral text-3xl glow-text text-accent-soft">
                {progress.level}
              </span>
              <span className="label-eyebrow">Level</span>
            </p>
          </div>
          <RankBadge level={profile.level} size={62} />
        </div>

        <p
          className="mt-1 font-display text-xs font-bold tracking-[0.16em] uppercase"
          style={{ color: rank.tier.glow }}
        >
          {rank.label}
        </p>

        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="label-eyebrow">Experience</span>
            <span className="numeral text-ink-muted">
              <CountUp value={progress.intoLevel} /> / {formatNumber(progress.required)}
            </span>
          </div>
          <XPBar value={progress.intoLevel} max={progress.required} height={12} />
        </div>
      </Panel>

      {/* --------------------------------------------------------- attributes */}
      <Panel className="animate-rise" style={{ animationDelay: "60ms" }}>
        <PanelHeader
          eyebrow="Character"
          title="Attributes"
          action={
            <Link
              href="/profile"
              className="text-xs text-ink-faint transition-colors hover:text-ink"
            >
              Full sheet
            </Link>
          }
        />
        <AttributeBars
          values={{
            strength: profile.strength_xp,
            agility: profile.agility_xp,
            wisdom: profile.wisdom_xp,
            discipline: profile.discipline_xp,
            endurance: profile.endurance_xp,
          }}
        />
      </Panel>

      {/* ------------------------------------------------------------- quests */}
      <Panel className="animate-rise" style={{ animationDelay: "120ms" }}>
        <PanelHeader
          eyebrow="Today"
          title="Daily quests"
          action={
            <Badge tone={done === core.length && core.length > 0 ? "success" : "neutral"}>
              {done} / {core.length} done
            </Badge>
          }
        />
        {quests.length === 0 ? (
          <EmptyState
            title="No quests issued yet"
            message="Open the quest board to have today's objectives generated."
            action={
              <Link
                href="/quests"
                className="mt-1 text-xs font-semibold text-accent-soft hover:underline"
              >
                Open quest board
              </Link>
            }
          />
        ) : (
          <QuestList quests={quests} compact />
        )}
      </Panel>

      {/* ------------------------------------------------------------ summary */}
      <Panel className="animate-rise" style={{ animationDelay: "180ms" }}>
        <PanelHeader eyebrow="Today" title="Progress" />
        <dl className="grid grid-cols-2 gap-3">
          <Stat label="Activities" value={formatNumber(summary.activities)} />
          <Stat label="XP earned" value={formatNumber(summary.xp)} accent />
          <Stat label="Training" value={formatDuration(summary.trainingMinutes)} />
          <Stat label="Learning" value={formatDuration(summary.learningMinutes)} />
        </dl>
      </Panel>

      {/* -------------------------------------------------------- friend feed */}
      <Panel className="animate-rise" style={{ animationDelay: "240ms" }}>
        <PanelHeader
          eyebrow="Allies"
          title="Friend activity"
          action={
            <Link
              href="/friends"
              className="text-xs text-ink-faint transition-colors hover:text-ink"
            >
              All friends
            </Link>
          }
        />
        {feed.length === 0 ? (
          <EmptyState
            title="Nobody to watch yet"
            message="Add a friend by code and their milestones show up here."
            icon={<Icon name="users" size={24} />}
            action={
              <Link
                href="/friends/add"
                className="mt-1 text-xs font-semibold text-accent-soft hover:underline"
              >
                Add a friend
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {feed.map((event) => (
              <li key={event.id} className="flex items-center gap-3">
                <Avatar name={event.display_name} src={event.avatar_url} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <Link
                      href={`/profile/${event.username}`}
                      className="font-semibold hover:text-accent-soft"
                    >
                      {event.display_name}
                    </Link>{" "}
                    <span className="text-ink-muted">{describe(event.kind, event.title)}</span>
                  </p>
                  <p className="text-[0.68rem] text-ink-faint">
                    {event.detail ? `${event.detail} · ` : ""}
                    {relativeTime(event.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function describe(kind: string, title: string): string {
  switch (kind) {
    case "level_up":
    case "rank_up":
    case "streak":
      return title.charAt(0).toLowerCase() + title.slice(1);
    case "achievement":
      return `unlocked ${title}`;
    default:
      return `logged ${title}`;
  }
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-abyss/50 p-3">
      <dt className="label-eyebrow">{label}</dt>
      <dd
        className={`numeral mt-1 text-lg ${accent ? "text-accent-soft" : "text-ink"}`}
      >
        {value}
      </dd>
    </div>
  );
}
