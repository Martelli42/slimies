/**
 * Display helpers. Nothing here affects game state — purely presentation.
 */

/**
 * Attribute tiers.
 *
 * Attributes are stored as raw XP but shown as a tier number ("STR 31"), which
 * is far more readable than a five-digit total. Tiers start cheap and settle at
 * a flat cost so the number keeps moving for years.
 */
const TIER_BASE = 100;
const TIER_STEP = 20;
const TIER_MAX = 400;

export function attributeTierSize(tier: number): number {
  return Math.min(TIER_MAX, TIER_BASE + TIER_STEP * (Math.max(1, tier) - 1));
}

export function attributeTier(totalXp: number): {
  tier: number;
  into: number;
  size: number;
  ratio: number;
} {
  let remaining = Math.max(0, Math.floor(totalXp));
  let tier = 1;
  let size = attributeTierSize(tier);

  while (remaining >= size && tier < 10_000) {
    remaining -= size;
    tier += 1;
    size = attributeTierSize(tier);
  }

  return { tier, into: remaining, size, ratio: size > 0 ? remaining / size : 0 };
}

export function formatNumber(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString();
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function formatClock(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export function formatDay(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  });
}

export function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDay(iso);
}

/** "Today" / "Yesterday" / a date, for grouping the activity history. */
export function dayHeading(localDate: string, today: string): string {
  if (localDate === today) return "Today";

  const yesterday = new Date(`${today}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);
  if (localDate === yesterdayKey) return "Yesterday";

  return new Date(`${localDate}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
