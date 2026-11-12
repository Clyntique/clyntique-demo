"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { Role } from "@/generated/prisma/enums";
import { BrandMark } from "./brand";
import { DashboardBreadcrumbs } from "./dashboard-breadcrumbs";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";
import { SearchIcon, CloseIcon } from "@/components/ui/icons";
import { basePathFor } from "@/lib/navigation";
import { type NavCounts } from "./nav-links";

export interface DashboardHeaderProps {
  role: Role;
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    avatarUrl?: string | null;
  };
  counts?: NavCounts;
  mobileMenuTrigger?: ReactNode;
}

export function DashboardHeader({ role, user, mobileMenuTrigger }: DashboardHeaderProps) {
  const home = basePathFor(role);
  const [showSearchNotice, setShowSearchNotice] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowSearchNotice((prev) => !prev);
      }
      if (e.key === "Escape" && showSearchNotice) {
        setShowSearchNotice(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSearchNotice]);

  return (
    <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur transition-colors sm:px-6 md:px-8">
      {/* Left: Mobile Brand / Trigger + Breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile menu trigger */}
        {mobileMenuTrigger ? (
          <div className="md:hidden">{mobileMenuTrigger}</div>
        ) : (
          <Link
            href={home}
            className="rounded-md flex items-center md:hidden"
            aria-label="Clyntique overview"
          >
            <BrandMark width={28} />
          </Link>
        )}

        <div className="hidden sm:flex items-center">
          <DashboardBreadcrumbs role={role} />
        </div>
      </div>

      {/* Center: Search trigger */}
      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <button
          type="button"
          onClick={() => setShowSearchNotice(true)}
          className="flex w-full items-center justify-between rounded-lg border border-line bg-surface/80 px-3 py-1.5 text-small text-muted shadow-2xs transition-all hover:border-line-strong hover:bg-subtle/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-600 cursor-pointer"
          aria-label="Search or jump to... (Press Ctrl+K)"
        >
          <span className="flex items-center gap-2">
            <SearchIcon className="size-4 shrink-0 text-muted" />
            <span className="truncate">Search or jump to...</span>
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-brand-600 bg-brand-50 dark:bg-brand-950 dark:text-brand-300 px-1.5 py-0.5 rounded border border-brand-200 dark:border-brand-800">
              PR C
            </span>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-micro text-muted">
              <span className="text-xs">⌘</span>K
            </kbd>
          </div>
        </button>
      </div>

      {/* Search Notice Modal */}
      {showSearchNotice && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="search-notice-title"
          className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-ink/40 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowSearchNotice(false)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-pop animate-in zoom-in-95 duration-150 text-ink"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                  <SearchIcon className="size-5" />
                </div>
                <div>
                  <h3 id="search-notice-title" className="text-base font-semibold text-ink">
                    Global Search & Command Palette
                  </h3>
                  <p className="text-small text-muted">
                    Fast navigation across campaigns, creatives, evidence & policies
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSearchNotice(false)}
                className="rounded-lg p-1.5 text-muted hover:bg-subtle hover:text-ink transition-colors"
                aria-label="Close dialog"
              >
                <CloseIcon className="size-4" />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-brand-200 bg-brand-50/50 p-4 dark:border-brand-900 dark:bg-brand-950/30">
              <div className="flex items-center justify-between text-caption font-medium text-brand-800 dark:text-brand-300">
                <span>Phase 3 (PR C) Deliverable</span>
                <span className="font-mono text-micro">Ctrl+K / ⌘K</span>
              </div>
              <p className="mt-1 text-small text-muted">
                Global search indexing with keyboard navigation, recent history, and fast fuzzy matching across projects, creatives, evidence dictionary, and compliance policies will be unlocked in the next PR.
              </p>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowSearchNotice(false)}
                className="rounded-lg bg-ink px-4 py-2 text-small font-medium text-surface transition-opacity hover:opacity-90"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Right: Theme Toggle + Notification Bell + User Menu */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        <ThemeToggle />
        <NotificationBell role={role} />
        <div className="h-5 w-px bg-line mx-0.5" aria-hidden />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
