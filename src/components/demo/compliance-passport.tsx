"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge, TonePill, type Tone } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/states";
import { FindingStatusPill, SeverityMarker } from "@/components/ui/severity";
import { AlertIcon, BookOpenIcon, CheckCircleIcon, ChevronLeftIcon, ClipboardCheckIcon, FileTextIcon, LockIcon, PaperclipIcon, ShieldIcon, SparklesIcon } from "@/components/ui/icons";
import { REQUIRED_ACTION_LABEL, REVIEW_OUTCOME_LABEL } from "@/lib/workflow/labels";
import { DEMO_CLIENTS, type DemoRole } from "@/lib/demo/data";
import { demoHref } from "@/lib/demo/links";
import { buildPassport, type CompliancePassport, type PassportStatus } from "@/lib/demo/passport";
import { formatDemoTime, useDemo } from "./demo-provider";
import { SimulatedTag } from "./submission-panels";

/*
 * Compliance Passport screen: Creative → View Compliance Passport → inspect
 * findings and evidence → view review history. One page per creative version,
 * printable, built on every render from the sandbox state (see
 * src/lib/demo/passport.ts). Nothing here is stored.
 */

const STATUS_TONE: Record<PassportStatus, Tone> = {
  IN_PROGRESS: "accent",
  ACTIVE: "positive",
  SUPERSEDED: "neutral",
};

const VERIFICATION_TONE = {
  VERIFIED: "positive",
  UNDER_REVIEW: "accent",
  UNVERIFIED: "attention",
  NEEDS_MORE_INFO: "attention",
} as const;

export function CompliancePassportView({ role, id }: { role: DemoRole; id: string | null }) {
  const { state } = useDemo();
  const submission = state.submissions.find((s) => s.id === id);
  const latest = submission ? submission.versions[submission.versions.length - 1].number : 1;
  const [picked, setPicked] = useState<{ latest: number; version: number }>({ latest, version: latest });
  const version = picked.latest === latest ? picked.version : latest;

  const passport = buildPassport(state, role, id ?? "", version);
  if (!passport) return <NotInWorkspace role={role} />;
  return <PassportPage role={role} passport={passport} onSelectVersion={(n) => setPicked({ latest, version: n })} />;
}

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
        <h1 className="text-xl font-semibold text-ink mt-4">No passport in your workspace</h1>
        <p className="text-small text-muted mt-2 max-w-md mx-auto">
          {who === "the team" ? "The creative does not exist." : `A Compliance Passport belongs to the client whose creative it describes. ${who} can only open passports for its own creatives.`}
        </p>
      </div>
    </div>
  );
}

