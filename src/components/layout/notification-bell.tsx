"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Role } from "@/generated/prisma/enums";
import { BellIcon, CheckCircleIcon } from "@/components/ui/icons";
import { basePathFor } from "@/lib/navigation";

export function NotificationBell({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activityHref = basePathFor(role) + "/activity";

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

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="group relative flex size-9 items-center justify-center rounded-lg border border-line bg-surface text-muted shadow-2xs transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        <BellIcon className="size-4.5 transition-transform group-hover:scale-105" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-full z-50 mt-1.5 w-80 rounded-xl border border-line bg-surface p-4 shadow-pop animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-between pb-3 border-b border-line">
            <h3 className="text-small font-semibold text-ink">Notifications</h3>
            <span className="text-micro font-medium text-muted">0 unread</span>
          </div>

          <div className="py-6 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-subtle text-muted mb-2">
              <CheckCircleIcon className="size-5 text-positive-solid" />
            </div>
            <p className="text-small font-medium text-ink">You&apos;re all caught up</p>
            <p className="text-caption text-muted mt-1 max-w-[220px] mx-auto">
              No unread notifications at this time.
            </p>
          </div>

          <div className="pt-2 border-t border-line text-center">
            <Link
              href={activityHref}
              onClick={() => setOpen(false)}
              className="text-caption font-medium text-brand-600 hover:text-brand-700 hover:underline"
            >
              View full activity log &rarr;
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
