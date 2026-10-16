import Link from "next/link";
import { cache, Suspense, type ReactNode } from "react";
import type { Role } from "@/generated/prisma/enums";
import { requireRole, type CurrentUser } from "@/lib/auth/dal";
import { getReviewSummary } from "@/lib/data/review-queue";
import { basePathFor, ROLE_LABEL } from "@/lib/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/states";
import { BrandMark } from "./brand";
import { HistoryGuard } from "./history-guard";
import { LogoutButton } from "./logout-button";
import { MobileMenu } from "./mobile-menu";
import { NavList, type NavCounts } from "./nav-links";
import { SidebarProvider } from "./sidebar-context";
import { ShellLayout } from "./shell-layout";
import { DesktopSidebar } from "./desktop-sidebar";

// Authenticated application layout shared by the TEAM and CLIENT areas.
// Only the user section and the TEAM queue count read the session/database,
// so the rest of the shell is static and renders immediately.
export function AppShell({ role, children }: { role: Role; children: ReactNode }) {
  const home = basePathFor(role);

  return (
    <SidebarProvider>
      <HistoryGuard />
      <a
        href="#main"
        className="text-small sr-only z-50 rounded-md bg-surface px-3 py-2 font-medium text-ink ring-1 ring-line focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <ShellLayout
        sidebar={
          <Suspense fallback={<SidebarSkeleton role={role} />}>
            <SidebarContent role={role} />
          </Suspense>
        }
        mobileHeader={
          <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur md:hidden">
            <Link href={home} className="rounded-md flex items-center" aria-label="Clyntique overview">
              <BrandMark width={32} />
            </Link>
            <Suspense fallback={<Skeleton className="h-9 w-20" />}>
              <PhoneMenu role={role} />
            </Suspense>
          </header>
        }
      >
        {children}
      </ShellLayout>
    </SidebarProvider>
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

async function SidebarContent({ role }: { role: Role }) {
  const user = await requireRole(role);
  const counts = await navCounts(user);
  return (
    <DesktopSidebar
      role={role}
      user={{ id: user.id, name: user.name, email: user.email, role: user.role }}
      counts={counts}
    />
  );
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

async function PhoneMenu({ role }: { role: Role }) {
  const user = await requireRole(role);
  return (
    <MobileMenu
      role={role}
      counts={await navCounts(user)}
      footer={<UserBlock user={user} />}
    />
  );
}

function SidebarSkeleton({ role }: { role: Role }) {
  const home = basePathFor(role);
  return (
    <aside
      aria-hidden
      className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface md:flex"
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-line/60">
        <Link href={home} className="rounded-md flex items-center">
          <BrandMark width={40} />
        </Link>
      </div>
      <div className="flex-1 px-3 py-3">
        <NavList role={role} layout="sidebar" pathname={null} />
      </div>
      <div className="border-t border-line/80 p-2.5">
        <UserSkeleton />
      </div>
    </aside>
  );
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
