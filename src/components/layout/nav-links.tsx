"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";
import { ActivityIcon, FolderIcon, HomeIcon, ImageIcon, InboxIcon, MessageIcon, ShieldIcon } from "@/components/ui/icons";
import { basePathFor } from "@/lib/navigation";

// Intentionally small: only sections that exist. The review queue is TEAM-only.
// Both roles call client work "Submissions" (TEAM listings also include
// earlier creatives from the client-approval workflow).
const ITEMS = [
  { label: "Overview", segment: "", icon: HomeIcon, teamOnly: false },
  { label: "Review queue", segment: "/review", icon: InboxIcon, teamOnly: true },
  { label: "Submissions", segment: "/creatives", icon: ImageIcon, teamOnly: false },
  { label: "Projects", segment: "/projects", icon: FolderIcon, teamOnly: false },
  { label: "Messages", segment: "/messages", icon: MessageIcon, teamOnly: false },
  { label: "Activity", segment: "/activity", icon: ActivityIcon, teamOnly: false },
  { label: "Policy library", segment: "/policy-library", icon: ShieldIcon, teamOnly: true },
];

export type NavCounts = Partial<Record<string, number>>;

type NavProps = {
  role: Role;
  layout: "sidebar" | "sheet";
  counts?: NavCounts;
  collapsed?: boolean;
  onNavigate?: () => void;
};

export function NavLinks(props: NavProps) {
  return <NavList {...props} pathname={usePathname()} />;
}

// Server-renderable nav without an active item. Used as the Suspense fallback
// on dynamic routes, where the pathname is only known at request time.
export function NavList({
  role,
  layout,
  pathname,
  counts,
  collapsed = false,
  onNavigate,
}: NavProps & { pathname: string | null }) {
  const base = basePathFor(role);

  return (
    <ul className={cn("flex flex-col", collapsed ? "gap-1.5" : "gap-0.5")}>
      {ITEMS.filter((item) => role === "TEAM" || !item.teamOnly).map(({ label, segment, icon: Icon }) => {
        const href = base + segment;
        const active = pathname !== null && (segment ? pathname.startsWith(href) : pathname === href);
        const count = counts?.[segment];

        if (collapsed) {
          return (
            <li key={label} className="relative flex justify-center">
              <Link
                href={href}
                prefetch={true}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                aria-label={count ? `${label} (${count} waiting)` : label}
                className={cn(
                  "group relative flex size-10 items-center justify-center rounded-lg transition-all cursor-pointer active:scale-95",
                  active
                    ? "bg-brand-50 text-brand-600 ring-1 ring-brand-200"
                    : "text-ink-soft hover:bg-subtle hover:text-ink",
                )}
              >
                <Icon className={cn("size-5 shrink-0 transition-transform group-hover:scale-105", active ? "text-brand-600" : "text-muted")} />

                {/* Notification dot when collapsed and items are waiting */}
                {count ? (
                  <span className="absolute top-1.5 right-1.5 flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-attention-solid opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-attention-solid" />
                  </span>
                ) : null}

                {/* Floating Tooltip with arrow */}
                <div
                  role="tooltip"
                  className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium text-white shadow-pop opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                >
                  <span>{label}</span>
                  {count ? (
                    <span className="rounded bg-brand-500 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
                      {count}
                    </span>
                  ) : null}
                  {/* Tooltip triangle indicator */}
                  <span
                    aria-hidden
                    className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-ink"
                  />
                </div>
              </Link>
            </li>
          );
        }

        return (
          <li key={label}>
            <Link
              href={href}
              prefetch={true}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md transition-all cursor-pointer active:scale-[0.99]",
                layout === "sidebar" ? "text-small h-9 px-2.5" : "text-body h-11 px-3",
                active ? "bg-brand-50 font-semibold text-ink shadow-2xs" : "font-medium text-ink-soft hover:bg-subtle hover:text-ink",
              )}
            >
              <Icon className={cn("size-4 shrink-0", active ? "text-brand-600" : "text-muted")} />
              <span className="flex-1">{label}</span>
              {/* Brand marker for the current section (decorative; aria-current carries the state). */}
              {active && !count ? <ActiveMarker /> : null}
              {count ? (
                <span className="text-record rounded-sm bg-brand-100 px-1.5 text-brand-800">
                  {count}
                  <span className="sr-only"> waiting</span>
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// A small gold hexagon, echoing the logo's shape.
function ActiveMarker() {
  return (
    <svg aria-hidden viewBox="0 0 10 11" className="size-2 shrink-0 fill-gold-500">
      <path d="M5 .5 9.5 3v5L5 10.5.5 8V3Z" />
    </svg>
  );
}
