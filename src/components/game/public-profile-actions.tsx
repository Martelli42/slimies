"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { Icon } from "@/components/icon";
import { ConfirmModal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

/** Friend actions on someone else's profile. */
export function PublicProfileActions({
  userId,
  username,
  displayName,
  isFriend,
  pending,
}: {
  userId: string;
  username: string;
  displayName: string;
  isFriend: boolean;
  pending: "incoming" | "outgoing" | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  async function sendRequest() {
    setBusy(true);
    const response = await fetch("/api/friends/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: username }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      toast.push({ title: "Could not send", message: body.error, tone: "danger" });
      return;
    }

    toast.push({ title: "Request sent", message: displayName, tone: "success" });
    router.refresh();
  }

  async function removeFriend() {
    setBusy(true);
    const response = await fetch("/api/friends/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendId: userId }),
    });
    setBusy(false);
    setConfirming(false);

    if (!response.ok) {
      toast.push({ title: "Could not remove", tone: "danger" });
      return;
    }

    toast.push({ title: "Friend removed", tone: "info" });
    router.refresh();
  }

  if (isFriend) {
    return (
      <>
        <Button variant="secondary" fullWidth onClick={() => setConfirming(true)}>
          <Icon name="users" size={15} /> Allied — remove
        </Button>
        <ConfirmModal
          open={confirming}
          onClose={() => setConfirming(false)}
          onConfirm={removeFriend}
          title={`Remove ${displayName}?`}
          message="They drop off your leaderboard and stop seeing your activity."
          confirmLabel="Remove"
          destructive
          loading={busy}
        />
      </>
    );
  }

  if (pending === "outgoing") {
    return (
      <Button variant="secondary" fullWidth disabled>
        Request pending
      </Button>
    );
  }

  if (pending === "incoming") {
    return (
      <Button fullWidth onClick={() => router.push("/friends")}>
        Respond to their request
      </Button>
    );
  }

  return (
    <Button fullWidth onClick={sendRequest} loading={busy}>
      <Icon name="plus" size={15} /> Add as ally
    </Button>
  );
}
