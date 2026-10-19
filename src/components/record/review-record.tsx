import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";
import { getCitableRuleVersions, getLifecycle, type CycleView, type ExternalSubmissionView, type ScanView } from "@/lib/data/lifecycle";
import { getSubmission } from "@/lib/data/submission";
import { getSubmissionReview, type DecisionView, type EvidenceView, type FindingView } from "@/lib/data/submission-review";
import { FORMATS } from "@/lib/creative-format";
import { basePathFor } from "@/lib/navigation";
import { EXTERNAL_STATUS_LABEL, type ExternalStatusKey } from "@/lib/workflow/external";
import {
  EXTERNAL_BASIS_LABEL,
  EXTERNAL_DESTINATION_LABEL,
  EXTERNAL_OUTCOME_LABEL,
  FINDING_STATUS_LABEL,
  RECORD_DISCLAIMER,
  REQUIRED_ACTION_LABEL,
  REVIEW_CYCLE_REASON_LABEL,
  REVIEW_OUTCOME_DESCRIPTION,
  REVIEW_OUTCOME_LABEL,
  SEVERITY_LABEL,
} from "@/lib/workflow/labels";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { EVIDENCE_TYPES } from "@/components/review/evidence-types";
import { Card } from "@/components/ui/card";
import { StatusBadge, TonePill, type Tone } from "@/components/ui/status-badge";
import { ExternalOutcomeForm, ExternalSubmissionForm, ReopenReviewForm } from "./lifecycle-forms";
import { PrintButton } from "./print-button";

/*
 * The review record ("compliance passport" MVP, Oct 19 sprint): one read-only,
 * printable page per submission with everything that was decided and when:
 * review cycles and their final decisions, findings, evidence, AI checks and
 * the rule versions they ran against, and what the client or team recorded
 * about platform or regulator submissions.
 *
 * It is built from the same loaders as the workspace, so it shows exactly what
 * this viewer may see there (a client never sees draft findings, internal
 * evidence or AI suggestions). It states on every page that an internal
 * review is not legal, government or platform approval.
 *
 * The forms at the bottom (external submission, external outcome, re-review)
 * are the only writes reachable from here; each goes through the workflow
 * commands. They are hidden when printing.
 */

const EXTERNAL_TONE: Record<ExternalStatusKey, Tone> = {
  NOT_SUBMITTED: "neutral",
  AWAITING_OUTCOME: "accent",
  APPROVED_REPORTED: "positive",
  APPROVED_VERIFIED: "positive",
  CHANGES_REQUESTED: "attention",
  REJECTED: "attention",
};

const SCAN_STATUS_LABEL = {
  SUCCESS: "Completed",
  INSUFFICIENT_COVERAGE: "No verified rules covered this scope",
  RATE_LIMITED: "Not run (service busy)",
  ERROR: "Failed",
} as const;

