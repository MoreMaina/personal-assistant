"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/", label: "Today", icon: "⌂" },
  { href: "/classes", label: "Classes", icon: "▤" },
  { href: "/study", label: "Study", icon: "▥" },
  { href: "/reading", label: "Reading", icon: "◫" },
  { href: "/projects", label: "Projects", icon: "✦" },
];

export default function Navigation() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") {
      return pathname === "/";
    }

    return (
      pathname === href ||
      pathname.startsWith(`${href}/`)
    );
  }

  return (
    <>
      <aside className="app-sidebar">
        <Link
          href="/"
          className="assistant-button"
          aria-label="Personal Assistant home"
        >
          <span className="assistant-button__mark">
            PA
          </span>

          <span className="assistant-button__text">
            <strong>Personal</strong>
            <span>Assistant</span>
          </span>
        </Link>

        <nav
          className="sidebar-nav"
          aria-label="Primary navigation"
        >
          {navigation.map((item) => {
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-nav__link ${
                  active
                    ? "sidebar-nav__link--active"
                    : ""
                }`}
              >
                <span
                  className="sidebar-nav__icon"
                  aria-hidden="true"
                >
                  {item.icon}
                </span>

                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-note">
          <div className="sidebar-note__leaf">
            ❧
          </div>

          <p>
            Small steps
            <br />
            every day.
          </p>
        </div>
      </aside>

      <nav
        className="mobile-nav"
        aria-label="Primary navigation"
      >
        {navigation.map((item) => {
          const active = isActive(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-nav__item ${
                active
                  ? "mobile-nav__item--active"
                  : ""
              }`}
            >
              <span
                className="mobile-nav__icon"
                aria-hidden="true"
              >
                {item.icon}
              </span>

              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}