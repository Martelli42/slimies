import type { Metadata } from "next";

import { Icon } from "@/components/icon";
import { ActivityHistory } from "@/components/game/activity-history";
import { EmptyState, Panel } from "@/components/ui/primitives";
import { getRecentActivities, requireProfile } from "@/lib/data";
import { localDate } from "@/lib/time";

export const metadata: Metadata = { title: "Activity history" };

const PAGE_SIZE = 40;

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const profile = await requireProfile();
  const { page } = await searchParams;
  const pageIndex = Math.max(0, Number(page ?? 0) || 0);

  const activities = await getRecentActivities(
    profile.id,
    PAGE_SIZE + 1,
    pageIndex * PAGE_SIZE,
  );

  const hasMore = activities.length > PAGE_SIZE;

  return (
    <div className="space-y-4">
      <header>
        <p className="label-eyebrow">Record</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold">Activity history</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {profile.activities_count.toLocaleString()} activities ·{" "}
          {Math.round(profile.total_minutes / 60).toLocaleString()} hours logged
        </p>
      </header>

      {activities.length === 0 ? (
        <Panel>
          <EmptyState
            title="Nothing logged yet"
            message="Your first submission starts the record — and the streak."
            icon={<Icon name="scroll" size={26} />}
          />
        </Panel>
      ) : (
        <ActivityHistory
          activities={activities.slice(0, PAGE_SIZE)}
          today={localDate(profile.timezone)}
          page={pageIndex}
          hasMore={hasMore}
        />
      )}
    </div>
  );
}
