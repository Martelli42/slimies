"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { StreakFlame } from "@/components/game/ambient";
import { Avatar } from "@/components/game/avatar";
import { Icon } from "@/components/icon";
import { ConfirmModal } from "@/components/ui/modal";
import { Button, EmptyState, Panel, PanelHeader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { formatNumber } from "@/lib/format";
import { rankForLevel } from "@/lib/ranks";
import type { FriendRequest } from "@/lib/types/database";

type FriendSummary = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  level: number;
  current_streak: number;
  weeklyXp: number;
};

type RequestEntry = {
  request: FriendRequest;
  profile?: { id: string; username: string; display_name: string; avatar_url: string | null; level: number };
};

export function FriendList({
  friends,
  incoming,
  outgoing,
}: {
  friends: FriendSummary[];
  incoming: RequestEntry[];
  outgoing: RequestEntry[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<FriendSummary | null>(null);

  async function respond(entry: RequestEntry, accept: boolean) {
    setBusy(entry.request.id);
    const response = await fetch("/api/friends/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: entry.request.id, accept }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(null);

    if (!response.ok) {
      toast.push({ title: "That did not work", message: body.error, tone: "danger" });
      return;
    }

    toast.push({
      title: accept ? "Ally added" : "Request declined",
      message: accept ? entry.profile?.display_name : undefined,
      tone: accept ? "success" : "info",
    });
    router.refresh();
  }

  async function remove(friend: FriendSummary) {
    setBusy(friend.id);
    const response = await fetch("/api/friends/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendId: friend.id }),
    });
    setBusy(null);
    setRemoving(null);

    if (!response.ok) {
      toast.push({ title: "Could not remove", tone: "danger" });
      return;
    }

    toast.push({ title: "Friend removed", tone: "info" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {incoming.length > 0 ? (
        <Panel>
          <PanelHeader eyebrow="Awaiting you" title="Incoming requests" />
          <ul className="space-y-2">
            {incoming.map((entry) => (
              <li
                key={entry.request.id}
                className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/8 p-3"
              >
                <Avatar
                  name={entry.profile?.display_name ?? "Player"}
                  src={entry.profile?.avatar_url}
                  size={38}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {entry.profile?.display_name ?? "Unknown player"}
                  </p>
                  <p className="text-[0.68rem] text-ink-faint">
                    Level {entry.profile?.level ?? 1}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => respond(entry, true)}
                    loading={busy === entry.request.id}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Decline"
                    onClick={() => respond(entry, false)}
                    disabled={busy === entry.request.id}
                  >
                    <Icon name="x" size={15} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel>
        <PanelHeader
          eyebrow={`${friends.length} allied`}
          title="Your party"
          action={
            <Link
              href="/friends/add"
              className="text-xs text-ink-faint transition-colors hover:text-ink"
            >
              Add
            </Link>
          }
        />

        {friends.length === 0 ? (
          <EmptyState
            title="No allies yet"
            message="Share your friend code — leaderboards are far better with company."
            icon={<Icon name="users" size={26} />}
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
          <ul className="space-y-2">
            {friends
              .slice()
              .sort((a, b) => b.weeklyXp - a.weeklyXp)
              .map((friend) => {
                const rank = rankForLevel(friend.level);
                return (
                  <li key={friend.id} className="flex items-center gap-3">
                    <Link
                      href={`/profile/${friend.username}`}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-hairline bg-abyss/40 p-3 transition-colors hover:border-accent/40"
                    >
                      <Avatar name={friend.display_name} src={friend.avatar_url} size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {friend.display_name}
                        </span>
                        <span
                          className="block text-[0.66rem]"
                          style={{ color: rank.tier.glow }}
                        >
                          Lv {friend.level} · {rank.label}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <StreakFlame days={friend.current_streak} size="sm" />
                        <span className="numeral text-xs text-accent-soft">
                          {formatNumber(friend.weeklyXp)}
                        </span>
                      </span>
                    </Link>
                    <button
                      onClick={() => setRemoving(friend)}
                      aria-label={`Remove ${friend.display_name}`}
                      className="text-ink-faint transition-colors hover:text-danger"
                    >
                      <Icon name="x" size={16} />
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </Panel>

      {outgoing.length > 0 ? (
        <Panel>
          <PanelHeader eyebrow="Pending" title="Sent requests" />
          <ul className="space-y-2">
            {outgoing.map((entry) => (
              <li key={entry.request.id} className="flex items-center gap-3 text-sm">
                <Avatar
                  name={entry.profile?.display_name ?? "Player"}
                  src={entry.profile?.avatar_url}
                  size={30}
                />
                <span className="min-w-0 flex-1 truncate">
                  {entry.profile?.display_name ?? "Unknown player"}
                </span>
                <span className="text-[0.68rem] text-ink-faint">Waiting</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <ConfirmModal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove(removing)}
        title="Remove this friend?"
        message="They drop off your leaderboard and stop seeing your activity. You can add them again later."
        confirmLabel="Remove"
        destructive
        loading={busy === removing?.id}
      />
    </div>
  );
}
