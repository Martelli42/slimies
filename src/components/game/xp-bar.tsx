"use client";

import * as React from "react";

import { cx } from "@/components/ui/primitives";

/**
 * The XP bar. Fills from its previous value on mount so a reward animation can
 * show the gain rather than snapping to the new total.
 */
export function XPBar({
  value,
  max,
  from,
  color = "var(--color-accent)",
  height = 10,
  showSheen = true,
  className,
  label,
}: {
  value: number;
  max: number;
  /** Optional starting point for the fill animation. */
  from?: number;
  color?: string;
  height?: number;
  showSheen?: boolean;
  className?: string;
  label?: string;
}) {
  const target = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const start = from !== undefined && max > 0
    ? Math.min(100, Math.max(0, (from / max) * 100))
    : target;

  const [width, setWidth] = React.useState(start);

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setWidth(target));
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return (
    <div
      className={cx("relative w-full overflow-hidden rounded-full bg-abyss", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-label={label ?? "Experience progress"}
    >
      <div className="absolute inset-0 rounded-full border border-hairline" />
      <div
        className="relative h-full rounded-full transition-[width] duration-700 ease-out"
        style={{
          width: `${width}%`,
          background: `linear-gradient(90deg, color-mix(in oklab, ${color} 55%, #000), ${color})`,
          boxShadow: `0 0 14px color-mix(in oklab, ${color} 55%, transparent)`,
        }}
      >
        {showSheen && width > 4 ? <span className="bar-sheen rounded-full" /> : null}
      </div>
    </div>
  );
}

/** Number that counts up to its value — used for XP totals after a reward. */
export function CountUp({
  value,
  duration = 900,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = React.useState(value);
  const previous = React.useRef(value);

  React.useEffect(() => {
    const start = previous.current;
    const delta = value - start;
    previous.current = value;
    if (delta === 0) return;

    let raf = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + delta * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className={className}>{display.toLocaleString()}</span>;
}
