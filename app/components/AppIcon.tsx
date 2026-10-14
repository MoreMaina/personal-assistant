import type { ReactNode } from "react";

export type AppIconName =
  | "home"
  | "calendar"
  | "study"
  | "workspace"
  | "sparkles"
  | "more"
  | "search"
  | "backup"
  | "settings"
  | "sign-out"
  | "cloud";

type AppIconProps = {
  name: AppIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

export default function AppIcon({
  name,
  size = 20,
  strokeWidth = 1.9,
  className,
}: AppIconProps) {
  let glyph: ReactNode;

  switch (name) {
    case "home":
      glyph = (
        <>
          <path d="m3 10 9-7 9 7" />
          <path d="M5.5 9v12h13V9" />
          <path d="M9 21v-6h6v6" />
        </>
      );
      break;
    case "calendar":
      glyph = (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18" />
          <path d="M7 14h2M12 14h2M7 17h2M12 17h2" />
        </>
      );
      break;
    case "study":
      glyph = (
        <>
          <path d="M2.5 5.5c3.4-1.1 6.5-.1 9.5 2.3v13c-3-2.4-6.1-3.4-9.5-2.3z" />
          <path d="M21.5 5.5c-3.4-1.1-6.5-.1-9.5 2.3v13c3-2.4 6.1-3.4 9.5-2.3z" />
          <path d="M6 9h2.5M6 12h2.5M15.5 9H18M15.5 12H18" />
        </>
      );
      break;
    case "workspace":
      glyph = (
        <>
          <path d="M3 7.5h6l2 2H21v10.8H3z" />
          <path d="M3 7.5V5.7A1.7 1.7 0 0 1 4.7 4h5l2 2H19a2 2 0 0 1 2 2v1.5" />
          <path d="M8 14h8" />
        </>
      );
      break;
    case "sparkles":
      glyph = (
        <>
          <path d="m12 3 2.1 6.1L20 11l-5.9 1.9L12 19l-2.1-6.1L4 11l5.9-1.9z" />
          <path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1z" />
          <path d="m5 2 .8 2.2L8 5l-2.2.8L5 8l-.8-2.2L2 5l2.2-.8z" />
        </>
      );
      break;
    case "more":
      glyph = (
        <>
          <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
        </>
      );
      break;
    case "search":
      glyph = (
        <>
          <circle cx="10.8" cy="10.8" r="6.8" />
          <path d="m16 16 5 5" />
        </>
      );
      break;
    case "backup":
      glyph = (
        <>
          <path d="M3 4h18v5H3zM5 9v11h14V9" />
          <path d="M9 13h6M12 11v6" />
        </>
      );
      break;
    case "settings":
      glyph = (
        <>
          <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
          <path d="m19.4 15 .1.1 1.2.9-1.5 2.6-1.4-.6a8 8 0 0 1-1.5.9l-.2 1.5h-3l-.2-1.5a8 8 0 0 1-1.5-.9l-1.4.6-1.5-2.6 1.2-.9a7 7 0 0 1 0-1.8l-1.2-.9 1.5-2.6 1.4.6a8 8 0 0 1 1.5-.9l.2-1.5h3l.2 1.5a8 8 0 0 1 1.5.9l1.4-.6 1.5 2.6-1.2.9a7 7 0 0 1 0 1.8Z" transform="translate(-1 -1)" />
        </>
      );
      break;
    case "sign-out":
      glyph = (
        <>
          <path d="M10 17l5-5-5-5M15 12H3" />
          <path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" />
        </>
      );
      break;
    case "cloud":
      glyph = (
        <>
          <path d="M7 18.5h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5a4.5 4.5 0 0 0 1 9Z" />
          <path d="m9.5 14 2 2 4-4" />
        </>
      );
      break;
  }

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {glyph}
    </svg>
  );
}
