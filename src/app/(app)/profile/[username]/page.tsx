import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { StreakFlame } from "@/components/game/ambient";
import { AttributeRadar } from "@/components/game/attributes";
import { Avatar } from "@/components/game/avatar";
import { PublicProfileActions } from "@/components/game/public-profile-actions";
import { RankBadge } from "@/components/game/rank-badge";
import { XPBar } from "@/components/game/xp-bar";
import { Icon } from "@/components/icon";
import { Badge, EmptyState, Panel, PanelHeader } from "@/components/ui/primitives";
import { requireProfile } from "@/lib/data";
import { formatMonthYear, formatNumber } from "@/lib/format";
import { levelFromTotalXp } from "@/lib/leveling";
import { rankForLevel } from "@/lib/ranks";
import { createClient } from "@/lib/supabase/server";
import type { PublicProfile } from "@/lib/types/database";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const viewer = await requireProfile();
  const { username } = await params;

  if (username.toLowerCase() === viewer.username) {
    // Their own page lives at /profile with the full sheet.
    const { redirect } = await import("next/navigation");
    redirect("/profile");
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("public_profile", {
    p_viewer: viewer.id,
    p_username: username.toLowerCase(),
  });

  const target = data as PublicProfile | null;
  if (!target) notFound();

  const progress = target.total_xp !== null ? levelFromTotalXp(target.total_xp) : null;
  const rank = target.level ? rankForLevel(target.level) : null;

  return (
    <div className="space-y-4">
      <Panel className="relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-px beam-line" />

        <div className="flex flex-col items-center text-center">
          <Avatar name={target.display_name} src={target.avatar_url} size={76} ring />
          <h1 className="mt-3 font-display text-xl font-extrabold">{target.display_name}</h1>
          <p className="text-xs text-ink-faint">@{target.username}</p>

          {target.is_friend ? (
            <Badge tone="success" className="mt-2">
              <Icon name="users" size={11} /> Ally
            </Badge>
          ) : null}

          {target.bio ? (
            <p className="mt-3 max-w-xs text-sm text-ink-muted">{target.bio}</p>
          ) : null}

          {target.visible && progress && rank ? (
            <>
              <p className="mt-4 numeral text-4xl glow-text text-accent-soft">
                {target.level}
              </p>
              <p className="label-eyebrow mt-1">Level</p>
              <div className="mt-3">
                <RankBadge level={target.level ?? 1} size={48} showLabel />
              </div>
              <div className="mt-4 w-full">
                <XPBar value={progress.intoLevel} max={progress.required} height={10} />
                <p className="numeral mt-1.5 text-xs text-ink-muted">
                  {formatNumber(progress.intoLevel)} / {formatNumber(progress.required)}
                </p>
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-5">
          <PublicProfileActions
            userId={target.id}
            username={target.username}
            displayName={target.display_name}
            isFriend={target.is_friend}
            pending={target.friend_request}
          />
        </div>
      </Panel>

      {target.visible && target.attributes ? (
        <>
          <Panel>
            <PanelHeader eyebrow="Character" title="Attributes" />
            <AttributeRadar values={target.attributes} />
          </Panel>

          <div className="grid grid-cols-2 gap-3">
            <Tile
              label="Streak"
              value={<StreakFlame days={target.current_streak ?? 0} />}
              footnote={`Best: ${target.longest_streak ?? 0} days`}
            />
            <Tile
              label="Activities"
              value={
                <span className="numeral text-lg">
                  {formatNumber(target.activities_count ?? 0)}
                </span>
              }
              footnote="Logged all time"
            />
            <Tile
              label="Achievements"
              value={<span className="numeral text-lg">{target.achievements ?? 0}</span>}
              footnote="Unlocked"
            />
            <Tile
              label="Allies"
              value={<span className="numeral text-lg">{target.friends}</span>}
              footnote="Friends"
            />
          </div>
        </>
      ) : (
        <Panel>
          <EmptyState
            title="This profile is private"
            message="Become allies to see their stats, streak and progress."
            icon={<Icon name="shield" size={26} />}
          />
        </Panel>
      )}

      <p className="pb-2 text-center text-[0.7rem] text-ink-faint">
        Awakened {formatMonthYear(target.created_at)}
      </p>
    </div>
  );
}

function Tile({
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
