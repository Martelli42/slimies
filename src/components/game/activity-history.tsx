"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Icon } from "@/components/icon";
import { ConfirmModal, Modal } from "@/components/ui/modal";
import { Badge, Button, Panel, cx } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { getActivityType } from "@/lib/activities";
import { ATTRIBUTE_LIST } from "@/lib/constants";
import { dayHeading, formatClock, formatDuration } from "@/lib/format";
import type { Activity } from "@/lib/types/database";

/**
 * Chronological record, grouped by local day. Deleting an activity unwinds its
 * XP server-side, which is why the row disappears only after the API confirms.
 */
export function ActivityHistory({
  activities,
  today,
  page,
  hasMore,
}: {
  activities: Activity[];
  today: string;
  page: number;
  hasMore: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [selected, setSelected] = React.useState<Activity | null>(null);
  const [confirming, setConfirming] = React.useState<Activity | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [removed, setRemoved] = React.useState<Set<string>>(new Set());

  const visible = activities.filter((a) => !removed.has(a.id));

  const groups = React.useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const activity of visible) {
      const list = map.get(activity.local_date) ?? [];
      list.push(activity);
      map.set(activity.local_date, list);
    }
    return [...map.entries()];
  }, [visible]);

  async function remove(activity: Activity) {
    setBusy(true);
    const response = await fetch(`/api/activities/${activity.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    setConfirming(null);
    setSelected(null);

    if (!response.ok) {
      toast.push({
        title: "Could not delete",
        message: body.error ?? "Try again in a moment.",
        tone: "danger",
      });
      return;
    }

    setRemoved((current) => new Set(current).add(activity.id));
    toast.push({ title: "Activity removed", message: "Its XP was reversed.", tone: "info" });
    router.refresh();
  }

  return (
    <>
      <div className="space-y-5">
        {groups.map(([date, items]) => (
          <section key={date}>
            <h2 className="label-eyebrow mb-2">{dayHeading(date, today)}</h2>
            <Panel className="divide-y divide-hairline p-0">
              {items.map((activity) => (
                <button
                  key={activity.id}
                  onClick={() => setSelected(activity)}
                  className="flex w-full items-start gap-3 p-3.5 text-left transition-colors hover:bg-surface-2/50"
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-hairline bg-abyss/60 text-ink-muted">
                    <Icon name={getActivityType(activity.activity_type)?.icon ?? "spark"} size={16} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm">{activity.title}</span>
                      <span className="numeral shrink-0 text-xs text-accent-soft">
                        +{activity.xp_total}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[0.68rem] text-ink-faint">
                      {formatClock(activity.occurred_at)} ·{" "}
                      {formatDuration(activity.duration_minutes)}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {ATTRIBUTE_LIST.map((attr) => {
                        const value = activity[attr.column];
                        if (!value) return null;
                        return (
                          <span
                            key={attr.key}
                            className="font-display text-[0.62rem] font-bold tracking-wider"
                            style={{ color: `var(${attr.cssVar})` }}
                          >
                            +{value} {attr.code}
                          </span>
                        );
                      })}
                    </span>
                  </span>
                </button>
              ))}
            </Panel>
          </section>
        ))}
      </div>

      {(page > 0 || hasMore) && (
        <div className="mt-5 flex gap-2">
          {page > 0 ? (
            <Link href={`/activity/history?page=${page - 1}`} className="flex-1">
              <Button variant="secondary" fullWidth>
                Newer
              </Button>
            </Link>
          ) : null}
          {hasMore ? (
            <Link href={`/activity/history?page=${page + 1}`} className="flex-1">
              <Button variant="secondary" fullWidth>
                Older
              </Button>
            </Link>
          ) : null}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title ?? "Activity"}
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge>{getActivityType(selected.activity_type)?.label ?? selected.activity_type}</Badge>
              <Badge>{formatDuration(selected.duration_minutes)}</Badge>
              <Badge tone="accent">+{selected.xp_total} XP</Badge>
            </div>

            {selected.description ? (
              <p className="text-sm text-ink">{selected.description}</p>
            ) : null}

            <ul className="space-y-1.5">
              {ATTRIBUTE_LIST.map((attr) => {
                const value = selected[attr.column];
                if (!value) return null;
                return (
                  <li key={attr.key} className="flex justify-between text-sm">
                    <span style={{ color: `var(${attr.cssVar})` }} className="font-display font-bold">
                      {attr.label}
                    </span>
                    <span className="numeral">+{value}</span>
                  </li>
                );
              })}
            </ul>

            {selected.classification ? (
              <p className="rounded-lg border border-hairline bg-abyss/60 p-3 text-xs text-ink-faint">
                {String(
                  (selected.classification as Record<string, unknown>).reason ??
                    "Evaluated by the system.",
                )}
              </p>
            ) : null}

            {selected.proof_url ? (
              <a
                href={selected.proof_url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 text-xs text-accent-soft hover:underline"
              >
                <Icon name="camera" size={13} /> View proof
              </a>
            ) : null}

            <p className="text-[0.7rem] text-ink-faint">
              Logged {formatClock(selected.created_at)} on{" "}
              {dayHeading(selected.local_date, today).toLowerCase()}
            </p>

            <Button
              variant="danger"
              fullWidth
              onClick={() => setConfirming(selected)}
              className={cx("mt-2")}
            >
              <Icon name="trash" size={15} /> Delete activity
            </Button>
          </div>
        ) : null}
      </Modal>

      <ConfirmModal
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        onConfirm={() => confirming && remove(confirming)}
        title="Delete this activity?"
        message="The XP it awarded is reversed, including any attribute progress. Quest progress for that day is recalculated."
        confirmLabel="Delete"
        destructive
        loading={busy}
      />
    </>
  );
}
