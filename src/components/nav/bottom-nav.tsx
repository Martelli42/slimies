"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/icon";
import { cx } from "@/components/ui/primitives";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/quests", label: "Quests", icon: "scroll" },
  { href: "/leaderboard", label: "Ranking", icon: "trophy" },
  { href: "/profile", label: "Profile", icon: "user" },
];

export function BottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-hairline bg-abyss/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 items-end px-2">
        {TABS.slice(0, 2).map((tab) => (
          <NavTab key={tab.href} {...tab} active={isActive(tab.href)} />
        ))}

        <div className="flex justify-center">
          <Link
            href="/activity/new"
            aria-label="Log an activity"
            className="-mt-6 flex size-14 items-center justify-center rounded-2xl border border-accent-soft/40 bg-linear-to-b from-accent to-accent-deep text-white shadow-[0_10px_30px_-8px_var(--color-accent)] transition-transform active:scale-95"
          >
            <Icon name="plus" size={26} strokeWidth={2.2} />
          </Link>
        </div>

        {TABS.slice(2).map((tab) => (
          <NavTab key={tab.href} {...tab} active={isActive(tab.href)} />
        ))}
      </div>
    </nav>
  );
}

function NavTab({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: IconName;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex flex-col items-center gap-1 py-3 transition-colors",
        active ? "text-accent-soft" : "text-ink-faint hover:text-ink-muted",
      )}
    >
      <Icon name={icon} size={21} filled={active} strokeWidth={active ? 1.4 : 1.6} />
      <span className="font-display text-[0.58rem] font-bold tracking-[0.14em] uppercase">
        {label}
      </span>
    </Link>
  );
}
