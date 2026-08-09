/**
 * Timezone helpers.
 *
 * Quests reset and streaks tick over at the player's *local* midnight, so the
 * app never assumes the server's clock. The profile stores an IANA timezone and
 * everything date-shaped is derived from it.
 */

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** YYYY-MM-DD in the given timezone. */
export function localDate(timeZone: string, at: Date = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD, which is exactly what Postgres wants.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

/** Milliseconds until the player's next local midnight. */
export function msUntilLocalMidnight(timeZone: string, at: Date = new Date()): number {
  const today = localDate(timeZone, at);
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  // Approximate: good enough to schedule a refresh, never used for scoring.
  const offsetNow = timezoneOffsetMinutes(timeZone, at);
  const midnightUtc = tomorrow.getTime() + offsetNow * 60_000;
  return Math.max(0, midnightUtc - at.getTime());
}

function timezoneOffsetMinutes(timeZone: string, at: Date): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(at).map((p) => [p.type, p.value]),
    );
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return (at.getTime() - asUtc) / 60_000;
  } catch {
    return 0;
  }
}

/** Monday-anchored start of the ISO week containing `date`. */
export function startOfWeek(date: Date = new Date()): Date {
  const copy = new Date(date);
  const day = (copy.getDay() + 6) % 7; // Monday = 0
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - day);
  return copy;
}

/** Value for a `datetime-local` input, in the browser's own timezone. */
export function toDateTimeLocalValue(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
