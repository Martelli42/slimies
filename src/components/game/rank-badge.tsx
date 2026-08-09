import { cx } from "@/components/ui/primitives";
import { rankForLevel } from "@/lib/ranks";

/**
 * Rank insignia: a faceted shield whose gradient and division pips come from
 * the tier. Drawn as SVG so it stays crisp at any size and needs no assets.
 */
export function RankBadge({
  level,
  size = 56,
  showLabel = false,
  className,
}: {
  level: number;
  size?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const rank = rankForLevel(level);
  const [from, to] = rank.tier.colors;
  const id = `rank-${rank.tier.key}-${rank.division}`;

  return (
    <div className={cx("flex items-center gap-2.5", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        role="img"
        aria-label={`Rank ${rank.label}`}
        className="shrink-0"
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
          <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d="M32 3 L57 13 v22 c0 12-10.5 21-25 26 C17.5 56 7 47 7 35 V13 Z"
          fill="var(--color-abyss)"
          stroke={rank.tier.glow}
          strokeOpacity="0.5"
          strokeWidth="1.5"
        />
        <path
          d="M32 9 L51 16.6 v18.2 c0 9.4-8 16.4-19 20.4 -11-4-19-11-19-20.4 V16.6 Z"
          fill={`url(#${id})`}
          opacity="0.92"
          filter={`url(#${id}-glow)`}
        />
        <path
          d="M32 17 L41 33 H23 Z"
          fill="var(--color-void)"
          fillOpacity="0.45"
        />
        {Array.from({ length: 4 - rank.division }).map((_, i) => (
          <circle
            key={i}
            cx={32 + (i - (3 - rank.division) / 2) * 8}
            cy={42}
            r="2.6"
            fill="var(--color-void)"
            fillOpacity="0.7"
          />
        ))}
      </svg>

      {showLabel ? (
        <div className="min-w-0">
          <p
            className="font-display text-sm font-extrabold tracking-[0.14em] uppercase"
            style={{ color: rank.tier.glow }}
          >
            {rank.label}
          </p>
          <p className="text-[0.68rem] text-ink-faint">
            {rank.nextLabel
              ? `${rank.nextLabel} at level ${rank.nextLevel}`
              : "Top of the ladder"}
          </p>
        </div>
      ) : null}
    </div>
  );
}
