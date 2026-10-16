"use client";

import Link from "next/link";
import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";
import { basePathFor, ROLE_LABEL } from "@/lib/navigation";
import { BrandMark } from "./brand";
import { ChevronRightIcon, SidebarIcon } from "@/components/ui/icons";
import { useSidebar } from "./sidebar-context";
import { Avatar } from "@/components/ui/avatar";
import { LogoutButton } from "./logout-button";

import { NavLinks, type NavCounts } from "./nav-links";

const WORKSPACE_LABEL: Record<Role, string> = {
  TEAM: "Team workspace",
  CLIENT: "Client workspace",
};

export interface DesktopSidebarProps {
  role: Role;
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  counts?: NavCounts;
}

export function DesktopSidebar({ role, user, counts }: DesktopSidebarProps) {
  const { isCollapsed, toggleSidebar } = useSidebar();
  const home = basePathFor(role);

  return (
    <aside
      aria-label="Application navigation"
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface transition-[width] duration-200 ease-in-out md:flex",
        isCollapsed ? "w-18" : "w-60"
      )}
    >
      {/* Top Header: Brand Mark (C & Globe only, no name) & Collapse Toggle */}
      <div
        className={cn(
          "flex items-center pt-5 pb-4 border-b border-line/60 transition-all",
          isCollapsed ? "flex-col gap-3.5 px-2" : "justify-between px-4.5"
        )}
      >
        <Link
          href={home}
          className="rounded-lg focus-visible:outline-2 focus-visible:outline-brand-600 transition-transform hover:scale-105 flex items-center"
          aria-label="Clyntique home"
        >
          <BrandMark width={isCollapsed ? 34 : 40} className={isCollapsed ? "mx-auto" : ""} />
        </Link>

        {/* Toggle Button */}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={isCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
          title={isCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
          className="group relative flex size-8 items-center justify-center rounded-lg border border-line bg-surface text-muted shadow-2xs transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          {isCollapsed ? (
            <ChevronRightIcon className="size-4" />
          ) : (
            <SidebarIcon className="size-4" />
          )}

          {/* Floating Tooltip in Collapsed Mode */}
          {isCollapsed && (
            <div
              role="tooltip"
              className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 flex -translate-y-1/2 items-center whitespace-nowrap rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-white shadow-pop opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              <span>Expand (Ctrl+B)</span>
              <span
                aria-hidden
                className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-ink"
              />
            </div>
          )}
        </button>
      </div>

      {/* Workspace Category Eyebrow (expanded only) */}
      {!isCollapsed && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-micro font-semibold tracking-[0.14em] text-muted uppercase">
            {WORKSPACE_LABEL[role]}
          </p>
        </div>
      )}

      {/* Main Navigation Area */}
      <nav aria-label="Main navigation" className={cn("flex-1 py-3 overflow-y-auto", isCollapsed ? "px-2" : "px-3")}>
        <NavLinks role={role} layout="sidebar" counts={counts} collapsed={isCollapsed} />
      </nav>

      {/* User Section Footer */}
      <div className={cn("border-t border-line/80 bg-surface/80 p-2.5 transition-all", isCollapsed ? "flex flex-col items-center gap-2" : "")}>
        {isCollapsed ? (
          <div className="group relative flex flex-col items-center gap-2">
            <Avatar name={user.name} className="size-8 ring-1 ring-line" />
            <LogoutButton compact={true} />

            {/* User Tooltip */}
            <div
              role="tooltip"
              className="pointer-events-none absolute left-full bottom-2 z-50 ml-3 flex -translate-y-0 flex-col whitespace-nowrap rounded-md bg-ink p-2 text-xs text-white shadow-pop opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            >
              <span className="font-semibold">{user.name}</span>
              <span className="text-[11px] text-brand-200">
                {ROLE_LABEL[user.role]} · {user.email}
              </span>
              <span
                aria-hidden
                className="absolute right-full bottom-3 border-4 border-transparent border-r-ink"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5 px-2 py-1">
              <Avatar name={user.name} className="size-8 ring-1 ring-line" />
              <div className="min-w-0 flex-1">
                <p className="text-small truncate font-medium text-ink">{user.name}</p>
                <p className="text-caption truncate text-muted">
                  {ROLE_LABEL[user.role]}
                </p>
              </div>
            </div>
            <div className="pt-1">
              <LogoutButton compact={false} />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
