"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TabSpec = { id: string; label: string; count?: number; content: ReactNode };

/*
 * Workspace tabs (Findings · Evidence · History). Every panel stays mounted
 * and is only hidden, so a half-written response or an open form survives a
 * tab switch. Keyboard: arrow keys move between tabs, Home/End jump.
 */
export function Tabs({ tabs, defaultId, label }: { tabs: TabSpec[]; defaultId: string; label: string }) {
  const [active, setActive] = useState(tabs.some((t) => t.id === defaultId) ? defaultId : tabs[0]?.id);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === active);
    const next =
      e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setActive(tabs[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div className="flex min-w-0 flex-col">
      <div role="tablist" aria-label={label} onKeyDown={onKey} className="flex gap-5 overflow-x-auto overflow-y-hidden border-b border-line px-1">
        {tabs.map((t, i) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-${t.id}-tab`}
              aria-selected={on}
              aria-controls={`${base}-${t.id}-panel`}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(t.id)}
              className={cn(
                "text-small -mb-px flex h-10 shrink-0 items-center gap-2 border-b-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-600",
                on ? "border-brand-600 font-semibold text-ink" : "border-transparent text-muted hover:text-ink hover:border-line-strong",
              )}
            >
              <span>{t.label}</span>
              {t.count !== undefined && (
                <span
                  className={cn(
                    "text-micro inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1.5 font-semibold",
                    on ? "bg-brand-100 text-brand-900" : "bg-subtle text-muted",
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`${base}-${t.id}-panel`}
          aria-labelledby={`${base}-${t.id}-tab`}
          hidden={t.id !== active}
          tabIndex={0}
          className="pt-4 focus-visible:outline-none"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
