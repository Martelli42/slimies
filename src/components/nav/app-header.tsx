import Link from "next/link";

import { Avatar } from "@/components/game/avatar";
import { StreakFlame } from "@/components/game/ambient";
import { Icon } from "@/components/icon";
import { APP_NAME } from "@/lib/constants";
import type { Profile } from "@/lib/types/database";

export function AppHeader({
  profile,
  unread,
}: {
  profile: Profile;
  unread: number;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-void/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-lg items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+0.6rem)] pb-3">
        <Link href="/profile" className="flex items-center gap-2.5">
          <Avatar name={profile.display_name} src={profile.avatar_url} size={34} />
          <span className="min-w-0">
            <span className="block truncate font-display text-sm font-bold">
              {profile.display_name}
            </span>
            <span className="block text-[0.66rem] text-ink-faint">
              Level {profile.level}
            </span>
          </span>
        </Link>

        <span className="ml-auto flex items-center gap-2">
          <StreakFlame days={profile.current_streak} size="sm" />

          <Link
            href="/notifications"
            aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
            className="relative flex size-9 items-center justify-center rounded-lg border border-hairline text-ink-muted transition-colors hover:text-ink"
          >
            <Icon name="bell" size={17} />
            {unread > 0 ? (
              <span className="absolute -top-1 -right-1 flex min-w-4.5 items-center justify-center rounded-full bg-danger px-1 font-display text-[0.6rem] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </Link>

          <Link
            href="/settings"
            aria-label="Settings"
            className="flex size-9 items-center justify-center rounded-lg border border-hairline text-ink-muted transition-colors hover:text-ink"
          >
            <Icon name="gear" size={17} />
          </Link>
        </span>
      </div>
      <span className="sr-only">{APP_NAME}</span>
    </header>
  );
}
