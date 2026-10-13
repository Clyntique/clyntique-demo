"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Role } from "@/generated/prisma/enums";
import { CloseIcon, MenuIcon } from "@/components/ui/icons";
import { NavLinks, type NavCounts } from "./nav-links";

/*
 * Phone navigation: a "Menu" button that opens a sheet with the same links as
 * the sidebar, plus the signed-in user and sign out. Closes on Escape, on a
 * tap outside, and after navigating. Focus moves into the sheet when it opens
 * and back to the button when it closes.
 */
export function MobileMenu({
  role,
  counts,
  footer,
}: {
  role: Role;
  counts?: NavCounts;
  footer: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const sheetId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [lastPath, setLastPath] = useState(pathname);

  // Close after navigation (state adjusted during render, not in an effect).
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    sheetRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={sheetId}
        onClick={() => setOpen((v) => !v)}
        className="text-small inline-flex h-9 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 font-medium text-ink"
      >
        {open ? (
          <CloseIcon className="size-4" />
        ) : (
          <MenuIcon className="size-4" />
        )}
        Menu
      </button>
      {/* Portalled: the blurred header would otherwise contain the fixed sheet. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-x-0 top-14 bottom-0 z-40 md:hidden"
            onClick={() => setOpen(false)}
          >
            <div className="absolute inset-0 bg-ink/20" aria-hidden />
            <div
              id={sheetId}
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-label="Main menu"
              onClick={(e) => e.stopPropagation()}
              className="relative flex max-h-full flex-col gap-4 overflow-y-auto border-b border-line bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-pop"
            >
              <nav aria-label="Main">
                <NavLinks
                  role={role}
                  layout="sheet"
                  counts={counts}
                  onNavigate={() => setOpen(false)}
                />
              </nav>
              <div className="border-t border-line pt-3">{footer}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
