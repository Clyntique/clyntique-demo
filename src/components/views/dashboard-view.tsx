import Link from "next/link";
import type { Role } from "@/generated/prisma/enums";
import { requireRole, type CurrentUser } from "@/lib/auth/dal";
import { getClientOverview, getTeamOverview, type ClientItem } from "@/lib/data/overview";
import type { QueueItem } from "@/lib/data/review-queue";
import { getActivity } from "@/lib/data/workspace";
import { cn } from "@/lib/cn";
import { formatRelative, greetingFor, pluralize, requestTime } from "@/lib/format";
import { inReviewFindingsLabel } from "@/lib/workflow/findings";
import { REVIEW_OUTCOME_LABEL } from "@/lib/workflow/labels";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { PlusIcon } from "@/components/ui/icons";
import { ListGroup, ListRow, QuietLink } from "@/components/ui/list-group";
import { StatusBadge, TonePill } from "@/components/ui/status-badge";
import { ActivityList } from "@/components/workspace/activity-feed";
import { CreativeThumb } from "@/components/workspace/creative-card";

/*
 * Dashboards (Stage C). Each answers its viewer's questions in order, with
 * every count taken from the list beside it (src/lib/data/overview.ts):
 * TEAM: what needs review, what's in review, which clients owe changes, what
 * was completed. CLIENT: what needs me, what's with Clyntique, what's done.
 */

const DAY = 24 * 60 * 60 * 1000;

function Thumb({ item }: { item: Parameters<typeof CreativeThumb>[0]["creative"] }) {
  return <CreativeThumb creative={item} fill className="h-12 w-10 shrink-0 rounded-sm" />;
}

/** Round and age in the record style; waits over two days are marked. */
function Age({ round, since, now }: { round?: number; since: Date | null; now: number }) {
  const late = since !== null && now - since.getTime() > 2 * DAY;
  return (
    <span className={cn("text-record whitespace-nowrap", late ? "text-attention-ink" : "text-muted")}>
      {round ? `R${round} · ` : ""}
      {since ? formatRelative(since, now).replace(" ago", "") : "–"}
    </span>
  );
}

export async function DashboardView({ role }: { role: Role }) {
  const user = await requireRole(role);
  return role === "TEAM" ? <TeamDashboard user={user} /> : <ClientDashboard user={user} />;
}

// ---------------------------------------------------------------------------
// TEAM

