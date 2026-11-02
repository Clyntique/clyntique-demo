"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { StatusBadge, TonePill, type Tone } from "@/components/ui/status-badge";
import { SummaryStrip } from "@/components/ui/summary-strip";
import { EmptyState } from "@/components/ui/states";
import { AwardIcon, BookOpenIcon, CheckCircleIcon, ChevronLeftIcon, ClipboardCheckIcon, FileTextIcon, LockIcon, PaperclipIcon, SearchIcon, ShieldIcon } from "@/components/ui/icons";
import {
  DEMO_CLIENTS,
  EVIDENCE_RECORD_STATUS_LABEL,
  EVIDENCE_RECORD_TYPE_LABEL,
  type DemoEvidenceRecord,
  type DemoEvidenceRecordStatus,
  type DemoEvidenceRecordType,
  type DemoRole,
} from "@/lib/demo/data";
import { demoHref } from "@/lib/demo/links";
import { attachableRecords, canViewRecord, evidenceRecordsFor, filterEvidenceRecords, recordUsage, submissionsFor } from "@/lib/demo/store";
import { formatDemoTime, useDemo } from "./demo-provider";
import { SimulatedTag } from "./submission-panels";

/*
 * Evidence Dictionary: the reusable substantiation records of one workspace.
 * Browse, search and filter; open a record to see what it supports, which
 * creatives use it, attach it to a creative, or (team) record a verification
 * decision. A client sees only its own records; the team sees every client's
 * records and its own internal references. Demo-only definition, see
 * docs/demo/passport-and-evidence-dictionary.md.
 */

const STATUS_TONE: Record<DemoEvidenceRecordStatus, Tone> = {
  VERIFIED: "positive",
  UNDER_REVIEW: "accent",
  UNVERIFIED: "attention",
  NEEDS_MORE_INFO: "attention",
};

const TYPES: DemoEvidenceRecordType[] = ["CLINICAL_STUDY", "CERTIFICATION", "REGULATORY_DOCUMENT", "CLAIM_SUBSTANTIATION", "OTHER"];
const STATUSES: DemoEvidenceRecordStatus[] = ["VERIFIED", "UNDER_REVIEW", "UNVERIFIED", "NEEDS_MORE_INFO"];

export const FICTIONAL_EVIDENCE_LABEL = "Fictional records · no real study, licence or document · nothing is uploaded";

function TypeIcon({ type }: { type: DemoEvidenceRecordType }) {
  if (type === "CERTIFICATION") return <AwardIcon />;
  if (type === "REGULATORY_DOCUMENT") return <ShieldIcon />;
  if (type === "CLINICAL_STUDY") return <FileTextIcon />;
  if (type === "CLAIM_SUBSTANTIATION") return <ClipboardCheckIcon />;
  return <PaperclipIcon />;
}

function ownerLabel(role: DemoRole, record: DemoEvidenceRecord): string {
  if (record.ownerId === "team") return "Team reference";
  return role === "team" ? DEMO_CLIENTS[record.ownerId].organization : "My workspace";
}

export function EvidenceDictionary({ role, id }: { role: DemoRole; id: string | null }) {
  const { state } = useDemo();
  if (id) {
    const record = state.records.find((r) => r.id === id);
    if (!canViewRecord(role, record)) return <NotInWorkspace role={role} />;
    return <RecordDetail key={`${role}-${record.id}`} role={role} record={record} />;
  }
  return <RecordList role={role} />;
}

