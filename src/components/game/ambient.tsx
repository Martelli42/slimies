import { cx } from "@/components/ui/primitives";
import { Icon } from "@/components/icon";

/**
 * Background texture: a slow drifting starfield rendered once as an SVG
 * pattern. Cheap (no JS, no canvas) and quiet enough to sit behind content.
 */
export function Ambient({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx("pointer-events-none fixed inset-0 -z-10 overflow-hidden", className)}
    >
      <svg className="size-full opacity-50" preserveAspectRatio="none">
        <defs>
          <pattern id="motes" width="180" height="180" patternUnits="userSpaceOnUse">
            <circle cx="14" cy="26" r="1" fill="var(--color-accent-soft)" opacity="0.5" />
            <circle cx="96" cy="62" r="0.8" fill="var(--color-beam)" opacity="0.35" />
            <circle cx="150" cy="18" r="1.2" fill="var(--color-accent)" opacity="0.3" />
            <circle cx="52" cy="132" r="0.9" fill="var(--color-accent-soft)" opacity="0.35" />
            <circle cx="128" cy="150" r="1" fill="var(--color-beam)" opacity="0.25" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#motes)" className="animate-drift" />
      </svg>
      <div className="absolute inset-x-0 top-0 h-px beam-line opacity-60" />
    </div>
  );
}

/** Streak indicator with a flame that only lights up once a streak exists. */
export function StreakFlame({
  days,
  size = "md",
}: {
  days: number;
  size?: "sm" | "md";
}) {
  const lit = days > 0;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        lit ? "border-warning/45 bg-warning/12 text-warning" : "border-hairline text-ink-faint",
        size === "sm" && "px-2 py-0.5",
      )}
      title={`${days} day streak`}
    >
      <Icon name="flame" size={size === "sm" ? 12 : 14} filled={lit} strokeWidth={1.4} />
      <span className="numeral text-xs">{days}</span>
    </span>
  );
}
