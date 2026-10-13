import Link from "next/link";
import { cache, Suspense, type ReactNode } from "react";
import type { Role } from "@/generated/prisma/enums";
import { requireRole, type CurrentUser } from "@/lib/auth/dal";
import { getReviewSummary } from "@/lib/data/review-queue";
import { basePathFor, ROLE_LABEL } from "@/lib/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/states";
import { Brand } from "./brand";
import { LogoutButton } from "./logout-button";
import { MobileMenu } from "./mobile-menu";
import { NavLinks, NavList, type NavCounts } from "./nav-links";

const WORKSPACE_LABEL: Record<Role, string> = {
  TEAM: "Team workspace",
  CLIENT: "Client workspace",
};

// Authenticated application layout shared by the TEAM and CLIENT areas.
// Only the user section and the TEAM queue count read the session/database,
// so the rest of the shell is static and renders immediately.
export function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  const home = basePathFor(role);

  return (
    <div className="flex min-h-dvh flex-1 flex-col md:pl-58">
      <a
        href="#main"
        className="text-small sr-only z-50 rounded-md bg-surface px-3 py-2 font-medium text-ink ring-1 ring-line focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      {/* Desktop / tablet sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-58 flex-col border-r border-line bg-canvas md:flex">
        <div className="flex h-15 items-center px-4">
          <Link href={home} className="rounded-md">
            <Brand />
          </Link>
        </div>
        <p className="text-caption px-4 pb-2 text-faint">{WORKSPACE_LABEL[role]}</p>
        <nav aria-label="Main" className="flex-1 px-2.5">
          <Suspense fallback={<NavList role={role} layout="sidebar" pathname={null} />}>
            <SidebarNav role={role} />
          </Suspense>
        </nav>
        <div className="border-t border-line p-2.5">
          <Suspense fallback={<UserSkeleton />}>
            <SidebarUser role={role} />
          </Suspense>
        </div>
      </aside>

      {/* Phone top bar with a menu sheet */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-canvas/95 px-4 backdrop-blur md:hidden">
        <Link href={home} className="rounded-md">
          <Brand />
        </Link>
        <Suspense fallback={<Skeleton className="h-9 w-20" />}>
          <PhoneMenu role={role} />
        </Suspense>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 md:px-10 md:py-9 has-[[data-wide]]:max-w-[1440px]">
        {children}
      </main>
    </div>
  );
}

// Cached per request: the sidebar and the phone menu both show the count.
const navCounts = cache(async (user: CurrentUser): Promise<NavCounts> => {
  if (user.role !== "TEAM") return {};
  // A navigation badge must never take the page down: without it the link still works.
  try {
    const summary = await getReviewSummary(user);
    return { "/review": summary.waiting };
  } catch {
    return {};
  }
});

async function SidebarNav({ role }: { role: Role }) {
  const user = await requireRole(role);
  return <NavLinks role={role} layout="sidebar" counts={await navCounts(user)} />;
}

function UserBlock({ user }: { user: CurrentUser }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2.5 px-2 py-1.5">
        <Avatar name={user.name} />
        <div className="min-w-0">
          <p className="text-small truncate font-medium text-ink">{user.name}</p>
          <p className="text-caption truncate text-muted">
            {ROLE_LABEL[user.role]} · {user.email}
          </p>
        </div>
      </div>
      <LogoutButton />
    </div>
  );
}

async function SidebarUser({ role }: { role: Role }) {
  const user = await requireRole(role);
  return <UserBlock user={user} />;
}

async function PhoneMenu({ role }: { role: Role }) {
  const user = await requireRole(role);
  return <MobileMenu role={role} counts={await navCounts(user)} footer={<UserBlock user={user} />} />;
}

function UserSkeleton() {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5">
      <Skeleton className="size-8 rounded-full" />
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-2.5 w-12" />
      </div>
    </div>
  );
}
