import * as React from "react";

/**
 * Original icon set — simple geometric glyphs drawn on a 24×24 grid so they
 * stay legible at 16px on a phone. No third-party artwork.
 */

const PATHS: Record<string, React.ReactNode> = {
  dumbbell: (
    <>
      <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />
    </>
  ),
  pushup: <path d="M3 17h7l3-4 3 4h5M6 13l3-4 4 1" />,
  run: (
    <>
      <circle cx="14.5" cy="4.5" r="1.6" />
      <path d="M6 21l3.5-5 2-4 4-1.5M11.5 12L9 9l3.5-2 2.5 3 3 1M13 16l3 5" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4.5" r="1.6" />
      <path d="M8 21l3-6 1-4 3-2 2 4 2 1M11 15l3 6" />
    </>
  ),
  bike: (
    <>
      <circle cx="5.5" cy="17" r="3.2" />
      <circle cx="18.5" cy="17" r="3.2" />
      <path d="M5.5 17l4-8h5l4 8M9 9h6" />
    </>
  ),
  swim: <path d="M3 17c2-1.4 3.5-1.4 5.5 0s3.5 1.4 5.5 0 3.5-1.4 5.5 0M6 12l4-3 4 2M15 7.5h.01" />,
  mountain: <path d="M3 19l6-11 4 6 2-3 6 8z" />,
  ball: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17M3.5 12h17" />
    </>
  ),
  fist: <path d="M6 11V8a2 2 0 114 0v2M10 10V7a2 2 0 114 0v3M14 11V9a2 2 0 114 0v6a5 5 0 01-5 5h-2a5 5 0 01-5-5v-4" />,
  stretch: <path d="M12 4.5v6M7 8l5 2.5L17 8M8 20l4-9 4 9" />,
  book: <path d="M5 4.5h9a3 3 0 013 3v12a2.5 2.5 0 00-2.5-2.5H5z M5 4.5v12.5" />,
  pages: <path d="M7 3.5h7l4 4v13H7zM14 3.5v4h4M10 12h6M10 16h6" />,
  chart: <path d="M4 20V9M10 20V4M16 20v-7M22 20H2" />,
  code: <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" />,
  briefcase: (
    <>
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <path d="M9 7.5V6a2 2 0 012-2h2a2 2 0 012 2v1.5M3 12.5h18" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" />
    </>
  ),
  spark: <path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.4" />
    </>
  ),
  quill: <path d="M4 20c6-1 10-4 13-11l3-4-4 3C9 11 6 15 4 20zM4 20l4-4" />,
  flame: <path d="M12 21c3.6 0 6-2.4 6-5.6 0-3.9-3.4-5.3-3.4-8.9C14.6 4.6 13 3 12 3c0 2.6-1.6 3.6-3 5.4-1 1.3-3 3-3 6C6 18.4 8.4 21 12 21z" />,
  medal: (
    <>
      <circle cx="12" cy="15" r="5" />
      <path d="M8.5 10.4L6 3h12l-2.5 7.4" />
    </>
  ),
  crown: <path d="M4 18h16l1-11-5.5 4L12 5 8.5 11 3 7z" />,
  shield: <path d="M12 3l7.5 3v6c0 4.6-3.2 7.7-7.5 9-4.3-1.3-7.5-4.4-7.5-9V6z" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 5.2a3.2 3.2 0 010 6.2M18 20c0-2.6-1-4.4-2.6-5.4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.4 2" />
    </>
  ),
  wave: <path d="M3 15c2-2 3.5-2 5.5 0s3.5 2 5.5 0 3.5-2 5.5 0M3 10c2-2 3.5-2 5.5 0s3.5 2 5.5 0 3.5-2 5.5 0" />,
  moon: <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />,
  star: <path d="M12 3.5l2.7 5.6 6.1.8-4.5 4.3 1.2 6.1L12 17.4 6.5 20.3l1.2-6.1-4.5-4.3 6.1-.8z" />,
  flag: <path d="M6 21V4m0 0h11l-2.5 4L17 12H6" />,
  chevron: <path d="M6 15l6-6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  home: <path d="M4 11l8-7 8 7v9a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1z" />,
  scroll: <path d="M6 4h10a2 2 0 012 2v13a2 2 0 01-2 2H8a2 2 0 01-2-2zM9 9h7M9 13h7M9 17h4" />,
  trophy: <path d="M8 4h8v5a4 4 0 01-8 0zM8 5.5H5v1.5a3 3 0 003 3M16 5.5h3V7a3 3 0 01-3 3M10 20h4M12 13v7" />,
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5" />
    </>
  ),
  bell: <path d="M6 17V11a6 6 0 1112 0v6l1.5 2.5H4.5zM10 20.5a2 2 0 004 0" />,
  gear: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.7 7.2l2 1.2M17.3 15.6l2 1.2M4.7 16.8l2-1.2M17.3 8.4l2-1.2" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  arrowUp: <path d="M12 19V6M6 12l6-6 6 6" />,
  arrowDown: <path d="M12 5v13M18 12l-6 6-6-6" />,
  minus: <path d="M6 12h12" />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path d="M15.5 5.5H5.5a2 2 0 00-2 2v10" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />,
  logout: <path d="M14 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2v-2M10 12h11M18 9l3 3-3 3" />,
  camera: (
    <>
      <path d="M3.5 8.5h3.2l1.6-2.4h7.4l1.6 2.4h3.2v11H3.5z" />
      <circle cx="12" cy="13.5" r="3.4" />
    </>
  ),
  bolt: <path d="M13 3L5 13.5h5.5L10 21l8-10.5h-5.5z" />,
};

export type IconName = keyof typeof PATHS | (string & {});

export function Icon({
  name,
  size = 20,
  className,
  strokeWidth = 1.6,
  filled = false,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
  filled?: boolean;
  style?: React.CSSProperties;
}) {
  const path = PATHS[name] ?? PATHS.spark;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  );
}
