"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { DEMO_CLIENTS, type DemoRole } from "@/lib/demo/data";
import { demoHref } from "@/lib/demo/links";
import { ArrowRightIcon, ShieldIcon, SparklesIcon, UserIcon, UsersIcon } from "@/components/ui/icons";

const OPTIONS: Array<{ role: DemoRole; title: string; persona: string; description: string; bullets: string[]; accent: string; icon: React.ReactNode }> = [
  {
    role: "client1",
    title: "Explore as Client 1",
    persona: `${DEMO_CLIENTS.client1.contactName} · ${DEMO_CLIENTS.client1.organization}`,
    description: "A family practice with a completed review, one submission in review and one waiting for the team.",
    bullets: ["Project dashboard and submissions", "Creative preview with version history", "Evidence, findings and messages"],
    accent: "border-emerald-200 hover:border-emerald-400 [&_.dot]:bg-emerald-500",
    icon: <UserIcon />,
  },
  {
    role: "client2",
    title: "Explore as Client 2",
    persona: `${DEMO_CLIENTS.client2.contactName} · ${DEMO_CLIENTS.client2.organization}`,
    description: "A pediatric clinic with changes requested on one ad. Respond, revise and resubmit.",
    bullets: ["Open finding with suggested wording", "Resubmit a new version", "Isolated from Client 1's data"],
    accent: "border-sky-200 hover:border-sky-400 [&_.dot]:bg-sky-500",
    icon: <UserIcon />,
  },
  {
    role: "team",
    title: "Explore as Team",
    persona: "Clyntique reviewer · sees both clients",
    description: "The review queue across both clients, a simulated AI scan against sample policies and the review workflow.",
    bullets: ["Review queue and client inbox", "Simulated AI findings with citations", "Request changes or complete the review"],
    accent: "border-brand-200 hover:border-brand-400 [&_.dot]:bg-brand-600",
    icon: <UsersIcon />,
  },
];

export function DemoRoleChooser() {
  return (
    <main className="flex-1 mx-auto max-w-6xl w-full px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-2xl">
        <span className="text-eyebrow font-semibold uppercase text-gold-700">Explore the demo</span>
        <h1 className="font-heading mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Pick a role. No sign-in needed.</h1>
        <p className="text-body text-muted mt-3">
          Three people share one review workflow: two clinic clients and the Clyntique review team. Switch roles at any time from the header. Everything here is fictional and stays in this browser tab.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5">
        {OPTIONS.map((o) => (
          <Link
            key={o.role}
            href={demoHref(o.role)}
            className={cn("group flex flex-col rounded-2xl border-2 bg-surface p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-brand-600", o.accent)}
          >
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-subtle text-ink-soft [&_svg]:size-5">{o.icon}</span>
              <span className="dot size-2.5 rounded-full" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold text-ink mt-4">{o.title}</h2>
            <p className="text-caption font-medium text-ink-soft mt-0.5">{o.persona}</p>
            <p className="text-small text-muted mt-3 leading-relaxed">{o.description}</p>
            <ul className="mt-4 flex flex-col gap-1.5 text-caption text-ink-soft">
              {o.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 rounded-full bg-gold-500 shrink-0" aria-hidden />
                  {b}
                </li>
              ))}
            </ul>
            <span className="mt-6 inline-flex items-center gap-2 text-small font-semibold text-brand-700 group-hover:text-brand-900">
              Open workspace <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 text-caption text-muted">
        <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3">
          <ShieldIcon className="size-4 text-brand-600 shrink-0 mt-0.5" />
          <span>
            <strong className="text-ink-soft">Isolated from Production.</strong> The demo never reads or writes the database, uploads files, or calls an AI model. Real client workspaces are not reachable from here.
          </span>
        </p>
        <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3">
          <SparklesIcon className="size-4 text-gold-600 shrink-0 mt-0.5" />
          <span>
            <strong className="text-ink-soft">Simulated results are labelled.</strong> AI findings come from canned sample policies, and every approval is an internal review decision, never platform or regulatory approval.
          </span>
        </p>
      </div>
    </main>
  );
}
