"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Role } from "@/generated/prisma/enums";
import { Avatar } from "@/components/ui/avatar";
import { ChevronDownIcon, LogOutIcon, UserIcon } from "@/components/ui/icons";
import { basePathFor, ROLE_LABEL } from "@/lib/navigation";
import { cn } from "@/lib/cn";

export interface UserMenuProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
    avatarUrl?: string | null;
  };
}

export function UserMenu({ user }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const profileHref = basePathFor(user.role) + "/profile";

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
        aria-label={`User menu for ${user.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="group flex items-center gap-2 rounded-lg p-1 text-ink transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        <Avatar name={user.name} src={user.avatarUrl} size="sm" className="ring-1 ring-line" />
        <span className="hidden text-small font-medium sm:inline max-w-[120px] truncate text-left">
          {user.name}
        </span>
        <ChevronDownIcon
          className={cn("size-3.5 text-muted transition-transform duration-150", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="User navigation"
          className="absolute right-0 top-full z-50 mt-1.5 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-pop animate-in fade-in zoom-in-95 duration-100"
        >
          {/* User info banner */}
          <div className="border-b border-line px-3 py-2.5">
            <p className="text-small font-semibold text-ink truncate">{user.name}</p>
            <p className="text-caption text-muted truncate mt-0.5">{user.email}</p>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2 py-0.5 text-micro font-medium text-brand-700">
              <span className="size-1.5 rounded-full bg-brand-600" />
              {ROLE_LABEL[user.role]} Workspace
            </div>
          </div>

          {/* Links */}
          <div className="py-1">
            <Link
              href={profileHref}
              onClick={() => setOpen(false)}
              role="menuitem"
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-small font-medium text-ink-soft transition-colors hover:bg-subtle hover:text-ink"
            >
              <UserIcon className="size-4 text-muted" />
              <span>My Profile</span>
            </Link>
          </div>

          <div className="border-t border-line pt-1">
            <form method="post" action="/auth/logout">
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-small font-medium text-critical-ink transition-colors hover:bg-critical-soft"
              >
                <LogOutIcon className="size-4 text-critical-solid" />
                <span>Sign out</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
