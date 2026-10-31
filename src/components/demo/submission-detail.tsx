"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/states";
import { CheckCircleIcon, ChevronLeftIcon, LockIcon, RefreshCwIcon, ShieldIcon, SparklesIcon } from "@/components/ui/icons";
import { REQUIRED_ACTION_LABEL, REVIEW_DISCLAIMER, REVIEW_OUTCOME_LABEL, SEVERITY_LABEL } from "@/lib/workflow/labels";
import {
  DEMO_CLIENTS,
  DEMO_POLICIES,
  DEMO_PROJECTS,
  SIMULATED_AI_LABEL,
  SIMULATED_APPROVAL_LABEL,
  type DemoFinding,
  type DemoReviewOutcome,
  type DemoRole,
  type DemoSubmission,
} from "@/lib/demo/data";
import { demoHref } from "@/lib/demo/links";
import { canView, eventsFor, evidenceFor, findingsVisibleTo, policyByCode, scanFor } from "@/lib/demo/store";
import { formatDemoTime, useDemo } from "./demo-provider";
import { ConversationPanel, EvidencePanel, FindingsList, HistoryPanel, SimulatedTag, VersionHistory, VersionPreview } from "./submission-panels";

type Tab = "creative" | "findings" | "evidence" | "history" | "messages";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "creative", label: "Creative & versions" },
  { id: "findings", label: "Findings" },
  { id: "evidence", label: "Evidence" },
  { id: "history", label: "Review history" },
  { id: "messages", label: "Messages" },
];

export function SubmissionDetail({ role, id }: { role: DemoRole; id: string | null }) {
  const { state } = useDemo();
  const submission = state.submissions.find((s) => s.id === id);

  if (!canView(role, submission)) {
    return <NotInWorkspace role={role} />;
  }
  return <SubmissionWorkspace key={`${role}-${submission.id}`} role={role} submission={submission} />;
}

/** Shown when a client opens a record that belongs to another client. */
function NotInWorkspace({ role }: { role: DemoRole }) {
  const who = role === "team" ? "the team" : DEMO_CLIENTS[role].organization;
  return (
    <div className="flex flex-col gap-4">
      <Link href={demoHref(role, "submissions")} className="inline-flex items-center gap-1 text-caption font-medium text-brand-700 hover:text-brand-900">
        <ChevronLeftIcon className="size-3.5" /> Back to submissions
      </Link>
      <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-subtle text-ink-soft [&_svg]:size-6">
          <LockIcon />
        </span>
        <h1 className="text-xl font-semibold text-ink mt-4">This record isn&apos;t in your workspace</h1>
        <p className="text-small text-muted mt-2 max-w-md mx-auto">
          Client workspaces are isolated. {who === "the team" ? "The record does not exist." : `${who} can only open its own projects, submissions, evidence and messages. Switch to the other client or to Team in the header to see it.`}
        </p>
      </div>
    </div>
  );
}

