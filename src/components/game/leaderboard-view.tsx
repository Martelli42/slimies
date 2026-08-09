"use client";

import Link from "next/link";
import * as React from "react";

import { Avatar } from "@/components/game/avatar";
import { Icon } from "@/components/icon";
import { EmptyState, Panel, Skeleton, cx } from "@/components/ui/primitives";
import { ATTRIBUTE_LIST } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import { rankForLevel } from "@/lib/ranks";
import type { LeaderboardRow } from "@/lib/types/database";

type Scope = "friends" | "global";
type Metric =
  | "weekly"
  | "monthly"
  | "level"
  | "streak"
  | "strength"
  | "agility"
  | "wisdom"
  | "discipline"
  | "endurance";

const SCOPES: { value: Scope; label: string }[] = [
  { value: "friends", label: "Friends" },
  { value: "global", label: "Global" },
];

const PERIOD_METRICS: { value: Metric; label: string }[] = [
  { value: "weekly", label: "This week" },
  { value: "monthly", label: "This month" },
  { value: "level", label: "Level" },
  { value: "streak", label: "Streak" },
];

const ATTRIBUTE_METRICS: { value: Metric; label: string }[] = ATTRIBUTE_LIST.map((attr) => ({
  value: attr.key as Metric,
  label: attr.code,
}));

export function LeaderboardView({ initial }: { initial: LeaderboardRow[] }) {
  const [scope, setScope] = React.useState<Scope>("friends");
  const [metric, setMetric] = React.useState<Metric>("weekly");
  const [rows, setRows] = React.useState<LeaderboardRow[]>(initial);
  const [loading, setLoading] = React.useState(false);

  const first = React.useRef(true);

  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/leaderboard?scope=${scope}&metric=${metric}&limit=50`)
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled) setRows(body.rows ?? []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [scope, metric]);

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {SCOPES.map((option) => (
          <Chip
            key={option.value}
            active={scope === option.value}
            onClick={() => setScope(option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </div>

      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-1.5 pb-1">
          {[...PERIOD_METRICS, ...ATTRIBUTE_METRICS].map((option) => (
            <Chip
              key={option.value}
              active={metric === option.value}
              onClick={() => setMetric(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </div>

      <Panel className="p-0">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={scope === "friends" ? "No friends on the board" : "Nothing here yet"}
            message={
              scope === "friends"
                ? "Add allies and this fills up fast."
                : "Be the first to put a number on the board."
            }
            icon={<Icon name="trophy" size={26} />}
            action={
              scope === "friends" ? (
                <Link
                  href="/friends/add"
                  className="mt-1 text-xs font-semibold text-accent-soft hover:underline"
                >
                  Add a friend
                </Link>
              ) : null
            }
          />
        ) : (
          <ol className="divide-y divide-hairline">
            {rows.map((row) => (
              <li key={row.user_id}>
                <Link
                  href={`/profile/${row.username}`}
                  className={cx(
                    "flex items-center gap-3 p-3.5 transition-colors hover:bg-surface-2/50",
                    row.is_self && "bg-accent/8",
                  )}
                >
                  <span
                    className={cx(
                      "numeral w-7 shrink-0 text-center text-sm",
                      row.rank_position === 1 && "text-warning",
                      row.rank_position === 2 && "text-ink",
                      row.rank_position === 3 && "text-attr-endurance",
                      row.rank_position > 3 && "text-ink-faint",
                    )}
                  >
                    {row.rank_position}
                  </span>

                  <Avatar
                    name={row.display_name}
                    src={row.avatar_url}
                    size={36}
                    ring={row.is_self}
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {row.display_name}
                      {row.is_self ? (
                        <span className="ml-1.5 text-[0.66rem] text-accent-soft">you</span>
                      ) : null}
                    </span>
                    <span
                      className="block text-[0.66rem]"
                      style={{ color: rankForLevel(row.level).tier.glow }}
                    >
                      Lv {row.level} · {rankForLevel(row.level).label}
                    </span>
                  </span>

                  <Movement value={row.movement} />

                  <span className="numeral w-16 shrink-0 text-right text-sm">
                    {formatNumber(row.value)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

function Movement({ value }: { value: number }) {
  if (value > 0) {
    return (
      <span className="flex shrink-0 items-center text-[0.68rem] text-success">
        <Icon name="arrowUp" size={11} strokeWidth={2.6} />
        {value}
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="flex shrink-0 items-center text-[0.68rem] text-danger">
        <Icon name="arrowDown" size={11} strokeWidth={2.6} />
        {Math.abs(value)}
      </span>
    );
  }
  return (
    <span className="shrink-0 text-[0.68rem] text-ink-faint" aria-label="No change">
      —
    </span>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "rounded-full border px-3.5 py-2 font-display text-[0.68rem] font-bold tracking-[0.1em] uppercase transition-colors",
        active
          ? "border-accent/60 bg-accent/15 text-ink"
          : "border-hairline text-ink-muted hover:border-accent/30",
      )}
    >
      {children}
    </button>
  );
}