function day(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function dateTime(date: Date) {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 break-inside-avoid">
      <div>
        <h2 className="text-section-title text-ink">{title}</h2>
        {description && <p className="text-small text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[11rem_1fr]">
      <dt className="text-small text-muted">{label}</dt>
      <dd className="text-small min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

export async function ReviewRecord({ role, params }: { role: Role; params: Promise<{ creativeId: string }> }) {
  const [user, { creativeId }] = await Promise.all([requireRole(role), params]);
  const [submission, review, lifecycle, ruleVersions] = await Promise.all([
    getSubmission(user, creativeId),
    getSubmissionReview(user, creativeId),
    getLifecycle(user, creativeId),
    getCitableRuleVersions(user),
  ]);
  if (!submission || !review || !lifecycle) notFound();

  const team = role === "TEAM";
  const base = basePathFor(role);
  const format = FORMATS[submission.format];
  const finalDecisions = review.decisions.filter((d) => d.kind === "FINAL");
  const latestFinal = finalDecisions[0];
  const generatedAt = new Date();
  const recordCode = submission.id.slice(-8).toUpperCase();

  return (
    <div className="flex min-w-0 flex-col gap-8 print:gap-6">
      {/* Print: hide the app chrome, keep the record. */}
      <style>{`@media print { aside, header.sticky { display: none !important; } main { padding: 0 !important; } }`}</style>
      <Breadcrumb
        trail={[
          { label: "Projects", href: `${base}/projects` },
          { label: submission.project.name, href: `${base}/projects/${submission.project.id}` },
          { label: submission.name, href: `${base}/creatives/${submission.id}` },
        ]}
        current="Review record"
      />

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption font-medium tracking-wide text-muted uppercase">Clyntique review record</p>
            <h1 className="text-page-title mt-1 min-w-0 text-balance break-words font-semibold tracking-tight text-ink">{submission.name}</h1>
            <p className="text-small mt-1 text-muted">
              {submission.project.clientName} · {submission.project.name} · {format.label}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-record text-muted">REC-{recordCode}</span>
            <PrintButton />
          </div>
        </div>
        <p className="text-small rounded-md border border-attention-solid/40 bg-attention-soft px-3 py-2 text-attention-ink">{RECORD_DISCLAIMER}</p>
      </header>

      <Section title="Summary">
        <Card className="p-4">
          <dl className="flex flex-col gap-2">
            <Row label="Internal review status">
              <StatusBadge status={submission.status} />
            </Row>
            <Row label="Latest internal outcome">
              {latestFinal?.outcome ? (
                <>
                  <span className="font-medium">{REVIEW_OUTCOME_LABEL[latestFinal.outcome]}</span>
                  <span className="text-muted">
                    {" "}
                    · cycle {latestFinal.cycleNumber}, V{latestFinal.versionNumber}, {day(latestFinal.createdAt)}
                  </span>
                  <p className="text-muted">{REVIEW_OUTCOME_DESCRIPTION[latestFinal.outcome]}</p>
                </>
              ) : (
                <span className="text-muted">No completed review yet.</span>
              )}
            </Row>
            <Row label="Advertising platform">
              <TonePill tone={EXTERNAL_TONE[lifecycle.externalByDestination.AD_PLATFORM]}>{EXTERNAL_STATUS_LABEL[lifecycle.externalByDestination.AD_PLATFORM]}</TonePill>
            </Row>
            <Row label="Regulator">
              <TonePill tone={EXTERNAL_TONE[lifecycle.externalByDestination.REGULATOR]}>{EXTERNAL_STATUS_LABEL[lifecycle.externalByDestination.REGULATOR]}</TonePill>
            </Row>
            <Row label="Markets">{submission.markets.length ? submission.markets.map((m) => m.name).join(", ") : "Not specified"}</Row>
            <Row label="Platforms">{submission.platforms.length ? submission.platforms.map((p) => p.name).join(", ") : "Not specified"}</Row>
            <Row label="Versions">{submission.versions.length ? submission.versions.map((v) => `V${v.versionNumber} (${day(v.createdAt)})`).join(", ") : "None uploaded"}</Row>
          </dl>
        </Card>
      </Section>

      <Section title="Internal review cycles" description="Each cycle is a complete review by a Clyntique reviewer. Closed cycles are never edited; a re-review opens a new one.">
        {lifecycle.cycles.length === 0 ? (
          <p className="text-small text-muted">Not submitted for review yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {lifecycle.cycles.map((cycle) => (
              <CycleCard key={cycle.id} cycle={cycle} decisions={review.decisions.filter((d) => d.cycleNumber === cycle.number)} findings={review.findings.filter((f) => f.cycleNumber === cycle.number)} team={team} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Evidence" description={team ? "All evidence on file, including team-only items." : "Evidence you shared with the reviewer."}>
        {review.evidence.length === 0 ? <p className="text-small text-muted">No evidence on file.</p> : <EvidenceTable evidence={review.evidence} team={team} />}
      </Section>

      <Section
        title="Automated checks"
        description={
          team
            ? "Every AI pre-check that ran, with the approved rule versions it was checked against. Suggestions are only advisory until a reviewer records a finding."
            : "Automated pre-checks run by Clyntique against approved policy rules. Their results reach you only through the reviewer's findings above."
        }
      >
        {lifecycle.scans.length === 0 ? <p className="text-small text-muted">No automated check has been recorded.</p> : <ScanTable scans={lifecycle.scans} team={team} />}
      </Section>

      <Section
        title="External submissions and outcomes"
        description="What was sent to an advertising platform or regulator after Clyntique's review, and what they answered. Recorded manually; Clyntique does not submit on anyone's behalf."
      >
        {lifecycle.external.length === 0 ? (
          <p className="text-small text-muted">Nothing recorded as submitted externally.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {lifecycle.external.map((s) => (
              <ExternalCard key={s.id} submission={s} role={role} canRecord={lifecycle.canRecordExternal} evidence={lifecycle.evidenceOptions} />
            ))}
          </div>
        )}
        {lifecycle.canRecordExternal ? (
          <Card className="p-4 print:hidden">
            <h3 className="text-small mb-3 font-medium text-ink">{team ? "Record an external submission" : "Tell Clyntique you submitted this externally"}</h3>
            <ExternalSubmissionForm creativeId={submission.id} role={role} versions={lifecycle.reviewedVersions} markets={submission.markets} platforms={submission.platforms} />
          </Card>
        ) : (
          lifecycle.cycles.length > 0 &&
          !lifecycle.cycles.some((c) => c.closedAt) && <p className="text-meta print:hidden">External submissions can be recorded once the internal review is complete.</p>
        )}
      </Section>

      {team && lifecycle.canReopen && (
        <Section title="Re-review" description="Open the next review cycle when a rule changed, a platform or regulator answered, or the creative needs another look.">
          <Card className="p-4 print:hidden">
            <ReopenReviewForm creativeId={submission.id} ruleVersions={ruleVersions} />
          </Card>
        </Section>
      )}

      <footer className="flex flex-col gap-1 border-t border-line pt-4">
        <p className="text-meta">{RECORD_DISCLAIMER}</p>
        <p className="text-meta">
          Generated {dateTime(generatedAt)} for {team ? "the Clyntique team" : submission.project.clientName}. Record REC-{recordCode}.{" "}
          <Link href={`${base}/creatives/${submission.id}`} className="underline print:hidden">
            Back to the submission
          </Link>
        </p>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CycleCard({ cycle, decisions, findings, team }: { cycle: CycleView; decisions: DecisionView[]; findings: FindingView[]; team: boolean }) {
  const final = decisions.find((d) => d.kind === "FINAL");
  const requests = decisions.filter((d) => d.kind === "CHANGES_REQUESTED");
  return (
    <Card className="flex flex-col gap-3 p-4 break-inside-avoid">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-small font-semibold text-ink">Cycle {cycle.number}</h3>
        {cycle.closedAt ? (
          <TonePill tone="positive">{final?.outcome ? REVIEW_OUTCOME_LABEL[final.outcome] : "Closed"}</TonePill>
        ) : (
          <TonePill tone="accent">In progress</TonePill>
        )}
        <span className="text-caption text-muted">
          Opened {day(cycle.openedAt)}
          {cycle.closedAt ? ` · closed ${day(cycle.closedAt)}` : ""} · {cycle.roundCount} {cycle.roundCount === 1 ? "round" : "rounds"}
        </span>
      </div>
      <dl className="flex flex-col gap-1.5">
        {cycle.number > 1 && (
          <Row label="Why it was opened">
            {cycle.reasonKind ? REVIEW_CYCLE_REASON_LABEL[cycle.reasonKind] : "Re-review"}
            {cycle.triggerRule && (
              <span className="text-muted">
                {" "}
                · rule {cycle.triggerRule.code} v{cycle.triggerRule.versionNumber}
              </span>
            )}
            {cycle.openedReason && <p className="whitespace-pre-line text-ink-soft">{cycle.openedReason}</p>}
          </Row>
        )}
        {requests.map((r) => (
          <Row key={r.id} label={`Changes requested (R${r.roundNumber}, V${r.versionNumber})`}>
            <span className="text-muted">{day(r.createdAt)}</span>
            <p className="whitespace-pre-line text-ink-soft">{r.summary}</p>
          </Row>
        ))}
        {final && (
          <Row label={`Final decision (R${final.roundNumber}, V${final.versionNumber})`}>
            <span className="font-medium">{final.outcome ? REVIEW_OUTCOME_LABEL[final.outcome] : "Completed"}</span>
            <span className="text-muted">
              {" "}
              · {day(final.createdAt)}
              {team ? ` · ${final.reviewerName}` : ""}
            </span>
            <p className="whitespace-pre-line text-ink-soft">{final.summary}</p>
            {final.scopeNote && <p className="text-muted">Scope: {final.scopeNote}</p>}
          </Row>
        )}
      </dl>
      <div>
        <p className="text-caption mb-1 font-medium text-muted">
          {findings.length === 0 ? "No findings in this cycle." : `${findings.length} ${findings.length === 1 ? "finding" : "findings"}`}
        </p>
        {findings.length > 0 && (
          <table className="w-full border-collapse text-small">
            <thead>
              <tr className="text-caption text-left text-muted">
                <th className="py-1 pr-3 font-medium">Issue</th>
                <th className="py-1 pr-3 font-medium">Severity</th>
                <th className="py-1 pr-3 font-medium">Required</th>
                <th className="py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f) => (
                <tr key={f.id} className="border-t border-line align-top">
                  <td className="py-1.5 pr-3">
                    <span className="font-medium text-ink">{f.issue}</span>
                    {f.versionNumber != null && <span className="text-muted"> · V{f.versionNumber}</span>}
                    {f.resolutionNote && <p className="text-muted">{f.resolutionNote}</p>}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{SEVERITY_LABEL[f.severity]}</td>
                  <td className="py-1.5 pr-3">{REQUIRED_ACTION_LABEL[f.requiredAction]}</td>
                  <td className="py-1.5 whitespace-nowrap">
                    {FINDING_STATUS_LABEL[f.status]}
                    {f.resolvedInVersionNumber != null && <span className="text-muted"> (V{f.resolvedInVersionNumber})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

function EvidenceTable({ evidence, team }: { evidence: EvidenceView[]; team: boolean }) {
  return (
    <Card className="overflow-x-auto p-4">
      <table className="w-full border-collapse text-small">
        <thead>
          <tr className="text-caption text-left text-muted">
            <th className="py-1 pr-3 font-medium">Title</th>
            <th className="py-1 pr-3 font-medium">Type</th>
            <th className="py-1 pr-3 font-medium">Source</th>
            <th className="py-1 pr-3 font-medium">Added</th>
            {team && <th className="py-1 font-medium">Visibility</th>}
          </tr>
        </thead>
        <tbody>
          {evidence.map((e) => (
            <tr key={e.id} className="border-t border-line align-top">
              <td className="py-1.5 pr-3">
                <span className={e.withdrawn ? "text-muted line-through" : "font-medium text-ink"}>{e.title}</span>
                {e.withdrawn && <span className="text-muted"> · withdrawn {e.withdrawal ? day(e.withdrawal.at) : ""}</span>}
                {e.file && <p className="text-muted">{e.file.name}</p>}
              </td>
              <td className="py-1.5 pr-3 whitespace-nowrap">{EVIDENCE_TYPES[e.type]}</td>
              <td className="py-1.5 pr-3">{e.source ?? e.url ?? "—"}</td>
              <td className="py-1.5 pr-3 whitespace-nowrap">
                {day(e.createdAt)}
                {e.submittedWithRound != null && <span className="text-muted"> · R{e.submittedWithRound}</span>}
              </td>
              {team && <td className="py-1.5 whitespace-nowrap">{e.visibility === "SHARED" ? "Shared with client" : "Team only"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ScanTable({ scans, team }: { scans: ScanView[]; team: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {scans.map((s) => (
        <Card key={s.id} className="flex flex-col gap-1.5 p-3 break-inside-avoid">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-small font-medium text-ink">
              V{s.versionNumber}
              {s.cycleNumber != null ? ` · cycle ${s.cycleNumber}` : ""}
              {s.roundNumber != null ? ` · R${s.roundNumber}` : ""}
            </span>
            <TonePill tone={s.status === "SUCCESS" ? "positive" : s.status === "INSUFFICIENT_COVERAGE" ? "neutral" : "attention"}>{SCAN_STATUS_LABEL[s.status]}</TonePill>
            <span className="text-caption text-muted">
              {dateTime(s.createdAt)}
              {team ? ` · ${s.initiatedByName}` : ""}
            </span>
          </div>
          <p className="text-caption text-muted">
            {s.rulesChecked.length
              ? `Checked against ${s.rulesChecked.length} approved ${s.rulesChecked.length === 1 ? "rule" : "rules"}: ${s.rulesChecked.map((r) => `${r.ruleCode} v${r.ruleVersionNumber}`).join(", ")}`
              : "No approved rule version covered this submission's markets and platforms."}
          </p>
          {team && (
            <>
              {s.summary && <p className="text-small whitespace-pre-line text-ink-soft">{s.summary}</p>}
              <p className="text-caption text-muted">
                {s.detectedClaims.length} {s.detectedClaims.length === 1 ? "claim" : "claims"} detected · {s.suggestedFindings.length} suggested{" "}
                {s.suggestedFindings.length === 1 ? "finding" : "findings"}
                {s.discardedSuggestions ? ` · ${s.discardedSuggestions} discarded (no verified rule)` : ""}
                {s.modelUsed ? ` · ${s.modelUsed}` : ""}
                {s.promptVersion ? ` · prompt ${s.promptVersion}` : ""}
              </p>
            </>
          )}
        </Card>
      ))}
    </div>
  );
}

function ExternalCard({ submission: s, role, canRecord, evidence }: { submission: ExternalSubmissionView; role: Role; canRecord: boolean; evidence: { id: string; title: string }[] }) {
  return (
    <Card className="flex flex-col gap-2 p-4 break-inside-avoid">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-small font-semibold text-ink">
          {EXTERNAL_DESTINATION_LABEL[s.destinationType]}: {s.destinationName}
        </span>
        <TonePill tone={EXTERNAL_TONE[s.status]}>{EXTERNAL_STATUS_LABEL[s.status]}</TonePill>
      </div>
      <dl className="flex flex-col gap-1">
        <Row label="Submitted">
          {day(s.submittedOn)} · V{s.versionNumber}
          {s.cycleNumber != null ? ` (reviewed in cycle ${s.cycleNumber})` : ""}
          {s.platformName ? ` · ${s.platformName}` : ""}
          {s.marketName ? ` · ${s.marketName}` : ""}
        </Row>
        {s.externalReference && <Row label="Reference">{s.externalReference}</Row>}
        {s.note && <Row label="Note">{s.note}</Row>}
        <Row label="Recorded">
          {EXTERNAL_BASIS_LABEL[s.basis]} · {s.recordedByName}, {day(s.recordedAt)}
        </Row>
      </dl>
      {s.outcomes.length > 0 && (
        <ol className="flex flex-col gap-1.5 border-t border-line pt-2">
          {s.outcomes.map((o) => (
            <li key={o.id} className="text-small">
              <span className="font-medium text-ink">{EXTERNAL_OUTCOME_LABEL[o.kind]}</span>
              <span className="text-muted">
                {" "}
                · {day(o.outcomeOn)} · {EXTERNAL_BASIS_LABEL[o.basis]} · {o.recordedByName}
              </span>
              {o.note && <p className="whitespace-pre-line text-ink-soft">{o.note}</p>}
              {o.evidence && <p className="text-muted">Document: {o.evidence.title}</p>}
            </li>
          ))}
        </ol>
      )}
      {canRecord && <ExternalOutcomeForm submissionId={s.id} role={role} evidence={evidence} />}
    </Card>
  );
}
