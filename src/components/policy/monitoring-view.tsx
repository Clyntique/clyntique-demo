"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { TonePill, type Tone } from "@/components/ui/status-badge";
import { SummaryStrip } from "@/components/ui/summary-strip";
import { cn } from "@/lib/cn";
import { CHANGE_KIND_LABEL, FETCH_OUTCOME_LABEL, MONITOR_STATUS_LABEL, PROPOSAL_STATUS_LABEL } from "@/lib/policy/labels";
import type { ChangeProposalView, CheckResult, MonitoringOverview, MonitoredSourceView, ProposalDecision, SourceMonitorStatus } from "@/lib/policy/monitoring/service";
import {
  checkSourceNowAction,
  reviewChangeProposalAction,
  runDueChecksAction,
  setSourceDiscontinuedAction,
  setSourceMonitoringAction,
} from "@/lib/policy/monitoring/actions";

/*
 * Policy source monitoring (Oct 31). Shows every official source with its
 * monitoring setting, last check and status; the human-review queue of
 * detected changes with a side-by-side diff and the rules each change may
 * affect; and the append-only history. Every button here either fetches a
 * page or records a human decision. None of them edits, verifies, approves
 * or retires a rule: that stays in the Policy Library's two-person workflow.
 */

const STATUS_TONE: Record<SourceMonitorStatus, Tone> = {
  DISCONTINUED: "neutral",
  NOT_MONITORED: "neutral",
  NEVER_CHECKED: "neutral",
  OK: "positive",
  CHANGE_PENDING: "attention",
  ACCESS_PROBLEM: "attention",
  LAST_CHECK_FAILED: "attention",
};

const KIND_TONE: Record<ChangeProposalView["kind"], Tone> = {
  CONTENT_CHANGED: "attention",
  REDIRECTED: "attention",
  NOT_FOUND: "attention",
  ACCESS_PROBLEM: "neutral",
};

function dateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function dateOnly(iso: string | null) {
  if (!iso) return "none stated";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function PolicyMonitoringView({ overview }: { overview: MonitoringOverview }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<CheckResult[] | null>(null);
  const admin = overview.isPolicyAdmin;

  const runDue = () => {
    setError(null);
    startTransition(async () => {
      const res = await runDueChecksAction();
      if (!res.ok) return setError(res.error ?? "The run failed.");
      setLastRun(res.results ?? []);
      const changes = (res.results ?? []).filter((r) => r.changed).length;
      setStatus(`${res.results?.length ?? 0} source${res.results?.length === 1 ? "" : "s"} checked · ${changes} change${changes === 1 ? "" : "s"} sent to review.`);
      router.refresh();
    });
  };

  return (
    <>
      <Breadcrumb trail={[{ label: "Policy Library", href: "/admin/policy-library" }]} current="Source monitoring" />
      <PageHeader
        eyebrow="Living rulebook"
        title="Policy source monitoring"
        description="Official policy pages are fetched, normalized and compared with the last saved snapshot. A meaningful difference opens a review task for a policy administrator. Nothing is approved, activated or rewritten automatically; rules change only through the two-person Policy Library workflow."
        action={
          <div className="flex items-center gap-2">
            <Link href="/admin/policy-library" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Policy Library
            </Link>
            {admin && (
              <Button size="sm" onClick={runDue} disabled={pending}>
                {pending ? "Checking…" : `Run due checks${overview.counts.dueNow ? ` (${overview.counts.dueNow})` : ""}`}
              </Button>
            )}
          </div>
        }
      />

      {!admin && (
        <p className="mb-4 rounded-md border border-line bg-subtle px-4 py-3 text-small text-ink-soft">
          You can read the monitoring status and the review queue. Running checks, changing monitoring settings and reviewing changes need Policy Administrator rights.
        </p>
      )}
      {status && (
        <div role="status" className="mb-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-small text-emerald-800">
          <span>{status}</span>
          <button type="button" onClick={() => setStatus(null)} className="text-caption font-semibold underline hover:opacity-80">
            Dismiss
          </button>
        </div>
      )}
      {error && <p className="mb-4 rounded-md border border-critical-line bg-critical-soft p-3 text-small text-critical-ink">{error}</p>}

      <div className="mb-8">
        <SummaryStrip
          label="Monitoring summary"
          items={[
            { label: "Monitored sources", value: overview.counts.monitored, note: `of ${overview.sources.length}` },
            { label: "Due for a check", value: overview.counts.dueNow, note: "interval elapsed" },
            { label: "Pending review", value: overview.counts.pending, note: "detected changes", tone: "attention" },
            { label: "Access problems", value: overview.counts.accessProblems, note: "repeated failures", tone: "attention" },
          ]}
        />
      </div>

      {lastRun && lastRun.length > 0 && (
        <Card className="mb-8 p-4">
          <h3 className="text-small font-semibold text-ink">Last run on this page</h3>
          <ul className="mt-2 divide-y divide-line text-small">
            {lastRun.map((r) => (
              <li key={r.sourceId} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-start sm:gap-3">
                <span className="shrink-0 font-medium text-ink">{r.sourceName}</span>
                <span className="shrink-0 text-muted">{FETCH_OUTCOME_LABEL[r.outcome]}</span>
                <span className="text-ink-soft">{r.summary}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="mb-10 flex flex-col gap-4">
        <SectionHeader title="Review queue" description={overview.pending.length ? `${overview.pending.length} detected change${overview.pending.length === 1 ? "" : "s"} waiting for a policy administrator` : "Detected changes appear here until a policy administrator records a decision."} />
        {overview.pending.length === 0 ? (
          <Card className="p-5">
            <p className="text-small text-muted">No change is waiting for review. Run a check, or wait for the next due check, to compare each source against its last snapshot.</p>
          </Card>
        ) : (
          overview.pending.map((p) => <ProposalCard key={p.id} proposal={p} admin={admin} onDone={(m) => { setStatus(m); router.refresh(); }} onError={setError} />)
        )}
      </section>

      <section className="mb-10 flex flex-col gap-4">
        <SectionHeader title="Sources" description="Monitoring setting, last check and status for every official source in the library." />
        {overview.sources.length === 0 ? (
          <Card className="p-5">
            <p className="text-small text-muted">No sources yet. Add official sources in the Policy Library first; they appear here with monitoring off.</p>
          </Card>
        ) : (
          <Card className="overflow-x-auto p-4">
            <table className="w-full border-collapse text-small">
              <thead>
                <tr className="text-caption text-left text-muted">
                  <th className="py-1 pr-3 font-medium">Source</th>
                  <th className="py-1 pr-3 font-medium">Status</th>
                  <th className="py-1 pr-3 font-medium">Monitoring</th>
                  <th className="py-1 pr-3 font-medium">Last checked</th>
                  <th className="py-1 pr-3 font-medium">Cited by</th>
                  <th className="py-1 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {overview.sources.map((s) => (
                  <SourceRow key={s.id} source={s} admin={admin} onDone={(m) => { setStatus(m); router.refresh(); }} onError={setError} />
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section className="mb-10 flex flex-col gap-4">
        <SectionHeader title="Reviewed changes" description="Decisions already recorded. Kept as history; never edited." />
        {overview.resolved.length === 0 ? (
          <Card className="p-5">
            <p className="text-small text-muted">No reviewed changes yet.</p>
          </Card>
        ) : (
          <Card className="divide-y divide-line p-0">
            {overview.resolved.map((p) => (
              <div key={p.id} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <TonePill tone="neutral">{PROPOSAL_STATUS_LABEL[p.status]}</TonePill>
                    <span className="text-small font-medium text-ink">{p.sourceName}</span>
                    <span className="text-caption text-muted">{CHANGE_KIND_LABEL[p.kind]}</span>
                  </div>
                  <p className="text-caption mt-0.5 text-muted">
                    Detected {dateTime(p.createdAt)} by {p.detectedByName} · reviewed {dateTime(p.resolvedAt)} by {p.resolvedByName}
                    {p.resultingVersion && (
                      <>
                        {" "}· linked to <span className="text-record">{p.resultingVersion.ruleCode}</span> v{p.resultingVersion.versionNumber}
                      </>
                    )}
                  </p>
                  {p.resolutionNote && <p className="text-small mt-1 text-ink-soft">{p.resolutionNote}</p>}
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeader title="Recent checks" description="Every fetch is kept as a snapshot, whatever its outcome. Unreachable or blocked is never treated as unchanged." />
        {overview.recentSnapshots.length === 0 ? (
          <Card className="p-5">
            <p className="text-small text-muted">No checks have run yet.</p>
          </Card>
        ) : (
          <Card className="overflow-x-auto p-4">
            <table className="w-full border-collapse text-small">
              <thead>
                <tr className="text-caption text-left text-muted">
                  <th className="py-1 pr-3 font-medium">When</th>
                  <th className="py-1 pr-3 font-medium">Source</th>
                  <th className="py-1 pr-3 font-medium">Outcome</th>
                  <th className="py-1 pr-3 font-medium">Stated date</th>
                  <th className="py-1 pr-3 font-medium">Hash</th>
                  <th className="py-1 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {overview.recentSnapshots.map((s) => (
                  <tr key={s.id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-3 whitespace-nowrap text-muted">{dateTime(s.fetchedAt)}</td>
                    <td className="py-1.5 pr-3 text-ink">{s.sourceName}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">
                      {FETCH_OUTCOME_LABEL[s.outcome]}
                      {s.httpStatus != null && <span className="text-muted"> · {s.httpStatus}</span>}
                      {s.errorMessage && <p className="text-caption text-muted">{s.errorMessage}</p>}
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap text-muted">{s.statedDate ? dateOnly(s.statedDate) : "—"}</td>
                    <td className="py-1.5 pr-3 font-mono text-micro text-muted">{s.contentHash ? s.contentHash.slice(0, 12) : "—"}</td>
                    <td className="py-1.5 whitespace-nowrap text-muted">{s.triggeredByName ?? "runner"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------

function SourceRow({ source: s, admin, onDone, onError }: { source: MonitoredSourceView; admin: boolean; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [hours, setHours] = useState(String(s.checkIntervalHours));
  const [discontinuing, setDiscontinuing] = useState(false);
  const [note, setNote] = useState("");

  const check = () =>
    startTransition(async () => {
      const res = await checkSourceNowAction(s.id);
      if (!res.ok || !res.result) return onError(res.error ?? "The check failed.");
      onDone(`${s.name}: ${FETCH_OUTCOME_LABEL[res.result.outcome]} · ${res.result.summary}`);
    });

  const toggle = (enabled: boolean) =>
    startTransition(async () => {
      const res = await setSourceMonitoringAction(s.id, { enabled, intervalHours: Number(hours) });
      if (!res.ok) return onError(res.error ?? "Monitoring could not be updated.");
      onDone(enabled ? `Monitoring on for ${s.name} (every ${hours} h).` : `Monitoring off for ${s.name}.`);
    });

  const discontinue = (discontinued: boolean) =>
    startTransition(async () => {
      const res = await setSourceDiscontinuedAction(s.id, { discontinued, note });
      if (!res.ok) return onError(res.error ?? "The source could not be updated.");
      setDiscontinuing(false);
      setNote("");
      onDone(discontinued ? `${s.name} marked discontinued; checks paused.` : `${s.name} reinstated.`);
    });

  return (
    <tr className="border-t border-line align-top">
      <td className="max-w-xs py-2 pr-3">
        <p className="font-medium text-ink">{s.name}</p>
        <p className="text-caption text-muted">
          {s.authorityName} · {s.jurisdictionCode} ·{" "}
          <a href={s.officialUrl} target="_blank" rel="noreferrer" className="hover:underline">
            {hostOf(s.officialUrl)}
          </a>
          {!s.officialDomain && <span className="text-attention-ink"> · not an official domain, manual checks only</span>}
        </p>
        {s.discontinuedNote && <p className="text-caption mt-0.5 text-muted">Discontinued: {s.discontinuedNote}</p>}
      </td>
      <td className="py-2 pr-3">
        <TonePill tone={STATUS_TONE[s.status]}>{MONITOR_STATUS_LABEL[s.status]}</TonePill>
        {s.consecutiveFailures > 0 && <p className="text-caption mt-1 text-muted">{s.consecutiveFailures} consecutive failure{s.consecutiveFailures === 1 ? "" : "s"}</p>}
        {s.openProposals > 0 && <p className="text-caption mt-1 text-muted">{s.openProposals} in review queue</p>}
      </td>
      <td className="py-2 pr-3">
        {s.discontinuedAt ? (
          <span className="text-caption text-muted">Paused</span>
        ) : admin ? (
          <div className="flex items-center gap-2">
            <Input type="number" min={1} max={720} value={hours} onChange={(e) => setHours(e.target.value)} className="w-20" aria-label={`Check interval in hours for ${s.name}`} />
            <span className="text-caption text-muted">h</span>
            <Button size="sm" variant={s.monitoringEnabled ? "secondary" : "primary"} disabled={pending || !s.officialDomain} onClick={() => toggle(!s.monitoringEnabled)}>
              {s.monitoringEnabled ? "Turn off" : "Turn on"}
            </Button>
            {s.monitoringEnabled && Number(hours) !== s.checkIntervalHours && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => toggle(true)}>
                Save
              </Button>
            )}
          </div>
        ) : (
          <span className="text-caption text-muted">{s.monitoringEnabled ? `Every ${s.checkIntervalHours} h` : "Off"}</span>
        )}
        {s.monitoringEnabled && !s.discontinuedAt && <p className="text-caption mt-1 text-muted">Next due {s.dueNow ? "now" : dateTime(s.nextDueAt)}</p>}
      </td>
      <td className="py-2 pr-3 whitespace-nowrap">
        <p className="text-ink">{dateTime(s.lastCheckedAt)}</p>
        <p className="text-caption text-muted">
          {s.lastCheckOutcome ? FETCH_OUTCOME_LABEL[s.lastCheckOutcome] : "—"}
          {s.lastStatedDate && ` · page dated ${dateOnly(s.lastStatedDate)}`}
        </p>
        <p className="text-caption text-muted">{s.snapshotCount} snapshot{s.snapshotCount === 1 ? "" : "s"}</p>
      </td>
      <td className="py-2 pr-3">
        {s.citedByRules.length === 0 ? (
          <span className="text-caption text-muted">No rule yet</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {s.citedByRules.map((r) => (
              <Badge key={r.ruleId} tone={r.currentStatus === "ACTIVE" ? "brand" : "outline"} title={`${r.title} · ${r.currentStatus}`}>
                {r.code}
              </Badge>
            ))}
          </div>
        )}
      </td>
      <td className="py-2">
        {admin && (
          <div className="flex flex-col items-start gap-1.5">
            {!s.discontinuedAt && (
              <Button size="sm" variant="secondary" disabled={pending || !s.officialDomain} onClick={check}>
                {pending ? "Working…" : "Check now"}
              </Button>
            )}
            {s.discontinuedAt ? (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => discontinue(false)}>
                Reinstate
              </Button>
            ) : discontinuing ? (
              <div className="flex w-56 flex-col gap-1.5">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why, and where the policy moved" className="min-h-14" />
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" disabled={pending || note.trim().length < 5} onClick={() => discontinue(true)}>
                    Confirm
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDiscontinuing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDiscontinuing(true)}>
                Mark discontinued
              </Button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------

function ProposalCard({ proposal: p, admin, onDone, onError }: { proposal: ChangeProposalView; admin: boolean; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [decision, setDecision] = useState<ProposalDecision>("NO_RULE_CHANGE");
  const [note, setNote] = useState("");
  const [showText, setShowText] = useState(false);
  const removed = p.diff.filter((d) => d.op === "removed");
  const added = p.diff.filter((d) => d.op === "added");

  const submit = () =>
    startTransition(async () => {
      const res = await reviewChangeProposalAction(p.id, { decision, note });
      if (!res.ok) return onError(res.error ?? "The review could not be saved.");
      onDone(`Review recorded for ${p.sourceName}: ${PROPOSAL_STATUS_LABEL[decision]}.`);
    });

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TonePill tone={KIND_TONE[p.kind]}>{CHANGE_KIND_LABEL[p.kind]}</TonePill>
            <h3 className="text-body font-semibold text-ink">{p.sourceName}</h3>
          </div>
          <p className="text-small mt-1 text-muted">
            Detected {dateTime(p.createdAt)} by {p.detectedByName} ·{" "}
            <a href={p.officialUrl} target="_blank" rel="noreferrer" className="hover:underline">
              {hostOf(p.officialUrl)}
            </a>
          </p>
        </div>
        <div className="text-caption text-muted">
          {p.previousSnapshot ? <>Previous snapshot {dateTime(p.previousSnapshot.fetchedAt)} · </> : null}
          New snapshot {dateTime(p.newSnapshot.fetchedAt)}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-subtle/60 p-3">
        <p className="text-caption font-semibold uppercase tracking-wide text-muted">Machine summary · not a legal reading</p>
        <p className="text-small mt-1 text-ink">{p.summary}</p>
        <dl className="text-caption mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-muted sm:grid-cols-2">
          <div>
            <dt className="inline font-medium">Before:</dt>{" "}
            <dd className="inline">
              {p.previousSnapshot ? `${dateOnly(p.previousSnapshot.statedDate)} · hash ${p.previousSnapshot.contentHash?.slice(0, 12) ?? "—"}` : "no earlier snapshot"}
            </dd>
          </div>
          <div>
            <dt className="inline font-medium">After:</dt>{" "}
            <dd className="inline">
              {p.newSnapshot.outcome === "OK" || p.newSnapshot.outcome === "REDIRECTED" ? `${dateOnly(p.newSnapshot.statedDate)} · hash ${p.newSnapshot.contentHash?.slice(0, 12) ?? "—"}` : `${FETCH_OUTCOME_LABEL[p.newSnapshot.outcome]}${p.newSnapshot.httpStatus ? ` (HTTP ${p.newSnapshot.httpStatus})` : ""}`}
              {p.newSnapshot.finalUrl && p.kind === "REDIRECTED" && (
                <>
                  {" "}· now at{" "}
                  <a href={p.newSnapshot.finalUrl} target="_blank" rel="noreferrer" className="hover:underline">
                    {p.newSnapshot.finalUrl}
                  </a>
                </>
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div>
        <p className="text-caption font-semibold uppercase tracking-wide text-muted">Rules that cite this source</p>
        {p.affectedRules.length === 0 ? (
          <p className="text-small mt-1 text-muted">No rule cites this source yet, so no rule is affected.</p>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-2">
            {p.affectedRules.map((r) => (
              <li key={r.code}>
                <Link href={`/admin/policy-library?rule=${encodeURIComponent(r.code)}`} className={cn(buttonClasses({ variant: "secondary", size: "sm" }), "h-auto py-1")}>
                  <span className="text-record">{r.code}</span>
                  <span className="text-muted">
                    {r.title} · {r.currentStatus === "ACTIVE" ? "active" : r.currentStatus.toLowerCase().replace("_", " ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(removed.length > 0 || added.length > 0) && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-line p-3">
            <p className="text-caption font-semibold text-critical-ink">Removed ({removed.length})</p>
            <ul className="mt-1.5 flex flex-col gap-1.5 text-small">
              {removed.map((d, i) => (
                <li key={i} className="rounded bg-critical-soft/60 px-2 py-1 text-ink-soft">
                  {d.section && <span className="text-caption block text-muted">{d.section}</span>}
                  {d.text}
                </li>
              ))}
              {removed.length === 0 && <li className="text-muted">Nothing removed.</li>}
            </ul>
          </div>
          <div className="rounded-lg border border-line p-3">
            <p className="text-caption font-semibold text-positive-ink">Added ({added.length})</p>
            <ul className="mt-1.5 flex flex-col gap-1.5 text-small">
              {added.map((d, i) => (
                <li key={i} className="rounded bg-positive-soft/60 px-2 py-1 text-ink-soft">
                  {d.section && <span className="text-caption block text-muted">{d.section}</span>}
                  {d.text}
                </li>
              ))}
              {added.length === 0 && <li className="text-muted">Nothing added.</li>}
            </ul>
          </div>
        </div>
      )}

      {(p.previousSnapshot?.text || p.newSnapshot.text) && (
        <div>
          <button type="button" onClick={() => setShowText((v) => !v)} className="text-caption font-semibold text-brand-700 hover:text-brand-900">
            {showText ? "Hide full text" : "Show full text of both snapshots"}
          </button>
          {showText && (
            <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-subtle/40 p-3 text-caption text-ink-soft">{p.previousSnapshot?.text ?? "(no earlier snapshot)"}</pre>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-subtle/40 p-3 text-caption text-ink-soft">{p.newSnapshot.text ?? "(no text)"}</pre>
            </div>
          )}
        </div>
      )}

      {admin ? (
        <form
          className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <p className="text-small font-semibold text-ink">Record your review</p>
          <p className="text-caption text-muted">
            Read the official page yourself. If a rule needs updating, propose a new version in the Policy Library as usual (one admin verifies, a different admin approves); record that here so the queue item closes.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Decision">
              <Select value={decision} onChange={(e) => setDecision(e.target.value as ProposalDecision)}>
                <option value="NO_RULE_CHANGE">{PROPOSAL_STATUS_LABEL.NO_RULE_CHANGE}</option>
                <option value="RULE_UPDATE_STARTED">{PROPOSAL_STATUS_LABEL.RULE_UPDATE_STARTED}</option>
                <option value="DISMISSED">{PROPOSAL_STATUS_LABEL.DISMISSED}</option>
              </Select>
            </Field>
          </div>
          <Field label="What you checked and why" hint="Kept in the history with your name and the time.">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20" />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending || note.trim().length < 5}>
              {pending ? "Saving…" : "Save review"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-caption text-muted">A policy administrator records the decision on this change.</p>
      )}
    </Card>
  );
}
