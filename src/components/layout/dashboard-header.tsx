"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { Role } from "@/generated/prisma/enums";
import { BrandMark } from "./brand";
import { DashboardBreadcrumbs } from "./dashboard-breadcrumbs";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";
import { SearchIcon } from "@/components/ui/icons";
import { CommandPalette } from "@/components/search/command-palette";
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
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
          onClick={() => setIsSearchOpen(true)}
          className="flex w-full items-center justify-between rounded-lg border border-line bg-surface/80 px-3 py-1.5 text-small text-muted shadow-2xs transition-all hover:border-line-strong hover:bg-subtle/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-600 cursor-pointer"
          aria-label="Search or jump to... (Press Ctrl+K)"
        >
          <span className="flex items-center gap-2">
            <SearchIcon className="size-4 shrink-0 text-muted" />
            <span className="truncate">Search or jump to...</span>
          </span>
          <div className="flex items-center gap-1.5">
            <kbd className="inline-flex items-center gap-0.5 rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-micro text-muted">
              <span className="text-xs">⌘</span>K
            </kbd>
          </div>
        </button>
      </div>

      {/* Global Command Palette */}
      <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      {/* Right: Search (mobile) + Theme Toggle + Notification Bell + User Menu */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        <button
          type="button"
          onClick={() => setIsSearchOpen(true)}
          className="flex size-9 items-center justify-center rounded-lg border border-line text-muted hover:bg-subtle hover:text-ink transition-colors md:hidden cursor-pointer"
          aria-label="Search or jump to... (Press Ctrl+K)"
        >
          <SearchIcon className="size-4" />
        </button>
        <ThemeToggle />
        <NotificationBell role={role} />
        <div className="h-5 w-px bg-line mx-0.5" aria-hidden />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
