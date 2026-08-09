import { cx } from "@/components/ui/primitives";

/**
 * Player avatar. Falls back to initials on a hue derived from the username, so
 * every player is visually distinct even with no upload.
 */
export function Avatar({
  name,
  src,
  size = 44,
  ring = false,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;

  return (
    <span
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl",
        ring && "ring-2 ring-accent/50 ring-offset-2 ring-offset-void",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        /* Avatars are arbitrary Supabase Storage URLs already sized by the
           uploader; running them through next/image adds cost, not value. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="size-full object-cover"
          loading="lazy"
        />
      ) : (
        <span
          className="flex size-full items-center justify-center font-display font-extrabold text-white/90"
          style={{
            fontSize: size * 0.36,
            background: `linear-gradient(150deg, hsl(${hash} 65% 42%), hsl(${(hash + 48) % 360} 70% 22%))`,
          }}
        >
          {initials || "?"}
        </span>
      )}
    </span>
  );
}
