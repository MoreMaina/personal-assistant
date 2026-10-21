
"use client";

import Link from "next/link";
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

export default function Navigation() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
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
