"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/states";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { FindingStatusPill, SeverityMarker } from "@/components/ui/severity";
import { CheckCircleIcon, FileTextIcon, PaperclipIcon, SendIcon, SparklesIcon, UploadIcon } from "@/components/ui/icons";
import { REQUIRED_ACTION_LABEL, REVIEW_DISCLAIMER, REVIEW_OUTCOME_LABEL } from "@/lib/workflow/labels";
import { DEMO_CLIENTS, type DemoClientRole, type DemoEvent, type DemoEvidence, type DemoFinding, type DemoRole, type DemoSubmission } from "@/lib/demo/data";
import { counterpartName, messagesFor, policyByCode } from "@/lib/demo/store";
import { formatDemoTime, useDemo } from "./demo-provider";

export function SimulatedTag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm border border-dashed border-gold-500/70 bg-gold-50 px-1.5 py-0.5 text-micro font-semibold text-gold-900 [&_svg]:size-3", className)}>
      <SparklesIcon />
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Creative preview + version switcher

export function VersionPreview({ submission, versionNumber, onSelectVersion }: { submission: DemoSubmission; versionNumber: number; onSelectVersion: (n: number) => void }) {
  const version = submission.versions.find((v) => v.number === versionNumber) ?? submission.versions[submission.versions.length - 1];
  const isCurrent = version.number === submission.versions[submission.versions.length - 1].number;
  return (
    <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 sm:px-5 py-3 bg-subtle/40">
        <div className="flex items-center gap-2 min-w-0">
          <FileTextIcon className="size-4 text-muted shrink-0" />
          <span className="text-small font-semibold text-ink truncate">{version.fileName}</span>
          <Badge tone="brand">V{version.number}</Badge>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
          {submission.versions.map((v) => (
            <button
              key={v.number}
              type="button"
              onClick={() => onSelectVersion(v.number)}
              className={cn(
                "px-2.5 py-0.5 rounded text-caption font-medium transition-colors cursor-pointer",
                v.number === version.number ? "bg-brand-100 text-brand-800 font-semibold" : "text-muted hover:text-ink",
              )}
            >
              V{v.number}
            </button>
          ))}
        </div>
      </div>

      <div className="relative aspect-[4/3] sm:aspect-video w-full bg-[#0F172A] flex items-center justify-center p-6 text-white text-center">
        <div className="flex flex-col items-center max-w-md">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-gold-400">{submission.platform} · {submission.format}</span>
          <h3 className="text-xl sm:text-2xl font-bold mt-2 text-white text-balance">&ldquo;{version.headline}&rdquo;</h3>
          <p className="text-small text-slate-300 mt-3 text-balance">{version.bodyCopy}</p>
          {version.disclosure && (
            <p className="mt-4 rounded bg-white/10 px-2 py-1 text-[11px] text-slate-200">{version.disclosure}</p>
          )}
        </div>
        <div className={cn("absolute top-3 left-3 text-white text-[11px] font-bold px-2.5 py-1 rounded shadow-sm", isCurrent ? "bg-brand-600/90" : "bg-amber-500/90")}>
          {isCurrent ? "Current version" : "Superseded"}
        </div>
        <span className="absolute bottom-3 right-3 text-[10px] uppercase tracking-wider text-white/50">Simulated preview</span>
      </div>

      <div className="px-4 sm:px-5 py-3 border-t border-line/60 flex flex-wrap items-center justify-between gap-2 text-caption text-muted">
        <span>{submission.market} · {submission.platform}</span>
        <span>Submitted {formatDemoTime(version.submittedAt)}</span>
      </div>
    </div>
  );
}

