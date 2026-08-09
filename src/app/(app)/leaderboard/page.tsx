import type { Metadata } from "next";

import { LeaderboardView } from "@/components/game/leaderboard-view";
import { requireProfile } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { LeaderboardRow } from "@/lib/types/database";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function LeaderboardPage() {
  const profile = await requireProfile();

  const supabase = await createClient();
  const { data } = await supabase.rpc("leaderboard", {
    p_user: profile.id,
    p_scope: "friends",
    p_metric: "weekly",
    p_limit: 50,
  });

  return (
    <div className="space-y-4">
      <header>
        <p className="label-eyebrow">Standings</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold">Leaderboard</h1>
      </header>

      <LeaderboardView initial={(data as LeaderboardRow[]) ?? []} />
    </div>
  );
}
