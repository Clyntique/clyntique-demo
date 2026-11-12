"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useTheme, type ThemeMode } from "./theme-provider";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape or click outside
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  const options: { mode: ThemeMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { mode: "light", label: "Light", icon: SunIcon },
    { mode: "dark", label: "Dark", icon: MoonIcon },
    { mode: "system", label: "System", icon: MonitorIcon },
  ];

  const CurrentIcon = theme === "dark" ? MoonIcon : theme === "light" ? SunIcon : MonitorIcon;

  return (
    <div ref={containerRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        aria-label={`Select theme (current: ${theme})`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="group relative flex size-9 items-center justify-center rounded-lg border border-line bg-surface text-muted shadow-2xs transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        <CurrentIcon className="size-4.5 transition-transform group-hover:scale-105" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Theme options"
          className="absolute right-0 top-full z-50 mt-1.5 w-36 rounded-lg border border-line bg-surface p-1 shadow-pop animate-in fade-in zoom-in-95 duration-100"
        >
          {options.map(({ mode, label, icon: Icon }) => {
            const active = theme === mode;
            return (
              <button
                key={mode}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setTheme(mode);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-small font-medium transition-colors",
                  active
                    ? "bg-brand-50 text-brand-700 font-semibold"
                    : "text-ink-soft hover:bg-subtle hover:text-ink"
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon className="size-4 shrink-0 text-muted" />
                  <span>{label}</span>
                </span>
                {active && <CheckIcon className="size-3.5 text-brand-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