function NotInWorkspace({ role }: { role: DemoRole }) {
  const who = role === "team" ? "the team" : DEMO_CLIENTS[role].organization;
  return (
    <div className="flex flex-col gap-4">
      <Link href={demoHref(role, "evidence")} className="inline-flex items-center gap-1 text-caption font-medium text-brand-700 hover:text-brand-900">
        <ChevronLeftIcon className="size-3.5" /> Back to the evidence dictionary
      </Link>
      <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-subtle text-ink-soft [&_svg]:size-6">
          <LockIcon />
        </span>
        <h1 className="text-xl font-semibold text-ink mt-4">This evidence record isn&apos;t in your workspace</h1>
        <p className="text-small text-muted mt-2 max-w-md mx-auto">
          {who === "the team" ? "The record does not exist." : `Evidence records belong to the client that supplied them. ${who} cannot read another client's substantiation.`}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List

function RecordList({ role }: { role: DemoRole }) {
  const { state } = useDemo();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<DemoEvidenceRecordType | "ALL">("ALL");
  const [status, setStatus] = useState<DemoEvidenceRecordStatus | "ALL">("ALL");
  const [adding, setAdding] = useState(false);
  const all = evidenceRecordsFor(state, role);
  const shown = filterEvidenceRecords(all, { query, type, status });
  const usedIds = new Set(state.evidence.map((e) => e.recordId));
  const counts = {
    total: all.length,
    verified: all.filter((r) => r.status === "VERIFIED").length,
    awaiting: all.filter((r) => r.status !== "VERIFIED").length,
    used: all.filter((r) => usedIds.has(r.id)).length,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <span className="text-eyebrow font-semibold uppercase text-gold-700">{role === "team" ? "Clyntique team" : "Client workspace"}</span>
          <h1 className="font-heading mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">Evidence dictionary</h1>
          <p className="text-small text-muted mt-1 max-w-2xl">
            {role === "team"
              ? "Every client's substantiation records, plus the team's internal references. Check a record once and every creative that cites it shows the result."
              : "Your reusable substantiation: studies, licences, service descriptions and consent forms. Attach a record to any creative instead of uploading it again."}
          </p>
          <SimulatedTag className="mt-2">{FICTIONAL_EVIDENCE_LABEL}</SimulatedTag>
        </div>
        <Button onClick={() => setAdding((v) => !v)} variant={adding ? "secondary" : "primary"}>
          <BookOpenIcon /> {adding ? "Cancel" : "New record"}
        </Button>
      </div>

      {adding && <NewRecordForm role={role} onDone={() => setAdding(false)} />}

      <SummaryStrip
        label="Evidence summary"
        items={[
          { label: "Records", value: counts.total, note: role === "team" ? "across both clients" : "in your workspace" },
          { label: "Checked by reviewer", value: counts.verified, note: "verified records" },
          { label: "Awaiting check", value: counts.awaiting, note: "unverified or under review", tone: counts.awaiting ? "attention" : "default" },
          { label: "Used in creatives", value: counts.used, note: "attached at least once" },
        ]}
      />

      <div className="rounded-2xl border border-line bg-surface p-4 shadow-2xs grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
        <Field label="Search">
          <Input icon={<SearchIcon />} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Title, claim, source…" aria-label="Search evidence records" />
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as DemoEvidenceRecordType | "ALL")} aria-label="Filter by type">
            <option value="ALL">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {EVIDENCE_RECORD_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as DemoEvidenceRecordStatus | "ALL")} aria-label="Filter by status">
            <option value="ALL">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {EVIDENCE_RECORD_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {shown.length === 0 ? (
        <EmptyState title="No records match" description={all.length === 0 ? "Add a record or attach evidence to a creative; every attachment is filed here." : "Clear the search or filters to see every record."} icon={<BookOpenIcon />} />
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-label="Evidence records">
          {shown.map((r) => {
            const uses = recordUsage(state, role, r.id);
            return (
              <li key={r.id}>
                <Link href={demoHref(role, "evidence", r.id)} className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 shadow-2xs transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-brand-50 border border-brand-100 text-brand-700 [&_svg]:size-4">
                      <TypeIcon type={r.type} />
                    </span>
                    <TonePill tone={STATUS_TONE[r.status]}>{EVIDENCE_RECORD_STATUS_LABEL[r.status]}</TonePill>
                  </div>
                  <h2 className="text-small font-semibold text-ink mt-3">{r.title}</h2>
                  <p className="text-caption text-muted mt-1 leading-relaxed line-clamp-2">{r.description}</p>
                  {r.supportedClaim && (
                    <p className="text-caption text-ink mt-2">
                      <span className="text-muted">Supports:</span> &ldquo;{r.supportedClaim}&rdquo;
                    </p>
                  )}
                  <div className="mt-auto pt-3 flex flex-wrap items-center justify-between gap-1 text-micro text-muted border-t border-line/60 mt-3">
                    <span>
                      {EVIDENCE_RECORD_TYPE_LABEL[r.type]} · {ownerLabel(role, r)}
                    </span>
                    <span>
                      {uses.length} creative{uses.length === 1 ? "" : "s"} · updated {formatDemoTime(r.updatedAt)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function NewRecordForm({ role, onDone }: { role: DemoRole; onDone: () => void }) {
  const { act } = useDemo();
  const [title, setTitle] = useState("");
  const [recordType, setRecordType] = useState<DemoEvidenceRecordType>("CLAIM_SUBSTANTIATION");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");
  const [supportedClaim, setSupportedClaim] = useState("");
  return (
    <form
      className="rounded-2xl border border-dashed border-line-strong bg-subtle/40 p-5 grid grid-cols-1 sm:grid-cols-2 gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        act({ type: "ADD_EVIDENCE_RECORD", ownerId: role, title, recordType, description, source, supportedClaim });
        onDone();
      }}
    >
      <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-small font-semibold text-ink">New evidence record</h2>
        <SimulatedTag>Simulated · no document is uploaded</SimulatedTag>
      </div>
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Patient satisfaction survey 2026" />
      </Field>
      <Field label="Type">
        <Select value={recordType} onChange={(e) => setRecordType(e.target.value as DemoEvidenceRecordType)}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {EVIDENCE_RECORD_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Supported claim" hint="The exact wording this evidence is meant to back up.">
          <Input value={supportedClaim} onChange={(e) => setSupportedClaim(e.target.value)} placeholder="e.g. 9 in 10 patients seen within a week" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16" placeholder="What the document is and what it shows." />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Source or reference" hint="A document name, issuer or registry entry. Fictional in the demo.">
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Survey export · satisfaction-2026.csv" />
        </Field>
      </div>
      <div className="sm:col-span-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!title.trim()}>
          Save record {role === "team" ? "" : "as unverified"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Detail

function RecordDetail({ role, record }: { role: DemoRole; record: DemoEvidenceRecord }) {
  const { state, act } = useDemo();
  const uses = recordUsage(state, role, record.id);
  const [note, setNote] = useState("");
  const targets = submissionsFor(state, role).filter((s) => attachableRecords(state, role, s.id).some((r) => r.id === record.id));
  const [target, setTarget] = useState<string>("");
  const chosen = targets.find((s) => s.id === target) ?? targets[0];

  return (
    <div className="flex flex-col gap-6">
      <Link href={demoHref(role, "evidence")} className="inline-flex items-center gap-1 text-caption font-medium text-brand-700 hover:text-brand-900">
        <ChevronLeftIcon className="size-3.5" /> Back to the evidence dictionary
      </Link>

      <div className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-card">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-caption text-muted">
              <span className="text-eyebrow font-semibold uppercase text-gold-700">Evidence record</span>
              <span className="text-faint">·</span>
              <span>{EVIDENCE_RECORD_TYPE_LABEL[record.type]}</span>
              <span className="text-faint">·</span>
              <span>{ownerLabel(role, record)}</span>
            </div>
            <h1 className="font-heading mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl text-balance">{record.title}</h1>
            <p className="text-small text-muted mt-1">{record.description}</p>
          </div>
          <TonePill tone={STATUS_TONE[record.status]} className="shrink-0">
            {EVIDENCE_RECORD_STATUS_LABEL[record.status]}
          </TonePill>
        </div>
        <dl className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-caption border-t border-line/60 pt-4">
          <div className="sm:col-span-2">
            <dt className="font-semibold text-ink-soft">Supported claim</dt>
            <dd className="text-ink mt-0.5">{record.supportedClaim ? `“${record.supportedClaim}”` : "Not stated"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-semibold text-ink-soft">Source / reference</dt>
            <dd className="text-ink mt-0.5 break-words">{record.source}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-soft">Valid until</dt>
            <dd className="text-ink mt-0.5">{record.validUntil ? formatDemoTime(record.validUntil) : "No expiry recorded"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-soft">Last updated</dt>
            <dd className="text-ink mt-0.5">{formatDemoTime(record.updatedAt)}</dd>
          </div>
          <div className="sm:col-span-2 rounded-lg bg-subtle/60 border border-line/70 p-2.5">
            <dt className="font-semibold text-ink-soft text-[11px]">Reviewer note</dt>
            <dd className="text-ink-soft mt-0.5">{record.reviewNote ?? (role === "team" ? "No reviewer decision yet." : "The reviewer has not checked this record yet.")}</dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 flex flex-col gap-5">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-2xs">
            <h2 className="text-body font-semibold text-ink">Used by</h2>
            <p className="text-caption text-muted mt-0.5">Creatives and claims this record substantiates. Each use is bound to one creative version.</p>
            {uses.length === 0 ? (
              <EmptyState className="mt-4" title="Not attached to any creative yet" description="Attach it from here or from a creative's Evidence tab." icon={<PaperclipIcon />} />
            ) : (
              <ul className="mt-4 divide-y divide-line">
                {uses.map(({ evidence, submission }) => (
                  <li key={evidence.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={demoHref(role, "submission", submission.id)} className="text-small font-semibold text-brand-700 hover:text-brand-900">
                        {submission.title}
                      </Link>
                      <p className="text-caption text-muted">
                        {role === "team" ? `${DEMO_CLIENTS[submission.clientId].organization} · ` : ""}version {evidence.versionNumber} · attached {formatDemoTime(evidence.uploadedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={submission.status} />
                      <Link href={demoHref(role, "passport", submission.id)} className="text-caption font-medium text-brand-700 hover:text-brand-900 inline-flex items-center gap-1 [&_svg]:size-3.5">
                        <ClipboardCheckIcon /> Passport
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(role !== "team" || record.ownerId === "team") && (
            <div className="rounded-2xl border border-gold-300/80 bg-gold-50/50 p-5 shadow-2xs">
              <h2 className="text-small font-semibold text-gold-900 inline-flex items-center gap-2 [&_svg]:size-4">
                <PaperclipIcon className="text-gold-700" /> Attach to a creative
              </h2>
              <p className="text-caption text-gold-900/80 mt-1">The record is attached to the creative&apos;s current version. Closed reviews cannot take new evidence.</p>
              {targets.length === 0 ? (
                <p className="text-caption text-muted mt-3">No open creative can take this record right now.</p>
              ) : (
                <form
                  className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-end"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (chosen) act({ type: "ATTACH_EVIDENCE_RECORD", submissionId: chosen.id, recordId: record.id, attachedBy: role === "team" ? "team" : "client" });
                  }}
                >
                  <div className="flex-1">
                    <Field label="Creative">
                      <Select value={chosen?.id ?? ""} onChange={(e) => setTarget(e.target.value)}>
                        {targets.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title} · V{s.versions.length}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Button type="submit" disabled={!chosen}>
                    Attach
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 flex flex-col gap-5">
          {role === "team" ? (
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-2xs">
              <h2 className="text-small font-semibold text-ink">Reviewer check</h2>
              <p className="text-caption text-muted mt-0.5">A human decision. It updates every creative that cites this record and is written to their histories.</p>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you checked (optional)" className="mt-3 min-h-16" />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={record.status === "VERIFIED"} onClick={() => { act({ type: "REVIEW_EVIDENCE_RECORD", recordId: record.id, verdict: "VERIFIED", note }); setNote(""); }}>
                  <CheckCircleIcon /> Mark checked
                </Button>
                <Button size="sm" variant="secondary" disabled={record.status === "NEEDS_MORE_INFO"} onClick={() => { act({ type: "REVIEW_EVIDENCE_RECORD", recordId: record.id, verdict: "NEEDS_MORE_INFO", note }); setNote(""); }}>
                  Needs more information
                </Button>
                <Button size="sm" variant="ghost" disabled={record.status === "UNDER_REVIEW"} onClick={() => { act({ type: "REVIEW_EVIDENCE_RECORD", recordId: record.id, verdict: "UNDER_REVIEW", note }); setNote(""); }}>
                  Put under check
                </Button>
              </div>
              <p className="text-micro text-muted mt-3 leading-relaxed">
                &ldquo;Checked by reviewer&rdquo; means a Clyntique reviewer read the record against the claim. It is not a legal opinion and does not certify the document.
              </p>
            </div>
          ) : (
            <div className={cn("rounded-2xl border p-5 shadow-2xs", record.status === "VERIFIED" ? "border-positive-line bg-positive-soft/40" : "border-line bg-surface")}>
              <h2 className="text-small font-semibold text-ink">Verification</h2>
              <p className="text-caption text-ink-soft mt-1 leading-relaxed">
                {record.status === "VERIFIED"
                  ? "A Clyntique reviewer has read this record against the claim it supports. Creatives that cite it show the evidence as checked."
                  : record.status === "NEEDS_MORE_INFO"
                    ? "The reviewer needs more from you before this record can support a claim. Read the reviewer note above."
                    : "Supplied by you and not yet checked by a reviewer. Attaching it to a creative puts it in front of the review team."}
              </p>
            </div>
          )}
          <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-5 shadow-2xs">
            <h3 className="text-small font-semibold text-brand-800 inline-flex items-center gap-2 [&_svg]:size-4">
              <BookOpenIcon className="text-brand-600" /> How the dictionary fits the workflow
            </h3>
            <p className="text-caption text-ink-soft mt-2 leading-relaxed">
              A creative is submitted, the AI pre-screen asks for substantiation where a claim needs it, the client attaches a record from here, the reviewer checks it once, and the creative&apos;s Compliance Passport shows the evidence with its verification status.
            </p>
            <div className="mt-3 flex items-start gap-2 text-caption text-muted">
              <LockIcon className="size-4 text-brand-700 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed">{FICTIONAL_EVIDENCE_LABEL}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
