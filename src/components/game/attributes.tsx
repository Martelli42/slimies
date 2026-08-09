"use client";

import * as React from "react";

import { XPBar } from "@/components/game/xp-bar";
import { cx } from "@/components/ui/primitives";
import { ATTRIBUTE_LIST, type AttributeKey } from "@/lib/constants";
import { attributeTier } from "@/lib/format";

export type AttributeValues = Record<AttributeKey, number>;

/**
 * Attribute rows with animated bars. Each attribute has its own "tier" — a
 * soft milestone every 250 XP — so the bar always has somewhere to travel
 * instead of asymptotically approaching an arbitrary maximum.
 */
export function AttributeBars({
  values,
  gains,
  compact = false,
}: {
  values: AttributeValues;
  /** Highlight recent gains, e.g. straight after logging an activity. */
  gains?: Partial<AttributeValues>;
  compact?: boolean;
}) {
  return (
    <ul className={cx("space-y-3", compact && "space-y-2.5")}>
      {ATTRIBUTE_LIST.map((attr) => {
        const total = values[attr.key] ?? 0;
        const tier = attributeTier(total);
        const gain = gains?.[attr.key] ?? 0;

        return (
          <li key={attr.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span
                  className="font-display text-[0.7rem] font-extrabold tracking-[0.16em]"
                  style={{ color: `var(${attr.cssVar})` }}
                >
                  {attr.code}
                </span>
                {!compact ? (
                  <span className="text-[0.68rem] text-ink-faint">{attr.label}</span>
                ) : null}
              </div>
              <div className="flex items-baseline gap-2">
                {gain > 0 ? (
                  <span
                    className="animate-pop font-display text-[0.68rem] font-bold"
                    style={{ color: `var(${attr.cssVar})` }}
                  >
                    +{gain}
                  </span>
                ) : null}
                <span className="numeral text-sm">{tier.tier}</span>
                <span className="text-[0.62rem] text-ink-faint">
                  {tier.into}/{tier.size}
                </span>
              </div>
            </div>
            <XPBar
              value={tier.into}
              max={tier.size}
              from={gain > 0 ? Math.max(0, tier.into - gain) : undefined}
              color={attr.hex}
              height={compact ? 6 : 8}
              showSheen={false}
              label={`${attr.label} progress`}
            />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Pentagon radar chart of the five attributes. Pure SVG — no chart library,
 * so it stays tiny and matches the app's visual language exactly.
 */
export function AttributeRadar({
  values,
  size = 260,
}: {
  values: AttributeValues;
  size?: number;
}) {
  const attrs = ATTRIBUTE_LIST;
  const center = size / 2;
  const radius = size * 0.34;
  const max = Math.max(100, ...attrs.map((a) => values[a.key] ?? 0));

  const pointAt = (index: number, ratio: number) => {
    const angle = (Math.PI * 2 * index) / attrs.length - Math.PI / 2;
    return [center + Math.cos(angle) * radius * ratio, center + Math.sin(angle) * radius * ratio];
  };

  const rings = [0.25, 0.5, 0.75, 1];
  const outline = attrs.map((_, i) => pointAt(i, 1));
  const shape = attrs.map((attr, i) => pointAt(i, (values[attr.key] ?? 0) / max));
  const toPath = (points: number[][]) =>
    points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + " Z";

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto h-auto w-full max-w-[280px]"
      role="img"
      aria-label={`Attribute distribution: ${attrs
        .map((a) => `${a.label} ${values[a.key] ?? 0}`)
        .join(", ")}`}
    >
      <defs>
        <radialGradient id="radar-fill" cx="50%" cy="50%">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--color-beam)" stopOpacity="0.18" />
        </radialGradient>
      </defs>

      {rings.map((ring) => (
        <path
          key={ring}
          d={toPath(attrs.map((_, i) => pointAt(i, ring)))}
          fill="none"
          stroke="var(--color-hairline)"
          strokeWidth="1"
        />
      ))}

      {outline.map(([x, y], i) => (
        <line
          key={i}
          x1={center}
          y1={center}
          x2={x}
          y2={y}
          stroke="var(--color-hairline)"
          strokeWidth="1"
        />
      ))}

      <path
        d={toPath(shape)}
        fill="url(#radar-fill)"
        stroke="var(--color-accent-soft)"
        strokeWidth="1.5"
      />

      {shape.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill={attrs[i].hex} />
      ))}

      {attrs.map((attr, i) => {
        const [x, y] = pointAt(i, 1.28);
        return (
          <text
            key={attr.key}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="font-display"
            fontSize="11"
            fontWeight="800"
            letterSpacing="1.5"
            fill={attr.hex}
          >
            {attr.code}
          </text>
        );
      })}
    </svg>
  );
}
