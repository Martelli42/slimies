import Link from "next/link";
import type { Metadata } from "next";

import { FriendList } from "@/components/game/friend-list";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/primitives";
import { FriendCode } from "@/components/game/friend-code";
import { getFriendRequests, getFriends, requireProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Friends" };

export default async function FriendsPage() {
  const profile = await requireProfile();
  const [friends, requests] = await Promise.all([
    getFriends(profile.id),
    getFriendRequests(profile.id),
  ]);

  // Today's XP per friend, so the list shows who is actually moving.
  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("leaderboard", {
    p_user: profile.id,
    p_scope: "friends",
    p_metric: "weekly",
    p_limit: 100,
  });

  const weeklyXp = new Map<string, number>(
    ((rows as { user_id: string; value: number }[]) ?? []).map((r) => [r.user_id, r.value]),
  );

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="label-eyebrow">Allies</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold">Friends</h1>
        </div>
        <Link href="/friends/add">
          <Button size="sm">
            <Icon name="plus" size={14} /> Add
          </Button>
        </Link>
      </header>

      <FriendCode code={profile.friend_code} />

      <FriendList
        friends={friends.map((friend) => ({
          ...friend,
          weeklyXp: weeklyXp.get(friend.id) ?? 0,
        }))}
        incoming={requests.incoming}
        outgoing={requests.outgoing}
      />
    </div>
  );
}
