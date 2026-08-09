import { Panel, PanelHeader } from "@/components/ui/primitives";
import { ATTRIBUTES, type AttributeKey } from "@/lib/constants";
import { formatDuration, formatNumber } from "@/lib/format";
import type { WeeklyReport } from "@/lib/types/database";

/**
 * Sunday summary. Rendered inline on the profile as well as delivered as a
 * notification by the weekly cron.
 */
export function WeeklyReportCard({ report }: { report: WeeklyReport }) {
  const levelled = report.level_end > report.level_start;
  const entries = (Object.entries(report.attributes) as [AttributeKey, number][])
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1]);

  const empty = report.activities === 0;

  return (
    <Panel className="animate-rise">
      <PanelHeader
        eyebrow={`${formatDate(report.week_start)} – ${formatDate(report.week_end)}`}
        title="Weekly report"
      />

      {empty ? (
        <p className="text-xs text-ink-muted">
          Nothing logged this week yet. One activity is enough to start the record.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <p className="numeral text-3xl text-accent-soft">
              {formatNumber(report.player_xp)}
            </p>
            <p className="label-eyebrow">XP earned</p>
          </div>

          {levelled ? (
            <p className="mt-1 text-xs text-success">
              Level {report.level_start} → {report.level_end}
            </p>
          ) : null}

          <ul className="mt-4 space-y-1.5">
            {entries.map(([key, value]) => (
              <li key={key} className="flex items-center gap-2">
                <span
                  className="w-9 font-display text-[0.68rem] font-extrabold tracking-[0.14em]"
                  style={{ color: `var(${ATTRIBUTES[key].cssVar})` }}
                >
                  {ATTRIBUTES[key].code}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-abyss">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.round((value / (entries[0]?.[1] || 1)) * 100)}%`,
                      background: ATTRIBUTES[key].hex,
                    }}
                  />
                </span>
                <span className="numeral w-10 text-right text-xs text-ink-muted">
                  +{value}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <Row label="Active days" value={`${report.active_days} / 7`} />
            <Row label="Activities" value={String(report.activities)} />
            <Row label="Time" value={formatDuration(report.minutes)} />
            <Row
              label="Among friends"
              value={report.friend_rank ? `#${report.friend_rank}` : "—"}
            />
          </dl>

          <p className="mt-4 rounded-lg border border-hairline bg-abyss/60 p-3 text-xs text-ink-muted">
            Strongest: <span className="text-ink">{report.strongest}</span>. Weakest:{" "}
            <span className="text-ink">{report.weakest}</span>. Focus there next week.
          </p>
        </>
      )}
    </Panel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-hairline bg-abyss/40 px-3 py-2">
      <dt className="text-[0.62rem] tracking-wide text-ink-faint uppercase">{label}</dt>
      <dd className="numeral mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}