function SubmissionWorkspace({ role, submission }: { role: DemoRole; submission: DemoSubmission }) {
  const { state } = useDemo();
  const [tab, setTab] = useState<Tab>("creative");
  const latest = submission.versions[submission.versions.length - 1].number;
  // A newly submitted version becomes the one on screen (derived during render, no effect).
  const [picked, setPicked] = useState<{ latest: number; version: number }>({ latest, version: latest });
  const version = picked.latest === latest ? picked.version : latest;
  const setVersion = (n: number) => setPicked({ latest, version: n });

  const findings = findingsVisibleTo(state, role, submission.id);
  const evidence = evidenceFor(state, role, submission.id);
  const events = eventsFor(state, role, submission.id);
  const project = DEMO_PROJECTS.find((p) => p.id === submission.projectId);
  const client = DEMO_CLIENTS[submission.clientId];
  const openCount = findings.filter((f) => f.status === "OPEN" || f.status === "RESPONDED").length;

  return (
    <div className="flex flex-col gap-6">
      <Link href={demoHref(role, role === "team" ? "queue" : "submissions")} className="inline-flex items-center gap-1 text-caption font-medium text-brand-700 hover:text-brand-900">
        <ChevronLeftIcon className="size-3.5" /> {role === "team" ? "Back to review queue" : "Back to submissions"}
      </Link>

      <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-card">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-caption text-muted">
              <span className="text-eyebrow font-semibold uppercase text-gold-700">{role === "team" ? client.organization : "My workspace"}</span>
              <span className="text-faint">·</span>
              <span>Project: {project?.name}</span>
            </div>
            <h1 className="font-heading mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl text-balance">{submission.title}</h1>
            <p className="text-small text-muted mt-1">
              {submission.platform} · {submission.format} · {submission.market}
              {role === "team" && ` · Submitted by ${client.contactName}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={submission.status} />
            {submission.outcome && <Badge tone="brand">{REVIEW_OUTCOME_LABEL[submission.outcome]}</Badge>}
            <Badge tone="outline">
              V{latest} current · {findings.length} finding{findings.length === 1 ? "" : "s"}
              {openCount ? ` · ${openCount} open` : ""}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-1 pt-4 mt-4 border-t border-line/60 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-lg px-3.5 py-2 text-small font-medium whitespace-nowrap transition-colors cursor-pointer",
                tab === t.id ? "bg-brand-50 text-brand-700 font-semibold border border-brand-200" : "text-muted hover:text-ink hover:bg-subtle border border-transparent",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "creative" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 flex flex-col gap-5">
            <VersionPreview submission={submission} versionNumber={version} onSelectVersion={setVersion} />
            {role !== "team" && submission.status !== "REVIEW_COMPLETE" && <RevisionForm submission={submission} />}
            {role === "team" && <TeamReviewActions submission={submission} versionNumber={version} findings={findings} />}
          </div>
          <div className="lg:col-span-5 flex flex-col gap-5">
            <VersionHistory submission={submission} activeVersion={version} onSelectVersion={setVersion} />
            {role === "team" && <SimulatedScanPanel submission={submission} versionNumber={version} onAccepted={() => setTab("findings")} />}
          </div>
        </div>
      )}

      {tab === "findings" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 flex flex-col gap-5">
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4 mb-5">
                <div className="flex items-center gap-2">
                  <ShieldIcon className="size-5 text-brand-600" />
                  <h2 className="text-body font-semibold text-ink">Compliance findings</h2>
                </div>
                <span className="text-caption text-muted">
                  {openCount} open · {findings.filter((f) => f.status === "RESOLVED").length} resolved
                  {role === "team" && ` · ${findings.filter((f) => f.status === "DRAFT").length} draft`}
                </span>
              </div>
              <FindingsList findings={findings} role={role} />
            </div>
            {role === "team" && submission.status !== "REVIEW_COMPLETE" && <RecordFindingForm submission={submission} versionNumber={latest} />}
          </div>
          <div className="lg:col-span-4 flex flex-col gap-5">
            <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-5 shadow-2xs">
              <div className="flex items-center gap-2 text-brand-800">
                <SparklesIcon className="size-4 text-brand-600" />
                <h3 className="text-small font-semibold">How findings are grounded</h3>
              </div>
              <p className="text-caption text-ink-soft mt-2 leading-relaxed">
                Each finding names the claim, where it appears, the policy version cited, why it matters and a suggested rewrite. AI suggestions become findings only when a reviewer accepts them.
              </p>
              <div className="mt-3 flex items-start gap-2 text-caption text-muted">
                <LockIcon className="size-4 text-brand-700 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">{REVIEW_DISCLAIMER}</p>
              </div>
            </div>
            {role === "team" && <TeamReviewActions submission={submission} versionNumber={latest} findings={findings} />}
          </div>
        </div>
      )}

      {tab === "evidence" && <EvidencePanel submission={submission} items={evidence} role={role} />}
      {tab === "history" && <HistoryPanel events={events} submission={submission} />}
      {tab === "messages" && <ConversationPanel clientId={submission.clientId} role={role} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Client: resubmit a revised version

function RevisionForm({ submission }: { submission: DemoSubmission }) {
  const { act } = useDemo();
  const latest = submission.versions[submission.versions.length - 1];
  const [headline, setHeadline] = useState(latest.headline);
  const [bodyCopy, setBodyCopy] = useState(latest.bodyCopy);
  const [disclosure, setDisclosure] = useState(latest.disclosure ?? "");
  const [changeNote, setChangeNote] = useState("");
  const [open, setOpen] = useState(submission.status === "CHANGES_REQUESTED");

  return (
    <div className="rounded-2xl border border-gold-300/80 bg-gold-50/50 p-5 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-gold-800 text-small font-semibold">
          <RefreshCwIcon className="size-4 text-gold-600" />
          <span>Submit a revised version</span>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Revise copy"}
        </Button>
      </div>
      <p className="text-caption text-gold-900 mt-1 leading-relaxed">
        {submission.status === "CHANGES_REQUESTED"
          ? "The reviewer requested changes. Edit the copy, say what changed, and resubmit as a new version."
          : "You can submit a revised version at any time before the review completes."}
      </p>
      {open && (
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            act({ type: "SUBMIT_REVISION", submissionId: submission.id, headline, bodyCopy, disclosure, changeNote });
            setChangeNote("");
            setOpen(false);
          }}
        >
          <Field label="Headline">
            <Input value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </Field>
          <Field label="Body copy">
            <Textarea value={bodyCopy} onChange={(e) => setBodyCopy(e.target.value)} className="min-h-20" />
          </Field>
          <Field label="Disclosure line" hint="Optional. Shown under the creative.">
            <Input value={disclosure} onChange={(e) => setDisclosure(e.target.value)} placeholder="e.g. Individual experience. Results vary." />
          </Field>
          <Field label="What changed">
            <Textarea value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="One or two lines for the reviewer." className="min-h-16" />
          </Field>
          <Button type="submit" className="self-end">
            Submit as version {latest.number + 1}
          </Button>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team: simulated AI scan

function SimulatedScanPanel({ submission, versionNumber, onAccepted }: { submission: DemoSubmission; versionNumber: number; onAccepted: () => void }) {
  const { state, act } = useDemo();
  const scan = scanFor(state, submission.id, versionNumber);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const t = window.setTimeout(() => {
      act({ type: "RUN_SIMULATED_SCAN", submissionId: submission.id, versionNumber });
      setRunning(false);
    }, 1100);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-5 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-brand-800">
          <SparklesIcon className="size-4 text-brand-600" />
          <h3 className="text-small font-semibold">AI pre-screen · version {versionNumber}</h3>
        </div>
        <Button size="sm" onClick={() => setRunning(true)} disabled={running}>
          {running ? "Scanning…" : scan ? "Run again" : "Run simulated scan"}
        </Button>
      </div>
      <SimulatedTag className="mt-2">{SIMULATED_AI_LABEL}</SimulatedTag>

      {running && (
        <div className="mt-4 rounded-xl border border-brand-200 bg-surface p-4 text-caption text-muted animate-pulse">
          Checking the creative against {DEMO_POLICIES.length} sample policies…
        </div>
      )}

      {!running && !scan && (
        <p className="text-caption text-ink-soft mt-3 leading-relaxed">
          In the real product the scan only runs against active, verified policies and abstains when coverage is missing. Here it replays a canned result for this version.
        </p>
      )}

      {!running && scan && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-caption text-ink-soft leading-relaxed">{scan.summary}</p>
          <p className="text-micro text-muted">
            {scan.policiesChecked} sample policies checked · {formatDemoTime(scan.ranAt)}
          </p>
          {scan.suggestions.length === 0 && <EmptyState title="No suggestions" description="A clean scan is not an approval. The reviewer still completes the review." />}
          {scan.suggestions.map((s) => {
            const policy = policyByCode(s.policyCode);
            const accepted = scan.accepted.includes(s.id);
            return (
              <div key={s.id} className="rounded-xl border border-brand-200 bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-caption">
                    <Badge tone="brand">{SEVERITY_LABEL[s.severity]}</Badge>
                    <span className="font-mono text-micro font-semibold text-muted">{s.policyCode}</span>
                    <span className="text-micro text-muted">confidence {Math.round(s.confidence * 100)}%</span>
                  </div>
                  {accepted ? (
                    <span className="inline-flex items-center gap-1 text-caption font-semibold text-positive-ink [&_svg]:size-3.5">
                      <CheckCircleIcon /> Accepted as draft finding
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        act({ type: "ACCEPT_SUGGESTION", submissionId: submission.id, versionNumber, suggestionId: s.id });
                        onAccepted();
                      }}
                    >
                      Accept as finding
                    </Button>
                  )}
                </div>
                <h4 className="text-small font-semibold text-ink mt-2">{s.issue}</h4>
                <p className="text-caption text-ink mt-1">
                  &ldquo;{s.claimText}&rdquo; <span className="text-muted">· {s.claimLocation}</span>
                </p>
                <p className="text-caption text-ink-soft mt-1.5 leading-relaxed">{s.explanation}</p>
                <p className="text-caption mt-1.5">
                  <span className="font-semibold text-ink-soft">Suggested wording:</span> {s.suggestedRevision}
                </p>
                {policy && (
                  <p className="text-micro text-muted mt-1.5">
                    Cites {policy.code} v{policy.versionNumber} · {policy.title} · {policy.section} · {REQUIRED_ACTION_LABEL[s.requiredAction]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team: record a finding by hand

function RecordFindingForm({ submission, versionNumber }: { submission: DemoSubmission; versionNumber: number }) {
  const { act } = useDemo();
  const [open, setOpen] = useState(false);
  const [policyCode, setPolicyCode] = useState(DEMO_POLICIES[0].code);
  const [severity, setSeverity] = useState<DemoFinding["severity"]>("MEDIUM");
  const [requiredAction, setRequiredAction] = useState<DemoFinding["requiredAction"]>("REVISE_CONTENT");
  const [issue, setIssue] = useState("");
  const [claimText, setClaimText] = useState("");
  const [claimLocation, setClaimLocation] = useState("");
  const [explanation, setExplanation] = useState("");
  const [suggestedRevision, setSuggestedRevision] = useState("");

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-small font-semibold text-ink">Record a finding by hand</h3>
          <p className="text-caption text-muted mt-0.5">Drafts stay team-only until you request changes.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "New finding"}
        </Button>
      </div>
      {open && (
        <form
          className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            act({ type: "RECORD_FINDING", submissionId: submission.id, versionNumber, policyCode, severity, requiredAction, issue, claimText, claimLocation, explanation, suggestedRevision });
            setIssue("");
            setClaimText("");
            setClaimLocation("");
            setExplanation("");
            setSuggestedRevision("");
            setOpen(false);
          }}
        >
          <div className="sm:col-span-2">
            <Field label="Issue">
              <Input value={issue} onChange={(e) => setIssue(e.target.value)} required placeholder="Short title of the problem" />
            </Field>
          </div>
          <Field label="Policy cited">
            <Select value={policyCode} onChange={(e) => setPolicyCode(e.target.value)}>
              {DEMO_POLICIES.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} · {p.title}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Severity">
              <Select value={severity} onChange={(e) => setSeverity(e.target.value as DemoFinding["severity"])}>
                {(["HIGH", "MEDIUM", "LOW", "ADVISORY"] as const).map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Action">
              <Select value={requiredAction} onChange={(e) => setRequiredAction(e.target.value as DemoFinding["requiredAction"])}>
                {(["REVISE_CONTENT", "PROVIDE_EVIDENCE", "CLARIFY", "ACKNOWLEDGE"] as const).map((a) => (
                  <option key={a} value={a}>
                    {REQUIRED_ACTION_LABEL[a]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Claim text">
            <Input value={claimText} onChange={(e) => setClaimText(e.target.value)} placeholder="The exact words" />
          </Field>
          <Field label="Where it appears">
            <Input value={claimLocation} onChange={(e) => setClaimLocation(e.target.value)} placeholder="e.g. Headline, frame 2" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Explanation">
              <Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} className="min-h-16" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Suggested wording">
              <Input value={suggestedRevision} onChange={(e) => setSuggestedRevision(e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" disabled={!issue.trim()}>
              Save draft finding
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team: request changes / complete review

function TeamReviewActions({ submission, findings }: { submission: DemoSubmission; versionNumber: number; findings: DemoFinding[] }) {
  const { act } = useDemo();
  const [note, setNote] = useState("");
  const [choice, setChoice] = useState<DemoReviewOutcome | null>(null);
  const drafts = findings.filter((f) => f.status === "DRAFT").length;
  const unresolved = findings.filter((f) => f.status === "OPEN" || f.status === "RESPONDED").length;
  const closed = submission.status === "REVIEW_COMPLETE";
  // The outcome follows the findings unless the reviewer picked a valid one.
  const suggested: DemoReviewOutcome = unresolved > 0 ? "COMPLETED_WITH_OPEN_ISSUES" : findings.some((f) => f.status === "RESOLVED") ? "ISSUES_RESOLVED" : "NO_ISSUES_IDENTIFIED";
  const outcome = choice && (choice === "COMPLETED_WITH_OPEN_ISSUES" || unresolved === 0) ? choice : suggested;

  if (closed) {
    return (
      <div className="rounded-2xl border border-positive-line bg-positive-soft/50 p-5">
        <p className="text-small font-semibold text-positive-ink flex items-center gap-2 [&_svg]:size-4">
          <CheckCircleIcon /> Review complete · {submission.outcome ? REVIEW_OUTCOME_LABEL[submission.outcome] : ""}
        </p>
        <SimulatedTag className="mt-2">{SIMULATED_APPROVAL_LABEL}</SimulatedTag>
        <p className="text-caption text-muted mt-2">{REVIEW_DISCLAIMER}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-2xs">
      <h3 className="text-small font-semibold text-ink">Review decision</h3>
      <p className="text-caption text-muted mt-0.5">
        {drafts} draft · {unresolved} open · status {submission.status.toLowerCase().replace("_", " ")}
      </p>
      {submission.status === "SUBMITTED" && (
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => act({ type: "START_REVIEW", submissionId: submission.id })}>
          Start review
        </Button>
      )}
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the history (optional)" className="mt-3 min-h-14" />
      <div className="mt-3 flex flex-col gap-2">
        <Button
          variant="secondary"
          disabled={drafts + unresolved === 0}
          onClick={() => {
            act({ type: "REQUEST_CHANGES", submissionId: submission.id, note });
            setNote("");
          }}
        >
          Request changes {drafts ? `· publish ${drafts} draft${drafts === 1 ? "" : "s"}` : ""}
        </Button>
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-subtle/40 p-3">
          <Field label="Outcome">
            <Select value={outcome} onChange={(e) => setChoice(e.target.value as DemoReviewOutcome)}>
              {(["NO_ISSUES_IDENTIFIED", "ISSUES_RESOLVED", "COMPLETED_WITH_OPEN_ISSUES"] as const).map((o) => (
                <option key={o} value={o} disabled={o !== "COMPLETED_WITH_OPEN_ISSUES" && unresolved > 0}>
                  {REVIEW_OUTCOME_LABEL[o]}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            onClick={() => {
              act({ type: "COMPLETE_REVIEW", submissionId: submission.id, outcome, note });
              setNote("");
            }}
          >
            <CheckCircleIcon /> Complete review
          </Button>
          <SimulatedTag className="self-start">{SIMULATED_APPROVAL_LABEL}</SimulatedTag>
        </div>
      </div>
      <p className="text-micro text-muted mt-3 leading-relaxed">{REVIEW_DISCLAIMER}</p>
    </div>
  );
}