async function TeamDashboard({ user }: { user: CurrentUser }) {
  const [overview, activity] = await Promise.all([getTeamOverview(user), getActivity(user, { take: 6 })]);
  const now = requestTime();
  const { needsReview, inReview, waitingOnClients, completed } = overview;
  const oldest = needsReview[0];

  const summary = oldest
    ? `${pluralize(needsReview.length, "submission")} ${needsReview.length === 1 ? "needs" : "need"} review. The oldest has waited ${formatRelative(oldest.submittedAt, now).replace(" ago", "").toLowerCase()}.`
    : inReview.length
      ? `Nothing new is waiting. ${pluralize(inReview.length, "review")} in progress.`
      : "Nothing is waiting for review.";

  return (
    <>
      <PageHeader
        size="lg"
        eyebrow="Team workspace"
        title={greetingFor()}
        description={summary}
        action={
          <>
            <Link href="/admin/projects/new" className={buttonClasses({ variant: "secondary" })}>
              <PlusIcon /> New project
            </Link>
            <Link href="/admin/review" className={buttonClasses({ variant: needsReview.length ? "primary" : "secondary" })}>
              Open review queue
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <ListGroup
            title="Needs review"
            count={needsReview.length}
            meta="Oldest first"
            action={needsReview.length > 5 ? <QuietLink href="/admin/review">All {needsReview.length}</QuietLink> : undefined}
            empty="New client submissions appear here as soon as they're submitted."
          >
            {needsReview.slice(0, 5).map((item, i) => (
              <QueueListRow key={item.id} item={item} now={now} next={i === 0} />
            ))}
          </ListGroup>

          <ListGroup title="In review" count={inReview.length} empty="No reviews in progress.">
            {inReview.map((item) => (
              <QueueListRow key={item.id} item={item} now={now} />
            ))}
          </ListGroup>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <ListGroup title="Waiting on clients" count={waitingOnClients.length} meta="Longest wait first" empty="No client owes changes right now.">
            {waitingOnClients.map((w) => (
              <ListRow
                key={w.id}
                href={`/admin/creatives/${w.id}`}
                thumb={<Thumb item={w} />}
                title={w.name}
                subtitle={`${w.clientName} · ${pluralize(w.sharedFindings, "finding")} shared`}
                aside={<Age round={w.roundNumber} since={w.requestedAt} now={now} />}
              />
            ))}
          </ListGroup>

          <ListGroup title="Completed this week" count={completed.length} empty="Completed reviews from the last 7 days appear here.">
            {completed.map((c) => (
              <ListRow
                key={`${c.id}-${c.completedAt.toISOString()}`}
                href={`/admin/creatives/${c.id}`}
                thumb={<Thumb item={c} />}
                title={c.name}
                subtitle={`${c.clientName} · ${c.outcome ? REVIEW_OUTCOME_LABEL[c.outcome] : "Completed"} · V${c.versionNumber} · ${formatRelative(c.completedAt, now).toLowerCase()}`}
              />
            ))}
          </ListGroup>

          <RecentActivity items={activity} href="/admin/activity" now={now} />
        </div>
      </div>
    </>
  );
}

function QueueListRow({ item, now, next = false }: { item: QueueItem; now: number; next?: boolean }) {
  const targets = [...item.markets, ...item.platforms];
  return (
    <ListRow
      href={`/admin/creatives/${item.id}`}
      thumb={<Thumb item={item} />}
      title={item.name}
      subtitle={
        item.status === "IN_REVIEW"
          ? `${item.clientName} · ${inReviewFindingsLabel(item.findingStatuses)}`
          : `${item.clientName} · ${targets.join(", ") || item.projectName}`
      }
      aside={
        <>
          {next && <TonePill tone="accent">Next</TonePill>}
          <Age round={item.roundNumber} since={item.submittedAt} now={now} />
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// CLIENT

async function ClientDashboard({ user }: { user: CurrentUser }) {
  const [overview, activity] = await Promise.all([getClientOverview(user), getActivity(user, { take: 5 })]);
  const now = requestTime();
  const { actionNeeded, withClyntique, done, earlierWork } = overview;
  const firstName = user.name.split(" ")[0];
  const changes = actionNeeded.filter((i) => i.status === "CHANGES_REQUESTED").length;

  const summary = changes
    ? `The Clyntique team needs something from you on ${pluralize(changes, "submission")}.`
    : actionNeeded.length
      ? "You have a draft that hasn't been submitted yet."
      : withClyntique.length
        ? `Nothing needs you right now. ${pluralize(withClyntique.length, "submission")} ${withClyntique.length === 1 ? "is" : "are"} with Clyntique.`
        : "Submit an ad and the Clyntique team will review it for the markets and platforms you choose.";

  return (
    <>
      <PageHeader
        size="lg"
        eyebrow="Client workspace"
        title={`Welcome back, ${firstName}`}
        description={summary}
        action={
          <Link href="/dashboard/submissions/new" className={buttonClasses()}>
            <PlusIcon /> New submission
          </Link>
        }
      />

      <HowItWorks />

      <div className="mt-6 flex flex-col gap-6">
        <ListGroup
          title="Your action needed"
          count={actionNeeded.length}
          tone={actionNeeded.length ? "attention" : "default"}
          empty="Nothing needs your attention. We'll show feedback here as soon as the team asks for changes."
        >
          {actionNeeded.map((item) => (
            <ClientRow key={item.id} item={item} now={now} />
          ))}
        </ListGroup>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ListGroup title="With Clyntique" count={withClyntique.length} empty="Submissions you send for review appear here.">
            {withClyntique.map((item) => (
              <ClientRow key={item.id} item={item} now={now} />
            ))}
          </ListGroup>
          <ListGroup
            title="Done"
            count={done.length}
            action={earlierWork ? <QuietLink href="/dashboard/creatives">{pluralize(earlierWork, "earlier creative")}</QuietLink> : undefined}
            empty="Completed reviews appear here, with the reviewer's outcome."
          >
            {done.map((item) => (
              <ClientRow key={item.id} item={item} now={now} />
            ))}
          </ListGroup>
        </div>

        <RecentActivity items={activity} href="/dashboard/activity" now={now} />
      </div>
    </>
  );
}

function ClientRow({ item, now }: { item: ClientItem; now: number }) {
  const href = `/dashboard/creatives/${item.id}`;
  const thumb = <Thumb item={item} />;
  switch (item.status) {
    case "CHANGES_REQUESTED":
      return (
        <ListRow
          href={href}
          thumb={thumb}
          title={item.name}
          subtitle={
            item.findingsToAnswer
              ? `The reviewer asked for changes: ${pluralize(item.findingsToAnswer, "finding")} to answer, then resubmit.`
              : "Every finding is answered. Resubmit when you're ready."
          }
          aside={<span className={buttonClasses({ size: "sm" })}>{item.findingsToAnswer ? "Respond" : "Resubmit"}</span>}
        />
      );
    case "DRAFT":
      return (
        <ListRow
          href={href}
          thumb={thumb}
          title={item.name}
          subtitle={`Draft in ${item.projectName} · not submitted yet`}
          aside={<span className={buttonClasses({ size: "sm", variant: "secondary" })}>Continue</span>}
        />
      );
    case "REVIEW_COMPLETE":
      return (
        <ListRow
          href={href}
          thumb={thumb}
          title={item.name}
          subtitle={`${item.outcome ? REVIEW_OUTCOME_LABEL[item.outcome] : "Review complete"}${item.completedAt ? ` · ${formatRelative(item.completedAt, now)}` : ""}`}

        />
      );
    default:
      return (
        <ListRow
          href={href}
          thumb={thumb}
          title={item.name}
          subtitle={`${item.status === "IN_REVIEW" ? "Being reviewed" : "Waiting for a reviewer"}${item.submittedAt ? ` · sent ${formatRelative(item.submittedAt, now).toLowerCase()}` : ""}`}
          aside={<StatusBadge status={item.status} />}
        />
      );
  }
}

/** The four steps in plain language, so a first-time client knows what happens next. */
function HowItWorks() {
  const steps = ["Submit your ad, with where it will run", "Clyntique reviews it", "Answer any findings and resubmit", "Get the review outcome"];
  return (
    <ol aria-label="How a review works" className="grid grid-cols-2 gap-x-6 gap-y-2 border-y border-line py-3 sm:grid-cols-4">
      {steps.map((s, i) => (
        <li key={s} className="text-small flex items-baseline gap-2 text-ink-soft">
          <span className="text-record text-muted">{i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}

function RecentActivity({ items, href, now }: { items: Awaited<ReturnType<typeof getActivity>>; href: string; now: number }) {
  return (
    <section aria-label="Recent activity" className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-small font-semibold text-ink">Recent activity</h2>
        <QuietLink href={href}>View all</QuietLink>
      </div>
      {items.length ? <ActivityList items={items} now={now} /> : <p className="text-small text-muted">No activity yet.</p>}
    </section>
  );
}
