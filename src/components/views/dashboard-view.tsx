import Link from "next/link";
import type { Role } from "@/generated/prisma/enums";
import { requireRole, type CurrentUser } from "@/lib/auth/dal";
import {
  getClientOverview,
  getTeamOverview,
  getTeamMetrics,
  getClientMetrics,
  type ClientItem,
  type WaitingItem,
  type CompletedItem,
} from "@/lib/data/overview";
import type { QueueItem } from "@/lib/data/review-queue";
import { getActivity } from "@/lib/data/workspace";
import { cn } from "@/lib/cn";
import { formatRelative, pluralize, requestTime } from "@/lib/format";
import { inReviewFindingsLabel } from "@/lib/workflow/findings";
import { REVIEW_OUTCOME_LABEL } from "@/lib/workflow/labels";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import {
  AlertIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  ClockIcon,
  FolderIcon,
  InboxIcon,
  LayersIcon,
  MessageIcon,
  PlusIcon,
  ShieldIcon,
} from "@/components/ui/icons";
import { LocalDate, LocalGreeting } from "@/components/ui/local-time";
import { SubmissionSteps } from "@/components/ui/submission-steps";
import { StatusBadge, TonePill } from "@/components/ui/status-badge";
import { ActivityList } from "@/components/workspace/activity-feed";
import { CreativeThumb } from "@/components/workspace/creative-card";
import { MessagesCard } from "@/components/messages/messages-card";

/*
 * Clyntique Enterprise Dashboard View.
 *
 * Strict Principles:
 * 1. Zero fabricated metrics: All numbers derive strictly from real PostgreSQL rows.
 *    If active policies or completed reviews are 0, show genuine empty states.
 * 2. Non-misleading terminology: Internal AI-assisted review and workflow decisions,
 *    never official government clearance or regulatory certification.
 * 3. High-density, luminous enterprise aesthetics: Clean white surfaces (#FFFFFF),
 *    subtle borders, refined elevation, and clear SLA visibility.
 */

const DAY = 24 * 60 * 60 * 1000;

function Thumb({ item }: { item: Parameters<typeof CreativeThumb>[0]["creative"] }) {
  return <CreativeThumb creative={item} fill className="h-12 w-10 shrink-0 rounded-md border border-line object-cover shadow-xs" />;
}

/** Round and age in the enterprise record style; waits over two days receive amber SLA alert. */
function Age({ round, since, now }: { round?: number | null; since: Date | null; now: number }) {
  const late = since !== null && now - since.getTime() > 2 * DAY;
  return (
    <span className={cn("text-record inline-flex items-center gap-1.5 whitespace-nowrap", late ? "font-semibold text-attention-ink" : "text-muted")}>
      {late && <span className="size-1.5 shrink-0 rounded-full bg-attention-solid" />}
      {round ? `R${round} · ` : ""}
      {since ? formatRelative(since, now).replace(" ago", "") : "–"}
    </span>
  );
}

function age(since: Date, now: number) {
  return formatRelative(since, now).replace(" ago", "").toLowerCase();
}

export async function DashboardView({ role }: { role: Role }) {
  const user = await requireRole(role);
  return role === "TEAM" ? <TeamDashboard user={user} /> : <ClientDashboard user={user} />;
}

// ===========================================================================
// TEAM DASHBOARD
// ===========================================================================

