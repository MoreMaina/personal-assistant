
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AppIcon from "@/app/components/AppIcon";
import AppUtilitiesMenu from "@/app/components/AppUtilitiesMenu";

const navigation = [
  { href: "/", label: "Today", mobileLabel: "Today", icon: "home" },
  { href: "/classes", label: "Calendar", mobileLabel: "Calendar", icon: "calendar" },
  { href: "/study", label: "Study", mobileLabel: "Study", icon: "study" },
  { href: "/reading", label: "Workspace", mobileLabel: "Work", icon: "workspace" },
  { href: "/assistant", label: "AI Copilot", mobileLabel: "AI", icon: "sparkles" },
] as const;


const THEME_STORAGE_KEY = "personal-assistant:theme-preference";
const THEME_CHANGE_EVENT = "personal-assistant:theme-preference-change";
type ThemePreference = "system" | "light" | "dark";

function getThemePreference(): ThemePreference {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function applyTheme(preference: ThemePreference) {
  const dark = preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themePreference = preference;
}

function ThemeController() {
  useEffect(() => {
    const applyStored = () => applyTheme(getThemePreference());
    const onSystemChange = () => {
      if (getThemePreference() === "system") applyTheme("system");
    };
    applyStored();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", onSystemChange);
    window.addEventListener(THEME_CHANGE_EVENT, applyStored);
    window.addEventListener("storage", applyStored);
    return () => {
      media.removeEventListener("change", onSystemChange);
      window.removeEventListener(THEME_CHANGE_EVENT, applyStored);
      window.removeEventListener("storage", applyStored);
    };
  }, []);
  return null;
}

export function ThemePreferenceControl() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  useEffect(() => setPreference(getThemePreference()), []);

  function changePreference(value: string) {
    if (value !== "system" && value !== "light" && value !== "dark") return;
    const next = value as ThemePreference;
    setPreference(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The selected appearance still applies for this session.
    }
    applyTheme(next);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
      <div>
        <label htmlFor="app-theme-preference" className="block text-sm font-bold text-[var(--p6-text)]">
          Appearance
        </label>
        <p className="mt-1 text-sm text-[var(--p6-text-secondary)]">
          Follow your device, always use light mode, or always use dark mode.
        </p>
      </div>
      <select
        id="app-theme-preference"
        value={preference}
        onChange={(event) => changePreference(event.target.value)}
        className="w-full rounded-xl border border-[var(--p6-border-control)] bg-[var(--p6-surface)] px-3 py-3 text-sm text-[var(--p6-text)]"
      >
        <option value="system">Use system setting</option>
        <option value="light">Always light</option>
        <option value="dark">Always dark</option>
      </select>
    </div>
  );
}

export default function Navigation() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/study") return pathname === "/study";
    if (href === "/reading") {
      return (
        pathname === "/reading" ||
        pathname.startsWith("/reading/") ||
        pathname === "/projects" ||
        pathname.startsWith("/projects/")
      );
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <>
      <ThemeController />
      <AppUtilitiesMenu />
      <aside className="app-sidebar">
        <Link
          href="/"
          className="assistant-button"
          aria-label="Personal Assistant home"
        >
          <span className="assistant-button__mark">PA</span>
          <span className="assistant-button__text">
            <strong>Personal</strong>
            <span>Assistant</span>
          </span>
        </Link>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`sidebar-nav__link ${
                isActive(item.href) ? "sidebar-nav__link--active" : ""
              }`}
            >
              <span className="sidebar-nav__icon" aria-hidden="true">
                <AppIcon name={item.icon} size={22} />
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-note">
          <div className="sidebar-note__leaf">❧</div>
          <p>
            Small steps
            <br />
            every day.
          </p>
        </div>
      </aside>

      <nav className="mobile-nav" aria-label="Primary navigation">
        {navigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className="mobile-nav__item"
          >
            <span className={`mobile-nav__content ${
              isActive(item.href) ? "mobile-nav__content--active" : ""
            }`}>
              <span className="mobile-nav__icon" aria-hidden="true">
                <AppIcon name={item.icon} size={22} />
              </span>
              <span className="mobile-nav__label">
                {item.mobileLabel}
              </span>
            </span>
          </Link>
        ))}
      </nav>
    </>
  );
}
