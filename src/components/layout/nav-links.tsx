"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";
import { ActivityIcon, FolderIcon, HomeIcon, ImageIcon } from "@/components/ui/icons";
import { basePathFor } from "@/lib/navigation";

// Intentionally small: only sections that exist.
const ITEMS = [
  { label: "Dashboard", segment: "", icon: HomeIcon },
  { label: "Projects", segment: "/projects", icon: FolderIcon },
  { label: "Creatives", segment: "/creatives", icon: ImageIcon },
  { label: "Activity", segment: "/activity", icon: ActivityIcon },
];

type NavProps = { role: Role; layout: "sidebar" | "tabs" };

export function NavLinks(props: NavProps) {
  return <NavList {...props} pathname={usePathname()} />;
}

// Server-renderable nav without an active item. Used as the Suspense fallback
// on dynamic routes, where the pathname is only known at request time.
export function NavList({ role, layout, pathname }: NavProps & { pathname: string | null }) {
  const base = basePathFor(role);

  return (
    <ul className={layout === "sidebar" ? "flex flex-col gap-0.5" : "flex gap-1"}>
      {ITEMS.map(({ label: defaultLabel, segment, icon: Icon }) => {
        const href = base + segment;
        // Clients own their creatives as submissions.
        const label = role === "CLIENT" && segment === "/creatives" ? "Submissions" : defaultLabel;
        const active = pathname !== null && (segment ? pathname.startsWith(href) : pathname === href);
        return (
          <li key={label}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md text-sm font-medium transition-colors",
                layout === "sidebar" ? "h-9 px-2.5" : "h-8 px-2.5 whitespace-nowrap sm:px-3",
                active
                  ? "bg-surface text-ink shadow-card ring-1 ring-line"
                  : "text-muted hover:bg-black/[0.03] hover:text-ink",
              )}
            >
              <Icon className={cn("size-4", active ? "text-brand-600" : "text-faint", layout === "tabs" && "hidden sm:block")} />
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
