
"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";

export type CardMenuAction = {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
};

type CardMenuProps = {
  actions: CardMenuAction[];
  title?: string;
};

export default function CardMenu({
  actions,
  title = "Card actions",
}: CardMenuProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [position, setPosition] = useState({
    top: 0,
    left: 12,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !mounted) return;

    function updatePosition() {
      const trigger = triggerRef.current;

      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const menuWidth = 210;

      const left = Math.max(
        12,
        Math.min(
          rect.right - menuWidth,
          window.innerWidth - menuWidth - 12,
        ),
      );

      let top = rect.bottom + 8;

      // Keep the menu visible near the bottom of the screen.
      if (top + 240 > window.innerHeight) {
        top = Math.max(12, rect.top - 248);
      }

      setPosition({ top, left });
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, mounted]);

  const menuStyle = {
    "--card-menu-top": `${position.top}px`,
    "--card-menu-left": `${position.left}px`,
  } as CSSProperties;

  const menu =
    open && mounted
      ? createPortal(
          <>
            <button
              type="button"
              className="card-menu__backdrop"
              aria-label="Close actions menu"
              onClick={() => setOpen(false)}
            />

            <div
              ref={panelRef}
              className="card-menu__panel"
              style={menuStyle}
              role="menu"
              aria-label={title}
            >
              <p className="card-menu__heading">
                {title}
              </p>

              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  role="menuitem"
                  className={`card-menu__action ${
                    action.destructive
                      ? "card-menu__action--destructive"
                      : ""
                  }`}
                  onClick={() => {
                    setOpen(false);
                    action.onSelect();
                  }}
                >
                  {action.destructive && (
                    <svg
                      width="19"
                      height="19"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="m19 6-1 14H6L5 6" />
                      <path d="M10 11v5M14 11v5" />
                    </svg>
                  )}

                  {!action.destructive &&
                    /^(restart|pause|resume)\b/i.test(action.label) && (
                      <svg
                        width="19"
                        height="19"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        {/^(restart)\b/i.test(action.label) ? (
                          <>
                            <path d="M3 11a9 9 0 0 1 15.36-6.36L21 7" />
                            <path d="M21 3v4h-4" />
                            <path d="M21 13a9 9 0 0 1-15.36 6.36L3 17" />
                            <path d="M3 21v-4h4" />
                          </>
                        ) : /^pause\b/i.test(action.label) ? (
                          <>
                            <path d="M8 5v14" />
                            <path d="M16 5v14" />
                          </>
                        ) : (
                          <path
                            d="M8 5l11 7-11 7z"
                            fill="currentColor"
                          />
                        )}
                      </svg>
                    )}

                  {!action.destructive &&
                    /^(export|share)\b/i.test(action.label) && (
                      <svg
                        width="19"
                        height="19"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 15V3" />
                        <path d="m7 8 5-5 5 5" />
                        <path d="M5 12v8h14v-8" />
                      </svg>
                    )}

                  {!action.destructive && /^edit\b/i.test(action.label) && (
                    <svg
                      width="19"
                      height="19"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
                    </svg>
                  )}

                  <span>{action.label}</span>
                </button>
              ))}

            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      <div className="card-menu">
        <button
          ref={triggerRef}
          type="button"
          className="card-menu__trigger"
          aria-label={title}
          aria-haspopup="menu"
          aria-expanded={open}
          title={title}
          onClick={() => setOpen((current) => !current)}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>
      </div>

      {menu}
    </>
  );
}
