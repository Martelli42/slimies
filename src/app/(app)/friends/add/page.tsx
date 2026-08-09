import type { Metadata } from "next";

import { AddFriendForm } from "@/components/game/add-friend-form";
import { FriendCode } from "@/components/game/friend-code";
import { requireProfile } from "@/lib/data";

export const metadata: Metadata = { title: "Add a friend" };

export default async function AddFriendPage() {
  const profile = await requireProfile();

  return (
    <div className="space-y-4">
      <header>
        <p className="label-eyebrow">Recruitment</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold">Add a friend</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Trade codes. Rivalry is the most reliable motivator there is.
        </p>
      </header>

      <FriendCode code={profile.friend_code} />
      <AddFriendForm />
    </div>
  );
}
