"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/layout/brand";
import { cn } from "@/lib/cn";
import { DEMO_CLIENTS, DEMO_ROLE_LABEL, DEMO_TEAM, type DemoRole } from "@/lib/demo/data";
import { DEMO_ROLES, demoHref, type DemoView } from "@/lib/demo/links";
import { Avatar } from "@/components/ui/avatar";
import {
  ActivityIcon,
  ClipboardCheckIcon,
  FolderIcon,
  HomeIcon,
  ImageIcon,
  InboxIcon,
  MessageIcon,
  ShieldIcon,
  UsersIcon,
} from "@/components/ui/icons";

const ROLE_DOT: Record<DemoRole, string> = {
  client1: "bg-emerald-500",
  client2: "bg-sky-500",
  team: "bg-brand-600",
};

export const ROLE_SHORT: Record<DemoRole, string> = {
  client1: "Client 1",
  client2: "Client 2",
  team: "Team",
};

export function personaFor(role: DemoRole): { name: string; subtitle: string } {
  if (role === "team") return { name: DEMO_TEAM.reviewerName, subtitle: "Clyntique reviewer" };
  const c = DEMO_CLIENTS[role];
  return { name: c.contactName, subtitle: c.organization };
}

export function DemoBanner({ onReset }: { onReset?: () => void }) {
  return (
    <div className="bg-[#0A111E] text-white border-b border-brand-900/60 px-4 py-2.5 text-caption">
      <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <span className="flex size-2 rounded-full bg-gold-400 animate-pulse" />
          <span className="font-semibold text-gold-200 uppercase tracking-wider text-[10px]">Interactive demo sandbox</span>
          <span className="hidden sm:inline text-white/30">|</span>
          <span className="text-slate-300 text-[11px]">
            Fictional data · nothing is saved to the database, storage or AI · actions stay in this browser tab
          </span>
        </div>
        <div className="flex items-center gap-3">
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="text-[11px] text-slate-400 hover:text-white transition-colors underline-offset-2 hover:underline cursor-pointer"
            >
              Reset demo
            </button>
          )}
          <Link href="/auth/login" className="text-[11px] font-semibold text-gold-400 hover:text-gold-300 transition-colors">
            Sign in to a real account &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Sticky header: brand, "Demo" badge and the credential-free role switcher. */
export function DemoHeader({ role, view, id }: { role: DemoRole | null; view?: DemoView; id?: string | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur px-4 py-3 sm:px-6">
      <div className="mx-auto max-w-7xl flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" aria-label="Clyntique homepage" className="flex items-center gap-2">
            <Brand size="md" className="select-none" />
            <span className="rounded bg-brand-50 border border-brand-100 text-brand-700 text-[10px] font-bold px-1.5 py-0.5 uppercase tracking-wider">
              Demo
            </span>
          </Link>
          {role && (
            <Link href="/demo" className="md:hidden text-caption font-medium text-brand-700 hover:text-brand-900">
              All roles
            </Link>
          )}
        </div>

        <nav aria-label="Explore as" className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="hidden lg:inline text-caption font-medium text-muted shrink-0">Explore as:</span>
          <div className="inline-flex rounded-xl border border-line bg-subtle p-1 shadow-2xs shrink-0">
            {DEMO_ROLES.map((r) => {
              const active = r === role;
              return (
                <Link
                  key={r}
                  href={demoHref(r, view && view !== "overview" && view !== "queue" ? view : undefined, id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-1.5 text-small font-medium transition-all whitespace-nowrap",
                    active ? "bg-surface text-ink font-semibold shadow-xs ring-1 ring-line/80" : "text-muted hover:text-ink",
                  )}
                >
                  <span className={cn("size-2 rounded-full", ROLE_DOT[r])} />
                  <span className="hidden sm:inline">{DEMO_ROLE_LABEL[r]}</span>
                  <span className="sm:hidden">{ROLE_SHORT[r]}</span>
                </Link>
              );
            })}
          </div>
          {role && (
            <Link href="/demo" className="hidden md:inline text-caption font-medium text-brand-700 hover:text-brand-900 shrink-0">
              All roles
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

interface NavItem {
  view: DemoView;
  label: string;
  icon: ReactNode;
  count?: number;
}

export function navItemsFor(role: DemoRole, counts: { queue: number; messages: number }): NavItem[] {
  if (role === "team") {
    return [
      { view: "queue", label: "Review queue", icon: <InboxIcon />, count: counts.queue },
      { view: "submissions", label: "Submissions", icon: <ImageIcon /> },
      { view: "messages", label: "Messages", icon: <MessageIcon />, count: counts.messages },
      { view: "policies", label: "Policy library", icon: <ShieldIcon /> },
    ];
  }
  return [
    { view: "overview", label: "Overview", icon: <HomeIcon /> },
    { view: "projects", label: "Projects", icon: <FolderIcon /> },
    { view: "submissions", label: "Submissions", icon: <ImageIcon /> },
    { view: "messages", label: "Messages", icon: <MessageIcon /> },
  ];
}

/** Sidebar on desktop, horizontal tab strip on phones. Mirrors the real app's nav. */
export function DemoNav({ role, active, items }: { role: DemoRole; active: DemoView; items: NavItem[] }) {
  const persona = personaFor(role);
  return (
    <aside className="lg:w-60 shrink-0">
      <div className="hidden lg:flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 mb-4">
        <Avatar name={persona.name} />
        <div className="min-w-0">
          <p className="text-small font-semibold text-ink truncate">{persona.name}</p>
          <p className="text-caption text-muted truncate">{persona.subtitle}</p>
        </div>
      </div>
      <nav aria-label="Demo workspace" className="flex lg:flex-col gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
        {items.map((item) => {
          const isActive = item.view === active || (active === "submission" && item.view === "submissions");
          return (
            <Link
              key={item.view}
              href={demoHref(role, item.view)}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-small font-medium whitespace-nowrap transition-colors [&_svg]:size-4",
                isActive ? "bg-brand-50 text-brand-800 border border-brand-200" : "text-ink-soft hover:bg-subtle hover:text-ink border border-transparent",
              )}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.count ? (
                <span className="ml-auto rounded-full bg-attention-soft text-attention-ink text-micro font-semibold px-1.5 py-0.5 tabular-nums">
                  {item.count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="hidden lg:block mt-4 rounded-xl border border-dashed border-line px-3.5 py-3 text-caption text-muted">
        <p className="flex items-center gap-1.5 font-medium text-ink-soft [&_svg]:size-3.5">
          {role === "team" ? <UsersIcon /> : <ActivityIcon />}
          {role === "team" ? "Sees both clients" : "Sees only its own records"}
        </p>
        <p className="mt-1">
          {role === "team"
            ? "Team reviews every client's work. Clients are identified by name."
            : "Other clients' projects, submissions and messages are not visible here."}
        </p>
        <p className="mt-1 flex items-center gap-1.5 [&_svg]:size-3.5">
          <ClipboardCheckIcon />
          Simulated results are labelled.
        </p>
      </div>
    </aside>
  );
}
