"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";
import { ActivityIcon, FolderIcon, HomeIcon, ImageIcon, InboxIcon } from "@/components/ui/icons";
import { basePathFor } from "@/lib/navigation";

// Intentionally small: only sections that exist. The review queue is TEAM-only.
// Both roles call client work "Submissions" (TEAM listings also include
// earlier creatives from the client-approval workflow).
const ITEMS = [
  { label: "Overview", segment: "", icon: HomeIcon, teamOnly: false },
  { label: "Review queue", segment: "/review", icon: InboxIcon, teamOnly: true },
  { label: "Submissions", segment: "/creatives", icon: ImageIcon, teamOnly: false },
  { label: "Projects", segment: "/projects", icon: FolderIcon, teamOnly: false },
  { label: "Activity", segment: "/activity", icon: ActivityIcon, teamOnly: false },
];

export type NavCounts = Partial<Record<string, number>>;

type NavProps = { role: Role; layout: "sidebar" | "sheet"; counts?: NavCounts; onNavigate?: () => void };

export function NavLinks(props: NavProps) {
  return <NavList {...props} pathname={usePathname()} />;
}

// Server-renderable nav without an active item. Used as the Suspense fallback
// on dynamic routes, where the pathname is only known at request time.
export function NavList({ role, layout, pathname, counts, onNavigate }: NavProps & { pathname: string | null }) {
  const base = basePathFor(role);

  return (
    <ul className="flex flex-col gap-0.5">
      {ITEMS.filter((item) => role === "TEAM" || !item.teamOnly).map(({ label, segment, icon: Icon }) => {
        const href = base + segment;
        const active = pathname !== null && (segment ? pathname.startsWith(href) : pathname === href);
        const count = counts?.[segment];
        return (
          <li key={label}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md font-medium transition-colors",
                layout === "sidebar" ? "text-small h-8 px-2.5" : "text-body h-11 px-3",
                active ? "bg-surface text-ink ring-1 ring-line" : "text-ink-soft hover:bg-subtle hover:text-ink",
              )}
            >
              <Icon className={cn("size-4 shrink-0", active ? "text-brand-600" : "text-faint")} />
              <span className="flex-1">{label}</span>
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
