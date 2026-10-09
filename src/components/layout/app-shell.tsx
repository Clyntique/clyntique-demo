import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import type { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";
import { basePathFor, ROLE_LABEL } from "@/lib/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/states";
import { Brand } from "./brand";
import { LogoutButton } from "./logout-button";
import { NavLinks, NavList } from "./nav-links";

const WORKSPACE_LABEL: Record<Role, string> = {
  TEAM: "Team workspace",
  CLIENT: "Client review portal",
};

// Authenticated application layout shared by the TEAM and CLIENT areas.
// Only the user section reads the session, so the rest of the shell is static.
export function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  const home = basePathFor(role);

  return (
    <div className="flex min-h-dvh flex-1 flex-col md:pl-60">
      {/* Desktop / tablet sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-canvas md:flex">
        <div className="flex h-16 items-center px-5">
          <Link href={home} className="rounded-md">
            <Brand />
          </Link>
        </div>
        <p className="text-label px-5 pb-2">{WORKSPACE_LABEL[role]}</p>
        <nav aria-label="Main" className="flex-1 px-3">
          <Suspense fallback={<NavList role={role} layout="sidebar" pathname={null} />}>
            <NavLinks role={role} layout="sidebar" />
          </Suspense>
        </nav>
        <div className="border-t border-line p-3">
          <Suspense fallback={<UserSkeleton />}>
            <SidebarUser role={role} />
          </Suspense>
        </div>
      </aside>

      {/* Mobile top bar with scrollable tabs */}
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 backdrop-blur md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href={home}>
            <Brand />
          </Link>
          <Suspense fallback={<Skeleton className="size-8 rounded-full" />}>
            <MobileUser role={role} />
          </Suspense>
        </div>
        <nav aria-label="Main" className="-mb-px overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
          <Suspense fallback={<NavList role={role} layout="tabs" pathname={null} />}>
            <NavLinks role={role} layout="tabs" />
          </Suspense>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 md:px-10 md:py-10">
        {children}
      </main>
    </div>
  );
}

async function SidebarUser({ role }: { role: Role }) {
  const user = await requireRole(role);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2.5 px-2.5 py-1.5">
        <Avatar name={user.name} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>
          <p className="text-meta">{ROLE_LABEL[user.role]}</p>
        </div>
      </div>
      <LogoutButton />
    </div>
  );
}

async function MobileUser({ role }: { role: Role }) {
  const user = await requireRole(role);
  return (
    <div className="flex items-center gap-1">
      <span className="sr-only">
        Signed in as {user.name}, {ROLE_LABEL[user.role]}
      </span>
      <Avatar name={user.name} />
      <LogoutButton compact />
    </div>
  );
}

function UserSkeleton() {
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-1.5">
      <Skeleton className="size-8 rounded-full" />
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-2.5 w-12" />
      </div>
    </div>
  );
}
