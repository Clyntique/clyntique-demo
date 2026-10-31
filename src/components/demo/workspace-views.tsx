"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow, QuietLink } from "@/components/ui/list-group";
import { StatusBadge } from "@/components/ui/status-badge";
import { SummaryStrip } from "@/components/ui/summary-strip";
import { Avatar } from "@/components/ui/avatar";
import { ActivityIcon, LockIcon, ShieldIcon } from "@/components/ui/icons";
import { REVIEW_DISCLAIMER } from "@/lib/workflow/labels";
import { DEMO_CLIENTS, DEMO_POLICIES, DEMO_PROJECTS, type DemoClientRole, type DemoRole, type DemoSubmission } from "@/lib/demo/data";
import { demoHref } from "@/lib/demo/links";
import { messagesFor, projectsFor, reviewQueue, submissionsFor } from "@/lib/demo/store";
import { ConversationPanel, SimulatedTag } from "./submission-panels";
import { formatDemoTime, useDemo } from "./demo-provider";

function SubmissionRow({ role, s, showClient }: { role: DemoRole; s: DemoSubmission; showClient?: boolean }) {
  const { state } = useDemo();
  const open = state.findings.filter((f) => f.submissionId === s.id && (f.status === "OPEN" || f.status === "RESPONDED")).length;
  const project = DEMO_PROJECTS.find((p) => p.id === s.projectId);
  return (
    <ListRow
      href={demoHref(role, "submission", s.id)}
      thumb={<Avatar name={showClient ? DEMO_CLIENTS[s.clientId].organization : s.title} />}
      title={s.title}
      subtitle={`${showClient ? `${DEMO_CLIENTS[s.clientId].organization} · ` : ""}${project?.name} · ${s.platform} · V${s.versions.length} · ${formatDemoTime(s.versions[s.versions.length - 1].submittedAt)}`}
      aside={
        <>
          {open > 0 && <Badge tone="outline" className="hidden sm:inline-flex">{open} open</Badge>}
          <StatusBadge status={s.status} />
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Client views

export function ClientOverview({ role }: { role: DemoClientRole }) {
  const { state } = useDemo();
  const client = DEMO_CLIENTS[role];
  const mine = submissionsFor(state, role);
  const needsAction = mine.filter((s) => s.status === "CHANGES_REQUESTED");
  const withTeam = mine.filter((s) => s.status === "SUBMITTED" || s.status === "IN_REVIEW");
  const complete = mine.filter((s) => s.status === "REVIEW_COMPLETE");
  const other: DemoClientRole = role === "client1" ? "client2" : "client1";
  const otherSubmission = state.submissions.find((s) => s.clientId === other);
  const messages = messagesFor(state, role);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="text-eyebrow font-semibold uppercase text-gold-700">Client workspace</span>
        <h1 className="font-heading mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Welcome back, {client.contactName.split(" ")[0]}</h1>
        <p className="text-small text-muted mt-1">
          {client.organization} · {client.industry} · {client.market}
        </p>
      </div>

      <SummaryStrip
        label="Submission summary"
        items={[
          { label: "Needs your action", value: needsAction.length, note: "changes requested", href: demoHref(role, "submissions"), tone: "attention" },
          { label: "With Clyntique", value: withTeam.length, note: "submitted or in review", href: demoHref(role, "submissions") },
          { label: "Review complete", value: complete.length, note: "internal review", href: demoHref(role, "submissions") },
          { label: "Messages", value: messages.length, note: "with your reviewer", href: demoHref(role, "messages") },
        ]}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="xl:col-span-2 flex flex-col gap-6">
          <ListGroup title="Needs your action" count={needsAction.length} tone={needsAction.length ? "attention" : "default"} empty="Nothing waiting on you." action={<QuietLink href={demoHref(role, "submissions")}>All submissions</QuietLink>}>
            {needsAction.map((s) => (
              <SubmissionRow key={s.id} role={role} s={s} />
            ))}
          </ListGroup>
          <ListGroup title="With Clyntique" count={withTeam.length} empty="No submissions in review.">
            {withTeam.map((s) => (
              <SubmissionRow key={s.id} role={role} s={s} />
            ))}
          </ListGroup>
          <ListGroup title="Review complete" count={complete.length} meta={REVIEW_DISCLAIMER} empty="No completed reviews yet.">
            {complete.map((s) => (
              <SubmissionRow key={s.id} role={role} s={s} />
            ))}
          </ListGroup>
        </div>

        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-2xs">
            <div className="flex items-center gap-2 text-ink">
              <LockIcon className="size-4 text-brand-600" />
              <h2 className="text-small font-semibold">Data isolation check</h2>
            </div>
            <p className="text-caption text-muted mt-2 leading-relaxed">
              {client.organization} sees {mine.length} submission{mine.length === 1 ? "" : "s"} and {projectsFor(role).length} projects. {DEMO_CLIENTS[other].organization} has its own workspace that is not visible from here.
            </p>
            {otherSubmission && (
              <Link href={demoHref(role, "submission", otherSubmission.id)} className="mt-3 inline-flex items-center gap-1.5 text-caption font-semibold text-brand-700 hover:text-brand-900">
                Try opening a {DEMO_CLIENTS[other].organization} record &rarr;
              </Link>
            )}
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-2xs">
            <div className="flex items-center gap-2 text-ink">
              <ActivityIcon className="size-4 text-brand-600" />
              <h2 className="text-small font-semibold">Latest message</h2>
            </div>
            {messages.length ? (
              <p className="text-caption text-ink-soft mt-2 leading-relaxed">
                <span className="font-semibold">{messages[messages.length - 1].from === "team" ? "Clyntique Reviewer" : "You"}:</span> {messages[messages.length - 1].body}
              </p>
            ) : (
              <p className="text-caption text-muted mt-2">No messages yet.</p>
            )}
            <Link href={demoHref(role, "messages")} className="mt-3 inline-block text-caption font-semibold text-brand-700 hover:text-brand-900">
              Open messages &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ClientProjects({ role }: { role: DemoClientRole }) {
  const { state } = useDemo();
  const projects = projectsFor(role);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">Projects</h1>
        <p className="text-small text-muted mt-1">Campaigns group the creatives you submit for review.</p>
      </div>
      {projects.map((p) => {
        const subs = submissionsFor(state, role).filter((s) => s.projectId === p.id);
        return (
          <ListGroup key={p.id} title={p.name} count={subs.length} meta={`${p.platforms.join(", ")} · created ${formatDemoTime(p.createdAt)}`} empty="No submissions in this project yet.">
            {subs.map((s) => (
              <SubmissionRow key={s.id} role={role} s={s} />
            ))}
          </ListGroup>
        );
      })}
    </div>
  );
}

export function SubmissionsList({ role }: { role: DemoRole }) {
  const { state } = useDemo();
  const subs = role === "team" ? reviewQueue(state) : submissionsFor(state, role);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">Submissions</h1>
        <p className="text-small text-muted mt-1">{role === "team" ? "Every creative from every client, newest activity first." : "Every creative you have sent for review, with its current status."}</p>
      </div>
      <ListGroup title="All submissions" count={subs.length} empty="No submissions.">
        {subs.map((s) => (
          <SubmissionRow key={s.id} role={role} s={s} showClient={role === "team"} />
        ))}
      </ListGroup>
    </div>
  );
}

export function ClientMessages({ role }: { role: DemoClientRole }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">Messages</h1>
        <p className="text-small text-muted mt-1">One conversation with your reviewer. Reviewers appear as &ldquo;Clyntique Reviewer&rdquo;.</p>
      </div>
      <ConversationPanel clientId={role} role={role} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team views

export function TeamQueue() {
  const { state } = useDemo();
  const queue = reviewQueue(state);
  const waiting = queue.filter((s) => s.status === "SUBMITTED");
  const inReview = queue.filter((s) => s.status === "IN_REVIEW");
  const withClient = queue.filter((s) => s.status === "CHANGES_REQUESTED");
  const done = queue.filter((s) => s.status === "REVIEW_COMPLETE");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="text-eyebrow font-semibold uppercase text-gold-700">Clyntique team</span>
        <h1 className="font-heading mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Review queue</h1>
        <p className="text-small text-muted mt-1">Both clients&apos; work in one queue. Open a submission to scan, record findings and decide.</p>
      </div>
      <SummaryStrip
        label="Queue summary"
        items={[
          { label: "Waiting for review", value: waiting.length, note: "submitted", tone: "attention" },
          { label: "In review", value: inReview.length, note: "opened by a reviewer" },
          { label: "With client", value: withClient.length, note: "changes requested" },
          { label: "Complete", value: done.length, note: "internal review" },
        ]}
      />
      <ListGroup title="Waiting for review" count={waiting.length} tone={waiting.length ? "attention" : "default"} empty="Nothing waiting.">
        {waiting.map((s) => (
          <SubmissionRow key={s.id} role="team" s={s} showClient />
        ))}
      </ListGroup>
      <ListGroup title="In review" count={inReview.length} empty="Nothing in review.">
        {inReview.map((s) => (
          <SubmissionRow key={s.id} role="team" s={s} showClient />
        ))}
      </ListGroup>
      <ListGroup title="With client" count={withClient.length} empty="No changes outstanding.">
        {withClient.map((s) => (
          <SubmissionRow key={s.id} role="team" s={s} showClient />
        ))}
      </ListGroup>
      <ListGroup title="Complete" count={done.length} meta={REVIEW_DISCLAIMER} empty="No completed reviews.">
        {done.map((s) => (
          <SubmissionRow key={s.id} role="team" s={s} showClient />
        ))}
      </ListGroup>
    </div>
  );
}

export function TeamMessages({ selected }: { selected: string | null }) {
  const { state } = useDemo();
  const clientIds: DemoClientRole[] = ["client1", "client2"];
  const active: DemoClientRole = selected === "client2" ? "client2" : "client1";
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">Messages</h1>
        <p className="text-small text-muted mt-1">One conversation per client. The team sees client names; clients see &ldquo;Clyntique Reviewer&rdquo;.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <ul className="lg:col-span-4 rounded-2xl border border-line bg-surface divide-y divide-line overflow-hidden">
          {clientIds.map((id) => {
            const msgs = messagesFor(state, id);
            const last = msgs[msgs.length - 1];
            return (
              <li key={id}>
                <Link href={demoHref("team", "messages", id)} className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${active === id ? "bg-brand-50" : "hover:bg-canvas"}`}>
                  <Avatar name={DEMO_CLIENTS[id].contactName} />
                  <div className="min-w-0 flex-1">
                    <p className="text-small font-semibold text-ink truncate">{DEMO_CLIENTS[id].contactName}</p>
                    <p className="text-caption text-muted truncate">{DEMO_CLIENTS[id].organization}</p>
                    {last && <p className="text-caption text-ink-soft truncate mt-0.5">{last.body}</p>}
                  </div>
                  <Badge tone="outline">{msgs.length}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="lg:col-span-8">
          <ConversationPanel key={active} clientId={active} role="team" />
        </div>
      </div>
    </div>
  );
}

export function TeamPolicies() {
  const { state } = useDemo();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">Policy library</h1>
        <p className="text-small text-muted mt-1">Sample policies written for this demo. In the product, rules are entered, verified and approved by two different named admins before they go live.</p>
        <SimulatedTag className="mt-2">Sample policies · not verified rules</SimulatedTag>
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DEMO_POLICIES.map((p) => {
          const uses = state.findings.filter((f) => f.policyCode === p.code).length;
          return (
            <li key={p.code} className="rounded-2xl border border-line bg-surface p-5 shadow-2xs">
              <div className="flex flex-wrap items-center gap-2">
                <ShieldIcon className="size-4 text-brand-600" />
                <span className="font-mono text-micro font-semibold text-muted">{p.code}</span>
                <Badge tone="brand">v{p.versionNumber} · sample</Badge>
                <span className="text-micro text-muted ml-auto">{uses} finding{uses === 1 ? "" : "s"}</span>
              </div>
              <h2 className="text-small font-semibold text-ink mt-2">{p.title}</h2>
              <p className="text-caption text-muted mt-0.5">
                {p.authority} · {p.jurisdiction}
                {p.platform ? ` · ${p.platform}` : ""} · {p.section}
              </p>
              <p className="text-caption text-ink-soft mt-3 leading-relaxed">{p.summary}</p>
              <p className="text-caption text-muted mt-2 leading-relaxed">{p.explanation}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