export function VersionHistory({ submission, activeVersion, onSelectVersion }: { submission: DemoSubmission; activeVersion: number; onSelectVersion: (n: number) => void }) {
  const latest = submission.versions[submission.versions.length - 1].number;
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-2xs">
      <h3 className="text-body font-semibold text-ink">Version history</h3>
      <p className="text-caption text-muted mt-1">Every revision is kept. Findings stay attached to the version they were raised on.</p>
      <ol className="mt-4 flex flex-col gap-3">
        {[...submission.versions].reverse().map((v) => (
          <li key={v.number}>
            <button
              type="button"
              onClick={() => onSelectVersion(v.number)}
              className={cn(
                "w-full text-left rounded-xl border p-3.5 transition-colors cursor-pointer",
                v.number === activeVersion ? "border-brand-300 bg-brand-50/50" : "border-line bg-subtle/40 hover:bg-subtle",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-small font-semibold text-ink">Version {v.number}</span>
                <Badge tone={v.number === latest ? "brand" : "outline"}>{v.number === latest ? "Current" : "Superseded"}</Badge>
              </div>
              <p className="text-caption text-muted mt-1 leading-relaxed">{v.changeNote}</p>
              <p className="text-micro text-faint mt-1">{formatDemoTime(v.submittedAt)}</p>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Findings

export function FindingCard({ finding, role }: { finding: DemoFinding; role: DemoRole }) {
  const { act } = useDemo();
  const policy = policyByCode(finding.policyCode);
  const [response, setResponse] = useState("");
  const canRespond = role !== "team" && finding.status === "OPEN";
  const canResolve = role === "team" && (finding.status === "OPEN" || finding.status === "RESPONDED");

  return (
    <article className={cn("rounded-xl border p-4", finding.status === "RESOLVED" ? "border-positive-line bg-positive-soft/40" : finding.status === "DRAFT" ? "border-dashed border-line-strong bg-subtle/40" : "border-attention-line bg-attention-soft/40")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityMarker severity={finding.severity} />
          <FindingStatusPill status={finding.status} />
          <span className="font-mono text-micro font-semibold text-muted">{finding.policyCode}</span>
          {finding.aiSuggested && <SimulatedTag>Suggested by simulated AI · accepted by reviewer</SimulatedTag>}
        </div>
        <span className="text-micro text-muted">V{finding.versionNumber} · {formatDemoTime(finding.createdAt)}</span>
      </div>

      <h4 className="text-small font-semibold text-ink mt-2.5">{finding.issue}</h4>

      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-caption">
        <div>
          <dt className="font-semibold text-ink-soft">Claim</dt>
          <dd className="text-ink mt-0.5">&ldquo;{finding.claimText}&rdquo;</dd>
          <dd className="text-muted">{finding.claimLocation}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-soft">Required action</dt>
          <dd className="text-ink mt-0.5">{REQUIRED_ACTION_LABEL[finding.requiredAction]}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-semibold text-ink-soft">Explanation</dt>
          <dd className="text-ink-soft mt-0.5 leading-relaxed">{finding.explanation}</dd>
        </div>
        <div className="sm:col-span-2 rounded-lg bg-surface border border-line/70 p-2.5">
          <dt className="font-semibold text-ink text-[11px]">Suggested wording</dt>
          <dd className="text-ink-soft mt-0.5">{finding.suggestedRevision}</dd>
        </div>
        {policy && (
          <div className="sm:col-span-2 rounded-lg bg-brand-50/60 border border-brand-100 p-2.5">
            <dt className="font-semibold text-brand-800 text-[11px]">Policy cited</dt>
            <dd className="text-ink mt-0.5">
              {policy.code} v{policy.versionNumber} — {policy.title}
            </dd>
            <dd className="text-muted">{policy.authority} · {policy.jurisdiction}{policy.platform ? ` · ${policy.platform}` : ""} · {policy.section}</dd>
            <dd className="text-ink-soft mt-1">{policy.summary}</dd>
          </div>
        )}
        {finding.clientResponse && (
          <div className="sm:col-span-2">
            <dt className="font-semibold text-ink-soft">Client response</dt>
            <dd className="text-ink mt-0.5">&ldquo;{finding.clientResponse}&rdquo;</dd>
          </div>
        )}
      </dl>

      {canRespond && (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act({ type: "RESPOND_TO_FINDING", findingId: finding.id, response });
            setResponse("");
          }}
        >
          <Textarea value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Tell the reviewer how you addressed this, or ask a question…" className="min-h-16" />
          <Button type="submit" size="sm" className="self-end" disabled={!response.trim()}>
            Send response
          </Button>
        </form>
      )}
      {canResolve && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="secondary" onClick={() => act({ type: "RESOLVE_FINDING", findingId: finding.id })}>
            <CheckCircleIcon /> Mark resolved
          </Button>
        </div>
      )}
    </article>
  );
}

export function FindingsList({ findings, role }: { findings: DemoFinding[]; role: DemoRole }) {
  if (findings.length === 0) {
    return <EmptyState title="No findings yet" description={role === "team" ? "Run the simulated AI scan or record a finding by hand." : "The reviewer has not published any findings on this submission."} />;
  }
  return (
    <div className="flex flex-col gap-4">
      {findings.map((f) => (
        <FindingCard key={f.id} finding={f} role={role} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence

const EVIDENCE_KINDS = ["Clinical reference", "Service description", "Certification", "Disclosure copy", "Reviewer note", "Other"];

export function EvidencePanel({ submission, items, role }: { submission: DemoSubmission; items: DemoEvidence[]; role: DemoRole }) {
  const { act } = useDemo();
  const [name, setName] = useState("");
  const [kind, setKind] = useState(role === "team" ? "Reviewer note" : EVIDENCE_KINDS[0]);
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState(false);
  const uploadedBy = role === "team" ? "team" : "client";
  const closed = submission.status === "REVIEW_COMPLETE";

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4 mb-4">
        <div>
          <h2 className="text-body font-semibold text-ink">Evidence</h2>
          <p className="text-caption text-muted mt-0.5">Two-sided: the client substantiates claims, the reviewer records what was checked.</p>
        </div>
        {!closed && (
          <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
            <UploadIcon /> {open ? "Cancel" : "Add evidence"}
          </Button>
        )}
      </div>

      {open && !closed && (
        <form
          className="mb-5 rounded-xl border border-dashed border-line-strong bg-subtle/40 p-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            act({ type: "ADD_EVIDENCE", submissionId: submission.id, name, kind, description, uploadedBy });
            setName("");
            setDescription("");
            setOpen(false);
          }}
        >
          <SimulatedTag className="self-start">Simulated upload · no file is stored</SimulatedTag>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="File name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Effectiveness-summary.pdf" required />
            </Field>
            <Field label="Type">
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                {EVIDENCE_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="What it shows">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line on what this document supports." className="min-h-16" />
          </Field>
          <Button type="submit" size="sm" className="self-end" disabled={!name.trim()}>
            Attach to version {submission.versions[submission.versions.length - 1].number}
          </Button>
        </form>
      )}

      {items.length === 0 ? (
        <EmptyState title="No evidence attached" description="Documents attached here stay bound to the creative version they support." icon={<PaperclipIcon />} />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((e) => (
            <li key={e.id} className="rounded-xl border border-line p-4 bg-subtle/30 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-brand-50 border border-brand-100 text-brand-700 [&_svg]:size-4">
                    {e.uploadedBy === "team" ? <FileTextIcon /> : <PaperclipIcon />}
                  </div>
                  {e.reviewed ? (
                    <Badge tone="brand">Reviewed</Badge>
                  ) : role === "team" ? (
                    <Button size="sm" variant="ghost" onClick={() => act({ type: "MARK_EVIDENCE_REVIEWED", evidenceId: e.id })}>
                      Mark reviewed
                    </Button>
                  ) : (
                    <Badge tone="outline">Awaiting review</Badge>
                  )}
                </div>
                <h3 className="text-small font-semibold text-ink mt-3 break-all">{e.name}</h3>
                <p className="text-caption text-muted mt-1 leading-relaxed">{e.description}</p>
              </div>
              <div className="mt-3 pt-3 border-t border-line/60 flex flex-wrap items-center justify-between gap-1 text-micro text-muted">
                <span>{e.kind} · V{e.versionNumber}</span>
                <span>
                  {e.uploadedBy === "team" ? (role === "team" ? "Reviewer" : "Clyntique Reviewer") : DEMO_CLIENTS[submission.clientId].contactName} · {formatDemoTime(e.uploadedAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review history

const ACTOR_STYLE: Record<DemoEvent["actor"], string> = {
  client: "bg-emerald-600",
  team: "bg-brand-600",
  system: "bg-gold-500",
};

export function HistoryPanel({ events, submission }: { events: DemoEvent[]; submission: DemoSubmission }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="border-b border-line pb-4 mb-5">
        <h2 className="text-body font-semibold text-ink">Review history</h2>
        <p className="text-caption text-muted mt-0.5">Every step is timestamped. {REVIEW_DISCLAIMER}</p>
        {submission.outcome && (
          <p className="mt-2 inline-flex flex-wrap items-center gap-2 text-caption">
            <StatusBadge status="REVIEW_COMPLETE" label={`Review complete · ${REVIEW_OUTCOME_LABEL[submission.outcome]}`} />
            <SimulatedTag>Simulated approval · not platform or regulatory approval</SimulatedTag>
          </p>
        )}
      </div>
      <ol className="relative border-l-2 border-line ml-3 space-y-5">
        {events.map((e) => (
          <li key={e.id} className="ml-6">
            <span className={cn("absolute -left-[9px] mt-1 size-4 rounded-full ring-4 ring-surface", ACTOR_STYLE[e.actor])} aria-hidden />
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
              <h4 className="text-small font-semibold text-ink">{e.title}</h4>
              <span className="text-micro font-mono text-muted">{formatDemoTime(e.at)}</span>
            </div>
            <p className="text-caption text-muted mt-0.5 leading-relaxed">{e.detail}</p>
            {e.simulated && <SimulatedTag className="mt-1">Simulated</SimulatedTag>}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messages

export function ConversationPanel({ clientId, role, compact }: { clientId: DemoClientRole; role: DemoRole; compact?: boolean }) {
  const { state, act } = useDemo();
  const [draft, setDraft] = useState("");
  const messages = messagesFor(state, clientId);
  const me = role === "team" ? "team" : "client";
  const other = counterpartName(role, clientId);
  const client = DEMO_CLIENTS[clientId];

  return (
    <div className={cn("rounded-2xl border border-line bg-surface shadow-card flex flex-col", compact ? "" : "min-h-[28rem]")}>
      <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <Avatar name={other} />
        <div className="min-w-0">
          <p className="text-small font-semibold text-ink truncate">{other}</p>
          <p className="text-caption text-muted truncate">{role === "team" ? client.organization : "Replies from the Clyntique review team"}</p>
        </div>
      </div>
      <ul className="flex-1 flex flex-col gap-3 px-5 py-4 overflow-y-auto max-h-[24rem]">
        {messages.map((m) => {
          const mine = m.from === me;
          return (
            <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2.5 text-small leading-relaxed", mine ? "bg-brand-600 text-white rounded-br-sm" : "bg-subtle text-ink rounded-bl-sm")}>
                <p className={cn("text-micro font-semibold mb-0.5", mine ? "text-white/70" : "text-muted")}>
                  {mine ? "You" : other} · {formatDemoTime(m.at)}
                </p>
                <p>{m.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <form
        className="border-t border-line px-4 py-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          act({ type: "SEND_MESSAGE", clientId, from: me, body: draft });
          setDraft("");
        }}
      >
        <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Message ${other}…`} className="min-h-10 h-10 flex-1" rows={1} aria-label="Message" />
        <Button type="submit" size="md" disabled={!draft.trim()} aria-label="Send message">
          <SendIcon /> Send
        </Button>
      </form>
    </div>
  );
}
