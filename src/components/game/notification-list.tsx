"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Icon, type IconName } from "@/components/icon";
import { Button, Panel, cx } from "@/components/ui/primitives";
import { relativeTime } from "@/lib/format";
import type { AppNotification, NotificationKind } from "@/lib/types/database";

const ICONS: Record<NotificationKind, IconName> = {
  quest: "target",
  friend_request: "users",
  friend_accepted: "users",
  level_up: "chevron",
  rank_up: "crown",
  achievement: "medal",
  streak: "flame",
  leaderboard: "trophy",
  weekly_report: "chart",
  system: "bolt",
};

export function NotificationList({
  notifications,
}: {
  notifications: AppNotification[];
}) {
  const router = useRouter();
  const [items, setItems] = React.useState(notifications);
  const [busy, setBusy] = React.useState(false);

  // Re-sync when the server sends a fresh list (after router.refresh()).
  const [lastServerList, setLastServerList] = React.useState(notifications);
  if (lastServerList !== notifications) {
    setLastServerList(notifications);
    setItems(notifications);
  }

  const unread = items.filter((n) => !n.read).length;

  async function markAllRead() {
    setBusy(true);
    // Optimistic: the list is already correct locally if the call succeeds.
    setItems((current) => current.map((n) => ({ ...n, read: true })));

    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setBusy(false);

    if (!response.ok) {
      setItems(notifications);
      return;
    }
    router.refresh();
  }

  return (
    <>
      {unread > 0 ? (
        <Button variant="secondary" size="sm" onClick={markAllRead} loading={busy}>
          Mark all read
        </Button>
      ) : null}

      <Panel className="divide-y divide-hairline p-0">
        {items.map((notification) => {
          const body = (
            <>
              <span
                className={cx(
                  "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border",
                  notification.read
                    ? "border-hairline bg-abyss/50 text-ink-faint"
                    : "border-accent/40 bg-accent/12 text-accent-soft",
                )}
              >
                <Icon name={ICONS[notification.kind] ?? "bell"} size={16} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span
                    className={cx(
                      "truncate text-sm",
                      notification.read ? "text-ink-muted" : "font-semibold text-ink",
                    )}
                  >
                    {notification.title}
                  </span>
                  <span className="shrink-0 text-[0.66rem] text-ink-faint">
                    {relativeTime(notification.created_at)}
                  </span>
                </span>
                <span className="mt-0.5 block text-[0.72rem] text-ink-muted">
                  {notification.message}
                </span>
              </span>
            </>
          );

          return (
            <div key={notification.id}>
              {notification.href ? (
                <Link
                  href={notification.href}
                  className="flex items-start gap-3 p-3.5 transition-colors hover:bg-surface-2/50"
                >
                  {body}
                </Link>
              ) : (
                <div className="flex items-start gap-3 p-3.5">{body}</div>
              )}
            </div>
          );
        })}
      </Panel>
    </>
  );
}