async function TeamDashboard({ user }: { user: CurrentUser }) {
  const [overview, metrics, activity] = await Promise.all([
    getTeamOverview(user),
    getTeamMetrics(user),
    getActivity(user, { take: 7 }),
  ]);
  const now = requestTime();
  const { needsReview, inReview, waitingOnClients, completed } = overview;
  const oldest = needsReview[0];

  const summary = oldest
    ? `${pluralize(needsReview.length, "submission")} awaiting review. Oldest has waited ${formatRelative(oldest.submittedAt, now).replace(" ago", "").toLowerCase()}.`
    : inReview.length
      ? `Queue clear of new submissions. ${pluralize(inReview.length, "review")} currently in progress.`
      : "All review queues are currently clear.";

  return (
    <div className="space-y-8">
      <PageHeader
        size="lg"
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <span className="font-medium text-brand-700">Team Workspace</span>
            <span className="text-slate-300">/</span>
            <span className="text-muted">Review Operations</span>
            <LocalDate prefix=" · " />
          </span>
        }
        title={<LocalGreeting />}
        description={summary}
        action={
          <div className="flex items-center gap-2.5">
            <Link href="/admin/policy-dashboard" prefetch={true} className={buttonClasses({ variant: "ghost" })}>
              <LayersIcon className="size-4" /> Policy Dashboard
            </Link>
            <Link href="/admin/projects/new" prefetch={true} className={buttonClasses({ variant: "secondary" })}>
              <PlusIcon className="size-4" /> New project
            </Link>
            <Link
              href="/admin/review"
              prefetch={true}
              className={buttonClasses({ variant: needsReview.length ? "primary" : "secondary" })}
            >
              Open review queue
              <ArrowRightIcon className="size-4 ml-1" />
            </Link>
          </div>
        }
      />

      {/* 4 KPI Metric Cards */}
      <section aria-label="Operational Metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Needs Review */}
        <Link
          href="/admin/review"
          className="group relative flex flex-col justify-between rounded-xl border border-line bg-surface p-5 shadow-xs transition-all hover:border-slate-300 hover:shadow-card"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-micro font-semibold uppercase tracking-wider text-muted">Needs Review</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-attention-soft text-attention-ink">
                <InboxIcon className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-ink tabular-nums">{needsReview.length}</span>
              <span className="text-caption text-muted">submissions</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-caption">
            <span className={cn(oldest ? "font-medium text-attention-ink" : "text-muted")}>
              {oldest ? `Oldest waiting ${age(oldest.submittedAt, now)}` : "Queue is clear"}
            </span>
            <ArrowUpRightIcon className="size-3.5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink" />
          </div>
        </Link>

        {/* Card 2: In Review */}
        <Link
          href="/admin/review"
          className="group relative flex flex-col justify-between rounded-xl border border-line bg-surface p-5 shadow-xs transition-all hover:border-slate-300 hover:shadow-card"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-micro font-semibold uppercase tracking-wider text-muted">In Active Review</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <ClockIcon className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-ink tabular-nums">{inReview.length}</span>
              <span className="text-caption text-muted">underway</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-caption">
            <span className="text-muted">
              {inReview.length ? `${pluralize(inReview.length, "item")} being evaluated` : "No reviews active"}
            </span>
            <ArrowUpRightIcon className="size-3.5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink" />
          </div>
        </Link>

        {/* Card 3: Waiting on Clients */}
        <div className="flex flex-col justify-between rounded-xl border border-line bg-surface p-5 shadow-xs">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-micro font-semibold uppercase tracking-wider text-muted">Waiting on Clients</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                <MessageIcon className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-ink tabular-nums">{waitingOnClients.length}</span>
              <span className="text-caption text-muted">awaiting feedback</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-caption text-muted">
            <span>
              {waitingOnClients[0]?.requestedAt
                ? `Longest wait: ${age(waitingOnClients[0].requestedAt, now)}`
                : "No revisions pending"}
            </span>
            <span>{waitingOnClients.reduce((sum, w) => sum + w.sharedFindings, 0)} findings open</span>
          </div>
        </div>

        {/* Card 4: Compliance Rules & Real Turnaround */}
        <Link
          href="/admin/policies"
          className="group relative flex flex-col justify-between rounded-xl border border-line bg-surface p-5 shadow-xs transition-all hover:border-slate-300 hover:shadow-card"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-micro font-semibold uppercase tracking-wider text-muted">Active Compliance Rules</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <ShieldIcon className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-ink tabular-nums">{metrics.activePolicyCount}</span>
              <span className="text-caption text-muted">approved rules</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-line/60 pt-3 text-caption">
            <span className={cn(metrics.activePolicyCount === 0 ? "font-medium text-amber-700" : "text-muted")}>
              {metrics.activePolicyCount === 0
                ? "Setup needed in Policy Library"
                : metrics.averageTurnaroundHours !== null
                  ? `${metrics.averageTurnaroundHours}h avg turnaround (7d)`
                  : "Verified regulatory coverage"}
            </span>
            <ArrowUpRightIcon className="size-3.5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink" />
          </div>
        </Link>
      </section>

      {/* Main Grid: Review Queue & Operations */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Left Column: Primary Review Queue & In-Review */}
        <div className="space-y-8">
          {/* Active Review Queue */}
          <section aria-label="Review Queue" className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-ink">Creative Review Queue</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-caption font-semibold text-slate-700 tabular-nums">
                  {needsReview.length}
                </span>
              </div>
              <div className="flex items-center gap-3 text-caption text-muted">
                <span>Oldest first</span>
                {needsReview.length > 5 && (
                  <Link href="/admin/review" className="font-medium text-brand-700 hover:text-brand-900">
                    View all {needsReview.length}
                  </Link>
                )}
              </div>
            </div>

            {needsReview.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <CheckCircleIcon className="size-6" />
                </div>
                <p className="mt-3 text-small font-semibold text-ink">Review queue is clear</p>
                <p className="mt-1 max-w-sm text-caption text-muted">
                  New client ad submissions will appear here automatically as soon as they are submitted.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-line">
                {needsReview.slice(0, 6).map((item, idx) => (
                  <QueueRow key={item.id} item={item} now={now} isNext={idx === 0} />
                ))}
              </div>
            )}
          </section>

          {/* In-Review Items (if any) */}
          {inReview.length > 0 && (
            <section aria-label="In Review" className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold text-ink">In Active Review</h2>
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-caption font-semibold text-blue-700 tabular-nums">
                    {inReview.length}
                  </span>
                </div>
                <span className="text-caption text-muted">Work in progress</span>
              </div>
              <div className="divide-y divide-line">
                {inReview.map((item) => (
                  <QueueRow key={item.id} item={item} now={now} />
                ))}
              </div>
            </section>
          )}

          {/* Waiting on Clients */}
          <section aria-label="Waiting on Clients" className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-ink">Waiting on Client Response</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-caption font-semibold text-slate-700 tabular-nums">
                  {waitingOnClients.length}
                </span>
              </div>
              <span className="text-caption text-muted">Longest wait first</span>
            </div>

            {waitingOnClients.length === 0 ? (
              <div className="p-8 text-center text-small text-muted">
                No clients currently owe feedback or revisions.
              </div>
            ) : (
              <div className="divide-y divide-line">
                {waitingOnClients.map((w) => (
                  <WaitingRow key={w.id} item={w} now={now} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Completed This Week & Recent Activity */}
        <div className="space-y-8">
          {/* Completed This Week */}
          <section aria-label="Completed Reviews" className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-ink">Completed This Week</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-caption font-semibold text-slate-700 tabular-nums">
                  {completed.length}
                </span>
              </div>
              <span className="text-caption text-muted">Past 7 days</span>
            </div>

            {completed.length === 0 ? (
              <div className="p-8 text-center text-small text-muted">
                No reviews completed in the past 7 days.
              </div>
            ) : (
              <div className="divide-y divide-line">
                {completed.map((c) => (
                  <CompletedRow key={`${c.id}-${c.completedAt.toISOString()}`} item={c} now={now} />
                ))}
              </div>
            )}
          </section>

          {/* Client messages */}
          <MessagesCard user={user} />

          {/* Recent Operational Activity */}
          <section aria-label="Recent Activity" className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-base font-semibold text-ink">Recent Activity</h2>
              <Link href="/admin/activity" className="text-caption font-medium text-brand-700 hover:text-brand-900">
                View all
              </Link>
            </div>
            <div className="p-5">
              {activity.length ? (
                <ActivityList items={activity} now={now} />
              ) : (
                <p className="text-small text-muted">No activity recorded yet.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function QueueRow({ item, now, isNext = false }: { item: QueueItem; now: number; isNext?: boolean }) {
  const targets = [...item.markets, ...item.platforms];
  const isInReview = item.status === "IN_REVIEW";

  return (
    <div className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-slate-50/70 sm:px-5">
      <Link href={`/admin/creatives/${item.id}`} className="flex min-w-0 flex-1 items-center gap-3.5">
        <Thumb item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-card-title text-ink font-medium">{item.name}</span>
            {isNext && (
              <span className="inline-flex items-center rounded-md bg-brand-50 px-2 py-0.5 text-micro font-semibold text-brand-800">
                Next in Queue
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
            <span className="font-medium text-slate-700">{item.clientName}</span>
            <span>·</span>
            <span>{item.projectName}</span>
            {targets.length > 0 && (
              <>
                <span>·</span>
                <span className="inline-flex gap-1">
                  {targets.slice(0, 3).map((t) => (
                    <span key={t} className="rounded bg-slate-100 px-1.5 py-0.2 text-micro font-medium text-slate-600">
                      {t}
                    </span>
                  ))}
                  {targets.length > 3 && <span className="text-micro text-muted">+{targets.length - 3}</span>}
                </span>
              </>
            )}
          </div>
          {isInReview && (
            <p className="mt-1 text-caption text-brand-700 font-medium">
              {inReviewFindingsLabel(item.findingStatuses)}
            </p>
          )}
        </div>
      </Link>

      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden text-right sm:block">
          <Age round={item.roundNumber} since={item.submittedAt} now={now} />
        </div>
        <Link
          href={`/admin/creatives/${item.id}`}
          className={buttonClasses({
            size: "sm",
            variant: isInReview ? "secondary" : "primary",
          })}
        >
          {isInReview ? "Continue" : "Start Review"}
        </Link>
      </div>
    </div>
  );
}

function WaitingRow({ item, now }: { item: WaitingItem; now: number }) {
  return (
    <Link
      href={`/admin/creatives/${item.id}`}
      className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-slate-50/70 sm:px-5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <Thumb item={item} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-card-title text-ink font-medium">{item.name}</p>
          <p className="mt-0.5 truncate text-caption text-muted">
            {item.clientName} · {item.projectName} · {pluralize(item.sharedFindings, "compliance finding")} shared
          </p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <Age round={item.roundNumber} since={item.requestedAt} now={now} />
      </div>
    </Link>
  );
}

function CompletedRow({ item, now }: { item: CompletedItem; now: number }) {
  return (
    <Link
      href={`/admin/creatives/${item.id}`}
      className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-slate-50/70 sm:px-5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <Thumb item={item} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-card-title text-ink font-medium">{item.name}</p>
          <div className="mt-1 flex items-center gap-2 text-caption text-muted">
            <span>{item.clientName}</span>
            <span>·</span>
            <span>V{item.versionNumber}</span>
            <span>·</span>
            <span>{formatRelative(item.completedAt, now).toLowerCase()}</span>
          </div>
        </div>
      </div>
      <div className="shrink-0">
        <TonePill tone={item.outcome === "COMPLETED_WITH_OPEN_ISSUES" || item.outcome === "NOT_REVIEWABLE" ? "attention" : "positive"}>
          {item.outcome ? REVIEW_OUTCOME_LABEL[item.outcome] : "Review Complete"}
        </TonePill>
      </div>
    </Link>
  );
}

// ===========================================================================
// CLIENT DASHBOARD
// ===========================================================================

async function ClientDashboard({ user }: { user: CurrentUser }) {
  const [overview, metrics, activity] = await Promise.all([
    getClientOverview(user),
    getClientMetrics(user),
    getActivity(user, { take: 5 }),
  ]);
  const now = requestTime();
  const { actionNeeded, withClyntique, done, earlierWork } = overview;
  const firstName = user.name.split(" ")[0];
  const changes = actionNeeded.filter((i) => i.status === "CHANGES_REQUESTED");

  const summary = changes.length
    ? `The Clyntique review team requested revisions on ${pluralize(changes.length, "submission")}.`
    : actionNeeded.length
      ? "You have a draft ready to be submitted for review."
      : withClyntique.length
        ? `${pluralize(withClyntique.length, "submission")} ${withClyntique.length === 1 ? "is" : "are"} currently under review by Clyntique.`
        : "Upload an advertising creative to start an AI-assisted compliance review for your target markets.";

  return (
    <div className="space-y-8">
      <PageHeader
        size="lg"
        eyebrow="Client Workspace"
        title={`Welcome back, ${firstName}`}
        description={summary}
        action={
          <div className="flex items-center gap-2.5">
            <Link href="/dashboard/plans" prefetch={true} className={buttonClasses({ variant: "ghost" })}>
              <ShieldIcon className="size-4" /> Plans &amp; Add-ons
            </Link>
            <Link href="/dashboard/submissions/new" prefetch={true} className={buttonClasses({ variant: "primary" })}>
              <PlusIcon className="size-4" /> New submission
            </Link>
          </div>
        }
      />

      {/* Action Required Banner for Client Revisions */}
      {changes.length > 0 && (
        <section
          aria-label="Action Required Alert"
          className="relative overflow-hidden rounded-xl border border-attention-line bg-attention-soft/90 p-5 shadow-xs sm:p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-attention-solid text-white shadow-xs">
                <AlertIcon className="size-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-attention-ink">
                  Action Required on {pluralize(changes.length, "submission")}
                </h2>
                <p className="mt-1 text-small text-slate-700">
                  The Clyntique review team has shared specific compliance findings that require your answers or updated media files before approval.
                </p>
              </div>
            </div>
            <Link
              href={`/dashboard/creatives/${changes[0].id}`}
              prefetch={true}
              className={buttonClasses({ variant: "primary", className: "shrink-0 shadow-sm" })}
            >
              Respond to findings
              <ArrowRightIcon className="size-4 ml-1.5" />
            </Link>
          </div>
        </section>
      )}

      {/* 4 Client KPI Metric Cards */}
      <section aria-label="Submission Overview" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Action Required */}
        <div
          className={cn(
            "flex flex-col justify-between rounded-xl border p-5 shadow-xs transition-all",
            actionNeeded.length > 0
              ? "border-amber-300 bg-amber-50/40"
              : "border-line bg-surface",
          )}
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-micro font-semibold uppercase tracking-wider text-muted">Your Action Needed</span>
              <div
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg",
                  actionNeeded.length > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500",
                )}
              >
                <AlertIcon className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className={cn("text-3xl font-bold tracking-tight tabular-nums", actionNeeded.length ? "text-amber-900" : "text-ink")}>
                {actionNeeded.length}
              </span>
              <span className="text-caption text-muted">items</span>
            </div>
          </div>
          <div className="mt-4 border-t border-line/60 pt-3 text-caption text-muted">
            {changes.length > 0 ? `${pluralize(changes.length, "revision")} requested` : actionNeeded.length ? "Draft awaiting submit" : "All caught up"}
          </div>
        </div>

        {/* Card 2: Under Review */}
        <div className="flex flex-col justify-between rounded-xl border border-line bg-surface p-5 shadow-xs">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-micro font-semibold uppercase tracking-wider text-muted">With Clyntique</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <ClockIcon className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-ink tabular-nums">{withClyntique.length}</span>
              <span className="text-caption text-muted">in review</span>
            </div>
          </div>
          <div className="mt-4 border-t border-line/60 pt-3 text-caption text-muted">
            {withClyntique.length ? "Review team evaluating" : "No submissions in queue"}
          </div>
        </div>

        {/* Card 3: Internal Review Complete */}
        <div className="flex flex-col justify-between rounded-xl border border-line bg-surface p-5 shadow-xs">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-micro font-semibold uppercase tracking-wider text-muted">Internal Review Done</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <CheckCircleIcon className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-ink tabular-nums">{done.length}</span>
              <span className="text-caption text-muted">completed</span>
            </div>
          </div>
          <div className="mt-4 border-t border-line/60 pt-3 text-caption text-muted">
            Final review decisions recorded
          </div>
        </div>

        {/* Card 4: Client Projects */}
        <div className="flex flex-col justify-between rounded-xl border border-line bg-surface p-5 shadow-xs">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-micro font-semibold uppercase tracking-wider text-muted">Active Projects</span>
              <div className="flex size-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <FolderIcon className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-ink tabular-nums">{metrics.projectCount}</span>
              <span className="text-caption text-muted">campaigns</span>
            </div>
          </div>
          <div className="mt-4 border-t border-line/60 pt-3 text-caption text-muted">
            Campaign workspaces configured
          </div>
        </div>
      </section>

      {/* Review Process Stepper */}
      <HowItWorks />

      {/* Chat with the reviewer */}
      <MessagesCard user={user} />

      {/* Submissions Section */}
      <div className="space-y-8">
        {/* Action Needed */}
        <section aria-label="Action Needed" className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-ink">Action Needed from You</h2>
              <span className={cn(
                "rounded-full px-2.5 py-0.5 text-caption font-semibold tabular-nums",
                actionNeeded.length ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
              )}>
                {actionNeeded.length}
              </span>
            </div>
            <span className="text-caption text-muted">High priority</span>
          </div>

          {actionNeeded.length === 0 ? (
            <div className="flex items-center gap-3 p-6 text-slate-600">
              <div className="flex size-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircleIcon className="size-4" />
              </div>
              <p className="text-small">Nothing needs your attention right now. All feedback will appear here as soon as our team completes their review.</p>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {actionNeeded.map((item) => (
                <ClientActionRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>

        {/* Two-column layout for In Progress and Done */}
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
          {/* With Clyntique */}
          <section aria-label="Under Review" className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-ink">With Clyntique</h2>
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-caption font-semibold text-blue-700 tabular-nums">
                  {withClyntique.length}
                </span>
              </div>
              <span className="text-caption text-muted">In review</span>
            </div>

            {withClyntique.length === 0 ? (
              <div className="p-8 text-center text-small text-muted">
                No submissions are currently under review.
              </div>
            ) : (
              <div className="divide-y divide-line">
                {withClyntique.map((item) => (
                  <ClientRow key={item.id} item={item} now={now} />
                ))}
              </div>
            )}
          </section>

          {/* Completed Reviews */}
          <section aria-label="Completed Reviews" className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-ink">Internal Review Completed</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-caption font-semibold text-slate-700 tabular-nums">
                  {done.length}
                </span>
              </div>
              {earlierWork > 0 && (
                <Link href="/dashboard/creatives" className="text-caption font-medium text-brand-700 hover:text-brand-900">
                  {pluralize(earlierWork, "earlier creative")}
                </Link>
              )}
            </div>

            {done.length === 0 ? (
              <div className="p-8 text-center text-small text-muted">
                Completed creative reviews will appear here with final review outcomes.
              </div>
            ) : (
              <div className="divide-y divide-line">
                {done.map((item) => (
                  <ClientRow key={item.id} item={item} now={now} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Client Activity */}
        <section aria-label="Recent Workspace Activity" className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-base font-semibold text-ink">Recent Activity</h2>
            <Link href="/dashboard/activity" className="text-caption font-medium text-brand-700 hover:text-brand-900">
              View all
            </Link>
          </div>
          <div className="p-5">
            {activity.length ? (
              <ActivityList items={activity} now={now} />
            ) : (
              <p className="text-small text-muted">No activity yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ClientActionRow({ item }: { item: ClientItem }) {
  const isChanges = item.status === "CHANGES_REQUESTED";
  const href = `/dashboard/creatives/${item.id}`;

  return (
    <div className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-slate-50/70 sm:px-5">
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3.5">
        <Thumb item={item} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-card-title text-ink font-medium">{item.name}</p>
          <p className="mt-1 text-caption text-slate-600">
            {isChanges
              ? item.findingsToAnswer > 0
                ? `Reviewer requested revisions: ${pluralize(item.findingsToAnswer, "compliance finding")} to answer, then resubmit.`
                : "All findings answered. Ready to resubmit."
              : `Draft in ${item.projectName} · not submitted yet`}
          </p>
        </div>
      </Link>
      <div className="shrink-0">
        <Link
          href={href}
          className={buttonClasses({
            size: "sm",
            variant: isChanges ? "primary" : "secondary",
          })}
        >
          {isChanges ? (item.findingsToAnswer > 0 ? "Respond" : "Resubmit") : "Continue Draft"}
        </Link>
      </div>
    </div>
  );
}

function ClientRow({ item, now }: { item: ClientItem; now: number }) {
  const href = `/dashboard/creatives/${item.id}`;

  return (
    <div className="p-4 transition-colors hover:bg-slate-50/70 sm:px-5">
      <Link href={href} className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <Thumb item={item} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-card-title text-ink font-medium">{item.name}</p>
            <p className="mt-0.5 truncate text-caption text-muted">
              {item.projectName} · {item.status === "REVIEW_COMPLETE"
                ? `${item.outcome ? REVIEW_OUTCOME_LABEL[item.outcome] : "Review complete"}${item.completedAt ? ` · ${formatRelative(item.completedAt, now).toLowerCase()}` : ""}`
                : `${item.status === "IN_REVIEW" ? "Under active review" : "Waiting for reviewer"}${item.submittedAt ? ` · sent ${formatRelative(item.submittedAt, now).toLowerCase()}` : ""}`}
            </p>
          </div>
        </div>
        <div className="hidden shrink-0 sm:block">
          <StatusBadge status={item.status} />
        </div>
      </Link>
      {item.status !== "REVIEW_COMPLETE" && item.status !== "DRAFT" && (
        <div className="mt-3 pl-13 max-sm:pl-0">
          <SubmissionSteps status={item.status} round={item.roundNumber} />
        </div>
      )}
    </div>
  );
}

/** 4-step enterprise review process explainer */
function HowItWorks() {
  const steps = [
    { title: "1. Upload & Target", desc: "Submit your creative, format, and target markets." },
    { title: "2. AI-Assisted Review", desc: "Clyntique verifies compliance against active policies." },
    { title: "3. Address Findings", desc: "Respond to any flagged issues or provide revision evidence." },
    { title: "4. Internal Sign-off", desc: "Receive your final internal review outcome decision." },
  ];

  return (
    <section aria-label="How Clyntique Review Works" className="rounded-xl border border-line bg-surface p-5 shadow-xs">
      <h2 className="text-micro font-semibold uppercase tracking-wider text-muted">
        Clyntique Review Lifecycle
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => (
          <div key={step.title} className="flex flex-col gap-1 border-t border-line/60 pt-2.5">
            <span className="text-caption font-semibold text-ink">{step.title}</span>
            <span className="text-micro text-muted leading-relaxed">{step.desc}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