function Section({ title, description, icon, children, className }: { title: string; description?: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-line bg-surface p-5 shadow-2xs break-inside-avoid print:border-slate-300 print:shadow-none", className)}>
      <div className="flex items-start gap-2 border-b border-line pb-3 mb-4">
        {icon && <span className="text-brand-600 [&_svg]:size-4 mt-0.5">{icon}</span>}
        <div>
          <h2 className="text-body font-semibold text-ink">{title}</h2>
          {description && <p className="text-caption text-muted mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr]">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="text-small min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

function PassportPage({ role, passport, onSelectVersion }: { role: DemoRole; passport: CompliancePassport; onSelectVersion: (n: number) => void }) {
  const { state } = useDemo();
  const submission = state.submissions.find((s) => s.id === passport.creative.submissionId)!;
  const back = demoHref(role, "submission", submission.id);

  return (
    <div className="flex min-w-0 flex-col gap-6 print:gap-4">
      <style>{`@media print { header.sticky, aside, footer, .print-hide { display: none !important; } main { padding: 0 !important; } }`}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print-hide">
        <Link href={back} className="inline-flex items-center gap-1 text-caption font-medium text-brand-700 hover:text-brand-900">
          <ChevronLeftIcon className="size-3.5" /> Back to the creative
        </Link>
        <div className="flex items-center gap-2">
          <Link href={demoHref(role, "evidence")} className="text-caption font-medium text-brand-700 hover:text-brand-900 inline-flex items-center gap-1 [&_svg]:size-3.5">
            <BookOpenIcon /> Evidence dictionary
          </Link>
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            <FileTextIcon /> Print or save as PDF
          </Button>
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-2xl border border-brand-200 bg-surface p-5 sm:p-6 shadow-card print:border-slate-300">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-eyebrow font-semibold uppercase text-gold-700 [&_svg]:size-3.5">
                <ClipboardCheckIcon /> Compliance Passport
              </span>
              <span className="font-mono text-micro font-semibold text-muted">{passport.recordCode}</span>
            </div>
            <h1 className="font-heading mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl text-balance">{passport.creative.title}</h1>
            <p className="text-small text-muted mt-1">
              {passport.client.organization} · {passport.client.project} · {passport.target.platform} · {passport.target.market}
            </p>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-2">
            <TonePill tone={STATUS_TONE[passport.status]}>{passport.statusLabel}</TonePill>
            <div className="flex items-center gap-1 rounded-lg border border-line bg-subtle/40 p-1 print-hide" aria-label="Passport version">
              {submission.versions.map((v) => (
                <button
                  key={v.number}
                  type="button"
                  onClick={() => onSelectVersion(v.number)}
                  className={cn("px-2.5 py-0.5 rounded text-caption font-medium transition-colors cursor-pointer", v.number === passport.creative.versionNumber ? "bg-brand-100 text-brand-800 font-semibold" : "text-muted hover:text-ink")}
                >
                  V{v.number}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-dashed border-gold-500/60 bg-gold-50/60 p-3 text-caption text-gold-900">
          <LockIcon className="size-4 shrink-0 mt-0.5 text-gold-700" />
          <p className="leading-relaxed">{passport.disclaimer}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start print:block">
        <div className="lg:col-span-7 flex flex-col gap-6">
          <Section title="Creative and review summary" icon={<FileTextIcon />}>
            <dl className="flex flex-col gap-2">
              <Row label="Creative">
                {passport.creative.title} · version {passport.creative.versionNumber} of {passport.creative.currentVersionNumber} · {passport.creative.fileName}
              </Row>
              <Row label="Headline">&ldquo;{passport.creative.headline}&rdquo;</Row>
              <Row label="Body copy">{passport.creative.bodyCopy}</Row>
              {passport.creative.disclosure && <Row label="Disclosure line">{passport.creative.disclosure}</Row>}
              <Row label="Version note">
                {passport.creative.changeNote} <span className="text-muted">· submitted {formatDemoTime(passport.creative.submittedAt)}</span>
              </Row>
              <Row label="Client / project">
                {passport.client.organization}
                {passport.client.contactName ? ` (${passport.client.contactName})` : ""} · {passport.client.project}
              </Row>
              <Row label="Target">
                {passport.target.platform} · {passport.target.market} · {passport.creative.format}
              </Row>
              <Row label="Review status">
                <span className="inline-flex flex-wrap items-center gap-2">
                  <StatusBadge status={passport.review.status} />
                  {passport.review.outcome && <Badge tone="brand">{REVIEW_OUTCOME_LABEL[passport.review.outcome]}</Badge>}
                  {passport.review.outcome && <SimulatedTag>Simulated approval · internal review only</SimulatedTag>}
                </span>
              </Row>
              <Row label="Findings on this version">
                {passport.findings.length} total · {passport.review.openFindings} open · {passport.review.resolvedFindings} resolved
                {role === "team" && passport.review.draftFindings > 0 ? ` · ${passport.review.draftFindings} draft (team-only)` : ""}
              </Row>
              <Row label="Reviewer">{passport.review.reviewerLabel}</Row>
            </dl>
          </Section>

          <Section title="Compliance findings" description="Each finding says where it came from. AI suggestions become findings only when a reviewer accepts them." icon={<ShieldIcon />}>
            {passport.findings.length === 0 ? (
              <EmptyState title="No findings on this version" description={passport.status === "ACTIVE" ? "A clean version is still an internal review decision, not an approval by any platform or regulator." : "The reviewer has not recorded findings on this version."} />
            ) : (
              <ul className="flex flex-col gap-3">
                {passport.findings.map(({ finding, policy, origin }) => (
                  <li key={finding.id} className="rounded-xl border border-line p-3.5 bg-subtle/30">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityMarker severity={finding.severity} />
                      <FindingStatusPill status={finding.status} />
                      <span className="font-mono text-micro font-semibold text-muted">{finding.policyCode}</span>
                      {origin === "AI_SUGGESTED_REVIEWER_ACCEPTED" ? (
                        <SimulatedTag>AI-simulated suggestion · accepted by reviewer</SimulatedTag>
                      ) : (
                        <Badge tone="brand">Recorded by reviewer</Badge>
                      )}
                    </div>
                    <h3 className="text-small font-semibold text-ink mt-2">{finding.issue}</h3>
                    <p className="text-caption text-ink mt-1">
                      &ldquo;{finding.claimText}&rdquo; <span className="text-muted">· {finding.claimLocation}</span>
                    </p>
                    <p className="text-caption text-ink-soft mt-1 leading-relaxed">{finding.explanation}</p>
                    <p className="text-caption text-muted mt-1">
                      Required action: {REQUIRED_ACTION_LABEL[finding.requiredAction]}
                      {policy ? ` · cites ${policy.code} v${policy.versionNumber} (sample, unverified)` : ""}
                    </p>
                    {finding.clientResponse && (
                      <p className="text-caption text-ink mt-1">
                        <span className="font-semibold text-ink-soft">Client response:</span> &ldquo;{finding.clientResponse}&rdquo;
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Reviewer decisions and history" description="Every step, timestamped. Decisions are human; simulated steps are labelled." icon={<CheckCircleIcon />}>
            {passport.history.length === 0 ? (
              <EmptyState title="No history yet" />
            ) : (
              <ol className="relative border-l-2 border-line ml-2 space-y-4">
                {passport.history.map(({ event, kind }) => (
                  <li key={event.id} className="ml-5">
                    <span className={cn("absolute -left-[7px] mt-1.5 size-3 rounded-full ring-4 ring-surface", kind === "DECISION" ? "bg-brand-600" : kind === "AI_CHECK" ? "bg-gold-500" : kind === "EVIDENCE" ? "bg-emerald-600" : "bg-line-strong")} aria-hidden />
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                      <p className="text-small font-semibold text-ink">
                        {event.title}
                        {kind === "DECISION" && <span className="ml-2 text-micro font-medium text-brand-700 uppercase tracking-wide">Human decision</span>}
                      </p>
                      <span className="text-micro font-mono text-muted">{formatDemoTime(event.at)}</span>
                    </div>
                    <p className="text-caption text-muted mt-0.5 leading-relaxed">{event.detail}</p>
                    {event.simulated && <SimulatedTag className="mt-1">Simulated</SimulatedTag>}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        <div className="lg:col-span-5 flex flex-col gap-6 print:mt-4">
          <Section title="Supporting evidence" description="What substantiates the claims on this version, and whether a reviewer checked it." icon={<PaperclipIcon />}>
            {passport.evidence.length === 0 ? (
              <EmptyState title="No evidence attached to this version" description="Evidence is bound to the version it supports." icon={<PaperclipIcon />} />
            ) : (
              <ul className="flex flex-col gap-3">
                {passport.evidence.map(({ evidence, record, verification, verificationLabel }) => (
                  <li key={evidence.id} className="rounded-xl border border-line p-3.5 bg-subtle/30">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-small font-semibold text-ink break-all">{evidence.name}</span>
                      <TonePill tone={VERIFICATION_TONE[verification]}>{verificationLabel}</TonePill>
                    </div>
                    <p className="text-caption text-muted mt-1 leading-relaxed">{evidence.description}</p>
                    {record && (
                      <p className="text-caption mt-1.5">
                        <span className="text-muted">Supports:</span> {record.supportedClaim || "—"} ·{" "}
                        <Link href={demoHref(role, "evidence", record.id)} className="font-medium text-brand-700 hover:text-brand-900 print-hide">
                          dictionary record
                        </Link>
                        <span className="hidden print:inline">dictionary record {record.id}</span>
                      </p>
                    )}
                    <p className="text-micro text-muted mt-1">
                      {evidence.kind} · V{evidence.versionNumber} · {evidence.uploadedBy === "team" ? passport.review.reviewerLabel : passport.client.organization} · {formatDemoTime(evidence.uploadedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {passport.missingEvidence.length > 0 && (
              <div className="mt-4 rounded-xl border border-attention-line bg-attention-soft/50 p-3.5">
                <p className="text-small font-semibold text-attention-ink inline-flex items-center gap-1.5 [&_svg]:size-4">
                  <AlertIcon /> Missing evidence
                </p>
                <ul className="mt-1.5 flex flex-col gap-1 text-caption text-ink-soft">
                  {passport.missingEvidence.map((f) => (
                    <li key={f.id}>
                      &ldquo;{f.claimText}&rdquo; · {f.issue} (V{f.versionNumber}) — no evidence attached yet.
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>

          <Section title="Policy references and coverage" description="Which sample policies this version was judged against, and what was not covered." icon={<ShieldIcon />}>
            {passport.policies.length === 0 ? (
              <EmptyState title="No policy references yet" description="No finding cites a policy and no scan has run on this version." />
            ) : (
              <ul className="flex flex-col gap-2">
                {passport.policies.map(({ policy, cited, checked }) => (
                  <li key={policy.code} className="rounded-lg border border-line bg-subtle/30 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-micro font-semibold text-muted">{policy.code}</span>
                      <Badge tone="outline">v{policy.versionNumber} · sample · unverified</Badge>
                      {cited && <Badge tone="brand">Cited by a finding</Badge>}
                      {checked && !cited && <Badge tone="neutral">Checked, no finding</Badge>}
                    </div>
                    <p className="text-caption text-ink mt-1">{policy.title}</p>
                    <p className="text-micro text-muted">
                      {policy.authority} · {policy.jurisdiction}
                      {policy.platform ? ` · ${policy.platform}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 rounded-xl border border-dashed border-line-strong bg-subtle/40 p-3.5">
              <p className="text-small font-semibold text-ink-soft">Coverage limitations</p>
              <ul className="mt-1.5 flex flex-col gap-1 text-caption text-muted">
                {passport.coverage.limitations.map((l) => (
                  <li key={l} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 rounded-full bg-gold-500 shrink-0" aria-hidden />
                    {l}
                  </li>
                ))}
              </ul>
              <p className="text-micro text-muted mt-2">
                Verified policies available: {passport.coverage.verifiedPolicies} · sample policies: {passport.coverage.samplePolicies}
              </p>
            </div>
          </Section>

          <Section title="Automated checks" description="Simulated AI pre-screens on this creative. No model was called." icon={<SparklesIcon />}>
            {passport.aiChecks.length === 0 ? (
              <EmptyState title="No simulated scan has run" description={role === "team" ? "Run one from the creative's workspace to see it recorded here." : "The team has not run an automated pre-screen on this creative."} />
            ) : (
              <ul className="flex flex-col gap-2">
                {passport.aiChecks.map((scan) => (
                  <li key={`${scan.submissionId}-${scan.versionNumber}`} className="rounded-lg border border-line bg-subtle/30 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-small font-semibold text-ink">Version {scan.versionNumber}</span>
                      <span className="text-micro font-mono text-muted">{formatDemoTime(scan.ranAt)}</span>
                    </div>
                    <p className="text-caption text-muted mt-0.5">
                      {scan.policiesChecked} sample policies · {scan.suggestions.length} suggestion{scan.suggestions.length === 1 ? "" : "s"} · {scan.accepted.length} accepted by reviewer
                    </p>
                    <SimulatedTag className="mt-1">Simulated AI result · no model call</SimulatedTag>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <footer className="rounded-2xl border border-line bg-subtle/40 px-5 py-4 text-caption text-muted flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 print:border-slate-300">
        <span>
          Record {passport.recordCode} · last updated {formatDemoTime(passport.updatedAt)} · rebuilt on every view from the sandbox state
        </span>
        <span className="inline-flex items-center gap-1.5 [&_svg]:size-3.5">
          <LockIcon /> Internal review record · not a certification
        </span>
      </footer>
    </div>
  );
}
