import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";
import { getSubmission, getTargetingOptions, type SubmissionDetail } from "@/lib/data/submission";
import { getSubmissionReview, type SubmissionReview } from "@/lib/data/submission-review";
import { FORMATS } from "@/lib/creative-format";
import { formatRelative, pluralize } from "@/lib/format";
import { getUploadLimits } from "@/lib/media";
import { basePathFor } from "@/lib/navigation";
import { uploadsConfigured } from "@/lib/review/blob";
import { REVIEW_DISCLAIMER, REVIEW_OUTCOME_DESCRIPTION, REVIEW_OUTCOME_LABEL } from "@/lib/workflow/labels";
import { authorize } from "@/lib/workflow/policy";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Card } from "@/components/ui/card";
import { StatusBadge, TonePill } from "@/components/ui/status-badge";
import { VersionUploader } from "@/components/review/version-uploader";
import { HistoryLedger, buildHistory } from "@/components/workspace/history";
import { Stage } from "@/components/workspace/stage";
import { Tabs, type TabSpec } from "@/components/workspace/tabs";
import { EvidenceForm, ResubmitPanel, type ChecklistItem } from "./client-remediation";
import { FindingsList, SeverityLegend } from "./findings-list";
import { AddFindingForm, CompleteReviewForm, RequestChangesForm, StartReviewForm } from "./review-panel";
import { EvidenceList } from "./review-history";
import { SubmissionForm } from "./submission-form";
import { SubmitPanel } from "./submit-panel";

/*
 * The review workspace for a client submission (workflow SUBMISSION_REVIEW),
 * Stage D layout:
 * - Left: the creative stage (large preview, version switcher, side-by-side
 *   compare), then, for the client, upload, then submission details and edit.
 * - Right: the one next action for this viewer, then Findings · Evidence ·
 *   History tabs (Findings first whenever findings need action).
 * Roles:
 * - CLIENT (owner): upload versions, edit the draft, choose markets and
 *   platforms, submit. When changes are requested: respond to each finding,
 *   add or withdraw evidence, upload a revised version and resubmit.
 * - TEAM: start review, record draft findings (team only), resolve or reopen
 *   findings the client responded to, request changes or complete the review.
 * Visibility is decided by the loaders (getSubmission, getSubmissionReview),
 * never here, and every control posts to a server action that re-checks it.
 */

type Target = { creativeId: string; roundId: string; versionId: string; versionNumber: number; roundNumber: number };

export async function SubmissionView({
  role,
  creativeId,
  versionNumber,
  compareWith,
  created,
}: {
  role: Role;
  creativeId: string;
  versionNumber?: number;
  compareWith?: number;
  created?: boolean;
}) {
  const user = await requireRole(role);
  const submission = await getSubmission(user, creativeId, versionNumber);
  if (!submission) notFound();

  const facts = { id: submission.id, workflow: "SUBMISSION_REVIEW" as const, status: submission.status, projectClientId: user.id };
  // Ownership is already enforced by getSubmission's scope; the policy decides what may be edited now.
  const editable = role === "CLIENT" && authorize(user, "EDIT_DRAFT", facts).ok;
  const canUpload = role === "CLIENT" && authorize(user, "UPLOAD_VERSION", facts).ok;
  const canSubmit = role === "CLIENT" && authorize(user, "SUBMIT", facts).ok;
  const canManageEvidence = role === "CLIENT" && authorize(user, "MANAGE_EVIDENCE", facts).ok;
  const [targeting, review] = await Promise.all([editable ? getTargetingOptions() : Promise.resolve(null), getSubmissionReview(user, submission.id)]);
  if (!review) notFound();

  const team = role === "TEAM";
  const inReview = team && submission.status === "IN_REVIEW";
  const target: Target | null =
    inReview && review.round && !review.round.hasDecision && review.cycle && !review.cycle.closedAt
      ? {
          creativeId: submission.id,
          roundId: review.round.id,
          versionId: review.round.versionId,
          versionNumber: review.round.versionNumber,
          roundNumber: review.round.number,
        }
      : null;
  const currentCycle = review.cycle?.number;
  const cycleFindings = review.findings.filter((f) => f.cycleNumber === currentCycle);
  const draftCount = cycleFindings.filter((f) => f.status === "DRAFT").length;
  const openCount = cycleFindings.filter((f) => f.status === "OPEN").length;
  const awaitingCount = cycleFindings.filter((f) => f.status === "RESPONDED").length;

  // Short labels for findings ("#2 Small-print legibility"), shared by evidence and the checklist.
  const findingLabels = new Map(review.findings.map((f, i) => [f.id, `#${i + 1} ${f.issue.length > 48 ? `${f.issue.slice(0, 47)}…` : f.issue}`]));
  const openInCycle = cycleFindings.filter((f) => f.status === "OPEN" || f.status === "RESPONDED");
  const remediation = role === "CLIENT" && submission.status === "CHANGES_REQUESTED" && review.readiness && currentCycle != null ? review.readiness : null;
  const checklist: ChecklistItem[] = remediation
    ? openInCycle.map((f) => {
        const missing = remediation.gaps.filter((g) => g.findingId === f.id).map((g) => g.missing);
        const needs = [
          "response",
          ...(f.requiredAction === "REVISE_CONTENT" ? ["revised version"] : []),
          ...(f.requiredAction === "PROVIDE_EVIDENCE" ? ["evidence"] : []),
        ].join(" + ");
        return { key: f.id, label: `${findingLabels.get(f.id)}: ${needs}`, done: missing.length === 0 };
      })
    : [];
  const activeEvidence = review.evidence.filter((e) => !e.withdrawn).map((e) => ({ id: e.id, label: e.title }));
  const defaultScope = [
    submission.markets.length ? `Markets: ${submission.markets.map((m) => m.name).join(", ")}.` : "",
    submission.platforms.length ? `Platforms: ${submission.platforms.map((p) => p.name).join(", ")}.` : "",
    review.round ? `Reviewed V${review.round.versionNumber}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const base = basePathFor(role);
  const format = FORMATS[submission.format];
  const finalDecision = review.decisions.find((d) => d.kind === "FINAL");

  // ---- Tabs ----------------------------------------------------------------
  const actionable = (team && (inReview || awaitingCount > 0)) || (remediation !== null && openInCycle.length > 0);
  const findingsTab: TabSpec = {
    id: "findings",
    label: "Findings",
    count: review.findings.length,
    content: (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-small text-muted">
            {team
              ? draftCount + openCount + awaitingCount > 0 || inReview
                ? [draftCount ? `${draftCount} draft (team only)` : null, `${openCount} open`, awaitingCount ? `${awaitingCount} awaiting your decision` : null].filter(Boolean).join(" · ")
                : `${pluralize(review.findings.length, "finding")} · ${review.findings.filter((f) => f.status === "RESOLVED").length} resolved`
              : remediation
                ? "Each finding says what's needed. Answer every one, then resubmit."
                : review.findings.length
                  ? "Issues the Clyntique reviewer raised, and how each was settled."
                  : "No findings have been shared with you."}
          </p>
          {review.findings.length > 0 && <SeverityLegend />}
        </div>
        {review.findings.length ? (
          <FindingsList
            findings={review.findings}
            role={role}
            editable={inReview}
            reviewingCycle={target ? (currentCycle ?? null) : null}
            respond={remediation && currentCycle != null ? { cycle: currentCycle, gaps: remediation.gaps, evidence: activeEvidence } : null}
            evidence={review.evidence}
            markets={submission.markets}
            platforms={submission.platforms}
          />
        ) : (
          inReview && (
            <p className="text-small rounded-md border border-dashed border-line-strong px-4 py-4 text-muted">
              No findings yet. Add one for each issue, or complete the review with “No issues identified”.
            </p>
          )
        )}
        {inReview && <AddFindingForm creativeId={submission.id} markets={submission.markets} platforms={submission.platforms} />}
      </div>
    ),
  };
  const evidenceTab: TabSpec = {
    id: "evidence",
    label: "Evidence",
    count: review.evidence.length,
    content: (
      <div className="flex flex-col gap-4">
        {canManageEvidence && (
          <p className="text-small text-muted">Supporting material for your claims. You can withdraw an item until you submit; after that it stays in the record.</p>
        )}
        <EvidenceList evidence={review.evidence} role={role} findingLabels={findingLabels} />
        {canManageEvidence && (
          <EvidenceForm
            creativeId={submission.id}
            configured={uploadsConfigured()}
            findings={remediation ? openInCycle.map((f) => ({ id: f.id, label: findingLabels.get(f.id) ?? f.issue })) : []}
          />
        )}
      </div>
    ),
  };
  const history = buildHistory({ versions: submission.versions, rounds: review.rounds, decisions: review.decisions, findings: review.findings, evidence: review.evidence, role });
  const historyTab: TabSpec = {
    id: "history",
    label: "History",
    count: history.length,
    content: <HistoryLedger entries={history} showDisclaimer={Boolean(finalDecision)} />,
  };
  const defaultTab = actionable ? "findings" : canManageEvidence && submission.status === "DRAFT" ? "evidence" : review.findings.length ? "findings" : "history";

  // ---- Header context --------------------------------------------------------
  // TEAM sees the last submission time, never the submission's "updated" time
  // (which would hint at private client work in progress).
  const lastRound = review.rounds[0];
  const headerMeta = [
    team ? `${submission.project.clientName} — ${submission.project.name}` : submission.project.name,
    `${format.label} · ${format.ratio}`,
    lastRound
      ? `${lastRound.number > 1 ? "Resubmitted" : "Submitted"} ${formatRelative(lastRound.submittedAt).toLowerCase()}`
      : team
        ? null
        : `Updated ${formatRelative(submission.updatedAt).toLowerCase()}`,
  ].filter(Boolean);

  return (
    <div data-wide className="flex min-w-0 flex-col">
      <Breadcrumb
        trail={[
          { label: "Projects", href: `${base}/projects` },
          { label: submission.project.name, href: `${base}/projects/${submission.project.id}` },
        ]}
        current={submission.name}
      />
      <header className="mb-6 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-page-title min-w-0 text-balance break-words text-ink">{submission.name}</h1>
          <StatusBadge status={submission.status} label={statusLabel(role, submission.status)} />
          {review.round && <span className="text-record text-muted">R{review.round.number} · V{review.round.versionNumber}</span>}
        </div>
        <p className="text-small flex flex-wrap gap-x-2 text-muted">
          {headerMeta.map((m, i) => (
            <span key={i}>
              {i > 0 && <span className="mr-2 text-faint">·</span>}
              {m}
            </span>
          ))}
        </p>
      </header>

      {created && (
        <p role="status" className="text-small mb-4 rounded-md bg-positive-soft px-4 py-2.5 text-positive-ink">
          Draft created. Upload your creative file, check the details, then submit it for review.
        </p>
      )}

      {/*
        Stacked (phones, tablets): stage, then the next action and tabs, then
        upload and details. Two columns from xl: stage and details on the left,
        the review panel on the right spanning both rows.
      */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:grid-rows-[auto_1fr] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* The creative */}
        <div className="min-w-0 xl:col-start-1 xl:row-start-1">
          <Stage submission={submission} rounds={review.rounds} role={role} base={base} compareWith={compareWith} />
        </div>

        {/* Review panel: next action, then the tabs */}
        <aside aria-label="Review" className="flex min-w-0 flex-col gap-5 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <section aria-label="Next step" className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
            <NextActionContent
              role={role}
              submission={submission}
              review={review}
              target={target}
              counts={{ drafts: draftCount, open: openCount, awaiting: awaitingCount }}
              defaultScope={defaultScope}
              checklist={checklist}
              canSubmit={canSubmit}
              finalDecision={finalDecision}
            />
          </section>
          <Tabs label="Review details" defaultId={defaultTab} tabs={[findingsTab, evidenceTab, historyTab]} />
        </aside>

        {/* Upload and details */}
        <div className="flex min-w-0 flex-col gap-6 self-start xl:col-start-1 xl:row-start-2">

          {canUpload && (
            <Card id="upload" className="scroll-mt-6 p-5">
              <h2 className="text-section-title text-ink">{remediation ? "Upload a revised version" : submission.current ? "Upload a new version" : "Upload the creative"}</h2>
              <p className="text-small mt-0.5 mb-4 text-muted">
                {remediation && submission.current
                  ? `Adds V${submission.current.versionNumber + 1} for your resubmission. The reviewer sees it when you resubmit. Earlier versions are kept.`
                  : submission.current
                    ? `Adds V${submission.current.versionNumber + 1}. Earlier versions are kept.`
                    : "Image (JPEG, PNG, WebP) or video (MP4, WebM)."}
              </p>
              <VersionUploader
                creativeId={submission.id}
                nextVersion={(submission.current?.versionNumber ?? 0) + 1}
                limits={getUploadLimits()}
                configured={uploadsConfigured()}
                isDraft
                doneHint={remediation ? "Answer the findings, then resubmit." : "Submit it for review when everything is ready."}
                notesHint="Shown to the reviewer next to this version."
              />
            </Card>
          )}

          <Card className="p-5">
            <h2 className="text-section-title mb-4 text-ink">Submission details</h2>
            <Details submission={submission} />
            {editable && targeting && (
              <details className="group mt-5 border-t border-line pt-4" open={!submission.current}>
                <summary className="text-small flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-brand-700">
                  Edit details
                  <span className="text-caption font-normal text-muted group-open:hidden">
                    Title, description, context{submission.status === "DRAFT" ? ", markets and platforms" : ""}
                  </span>
                </summary>
                <div className="mt-4">
                  <SubmissionForm
                    mode="edit"
                    creativeId={submission.id}
                    targetingEditable={submission.status === "DRAFT"}
                    markets={targeting.markets}
                    platforms={targeting.platforms}
                    initial={{
                      name: submission.name,
                      description: submission.description ?? "",
                      context: submission.context ?? "",
                      format: submission.format,
                      markets: submission.markets.map((m) => m.code),
                      platforms: submission.platforms.map((p) => p.code),
                    }}
                  />
                </div>
              </details>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Role-appropriate wording for the header status pill (undefined: the standard label). */
function statusLabel(role: Role, status: SubmissionDetail["status"]): string | undefined {
  const labels: Partial<Record<SubmissionDetail["status"], string>> =
    role === "CLIENT"
      ? { DRAFT: "Draft", SUBMITTED: "With Clyntique", IN_REVIEW: "Being reviewed", CHANGES_REQUESTED: "Your changes needed", REVIEW_COMPLETE: "Done" }
      : { SUBMITTED: "Waiting for review", CHANGES_REQUESTED: "Waiting on client" };
  return labels[status];
}

function NextTitle({ title, detail }: { title: string; detail?: ReactNode }) {
  return (
    <div>
      <h2 className="text-section-title text-ink">{title}</h2>
      {detail && <p className="text-small mt-0.5 text-muted">{detail}</p>}
    </div>
  );
}

/** A collapsible form inside the next-action block; the summary is the button. */
function ActionDisclosure({ label, primary, children }: { label: string; primary?: boolean; children: ReactNode }) {
  return (
    <details className="group rounded-md border border-line open:border-line-strong">
      <summary
        className={
          "text-small flex h-9 cursor-pointer list-none items-center justify-between rounded-md px-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 group-open:rounded-b-none " +
          (primary ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-surface text-ink hover:bg-subtle")
        }
      >
        {label}
        <span aria-hidden className="text-caption transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="p-3">{children}</div>
    </details>
  );
}

function NextActionContent({
  role,
  submission,
  review,
  target,
  counts,
  defaultScope,
  checklist,
  canSubmit,
  finalDecision,
}: {
  role: Role;
  submission: SubmissionDetail;
  review: SubmissionReview;
  target: Target | null;
  counts: { drafts: number; open: number; awaiting: number };
  defaultScope: string;
  checklist: ChecklistItem[];
  canSubmit: boolean;
  finalDecision: SubmissionReview["decisions"][number] | undefined;
}) {
  const round = review.round;
  const lastRound = review.rounds[0];
  const lastRequest = review.decisions.find((d) => d.kind === "CHANGES_REQUESTED");

  if (submission.status === "REVIEW_COMPLETE") {
    return (
      <>
        <div className="flex flex-wrap items-center gap-2">
          <TonePill tone="positive">{finalDecision?.outcome ? REVIEW_OUTCOME_LABEL[finalDecision.outcome] : "Review complete"}</TonePill>
          {finalDecision && (
            <span className="text-record text-muted">
              R{finalDecision.roundNumber} · V{finalDecision.versionNumber}
            </span>
          )}
        </div>
        <NextTitle title="Review complete" detail={finalDecision?.outcome ? REVIEW_OUTCOME_DESCRIPTION[finalDecision.outcome] : undefined} />
        {finalDecision && <p className="text-small break-words whitespace-pre-line text-ink-soft">{finalDecision.summary}</p>}
        <p className="text-caption rounded-md bg-subtle px-3 py-2 text-muted">{REVIEW_DISCLAIMER}</p>
      </>
    );
  }

  if (role === "TEAM") {
    if (submission.status === "SUBMITTED") {
      return (
        <>
          <NextTitle
            title="Ready for review"
            detail={
              round
                ? `${round.number > 1 ? "Resubmitted" : "Submitted"} · round ${round.number} · V${round.versionNumber}${round.number > 1 ? ". Use Compare to see what changed." : ""}`
                : undefined
            }
          />
          <StartReviewForm creativeId={submission.id} />
        </>
      );
    }
    if (submission.status === "IN_REVIEW" && target) {
      const blocking = counts.awaiting
        ? `${pluralize(counts.awaiting, "finding")} ${counts.awaiting === 1 ? "awaits" : "await"} your decision before you can request changes.`
        : counts.drafts
          ? `${pluralize(counts.drafts, "draft finding")} will be shared when you request changes.`
          : counts.open
            ? `${pluralize(counts.open, "finding")} open.`
            : "No findings yet.";
      const canRequest = counts.awaiting === 0 && counts.drafts + counts.open > 0;
      return (
        <>
          <NextTitle title={`Reviewing round ${target.roundNumber} · V${target.versionNumber}`} detail={blocking} />
          <ActionDisclosure label="Request changes" primary={canRequest}>
            <RequestChangesForm target={target} drafts={counts.drafts} open={counts.open} awaiting={counts.awaiting} />
          </ActionDisclosure>
          {review.outcomes && (
            <ActionDisclosure label="Complete review" primary={!canRequest}>
              <CompleteReviewForm target={target} drafts={counts.drafts} availability={review.outcomes} defaultScope={defaultScope} />
            </ActionDisclosure>
          )}
          <p className="text-caption text-muted">Findings and decisions stay internal until you request changes or complete the review.</p>
        </>
      );
    }
    if (submission.status === "CHANGES_REQUESTED") {
      return (
        <NextTitle
          title="Waiting on the client"
          detail={`Changes requested${lastRequest ? ` ${formatRelative(lastRequest.createdAt).toLowerCase()}` : ""}. Their responses, evidence and any revised version appear here when they resubmit.`}
        />
      );
    }
    return <NextTitle title="In review" />;
  }

  // CLIENT
  if (submission.status === "DRAFT") {
    return (
      <>
        <NextTitle title={canSubmit ? "Ready to submit?" : "Draft"} detail="Only you can see this draft until you submit it." />
        {canSubmit && (
          <SubmitPanel
            creativeId={submission.id}
            readiness={{ file: Boolean(submission.current), market: submission.markets.length > 0, platform: submission.platforms.length > 0 }}
          />
        )}
      </>
    );
  }
  if (submission.status === "CHANGES_REQUESTED" && round) {
    const done = checklist.filter((c) => c.done).length;
    return (
      <>
        <NextTitle
          title="Your changes needed"
          detail={`The reviewer asked for changes on V${lastRequest?.versionNumber ?? round.versionNumber}. ${done} of ${checklist.length} ${checklist.length === 1 ? "finding is" : "findings are"} ready.`}
        />
        {lastRequest && (
          <blockquote className="text-small rounded-md border-l-2 border-attention-solid bg-attention-soft/60 px-3 py-2 break-words whitespace-pre-line text-ink-soft">
            {lastRequest.summary}
          </blockquote>
        )}
        <ResubmitPanel creativeId={submission.id} items={checklist} nextRound={round.number + 1} />
      </>
    );
  }
  return (
    <NextTitle
      title={submission.status === "IN_REVIEW" ? "Being reviewed" : "With Clyntique"}
      detail={
        submission.status === "IN_REVIEW"
          ? "A Clyntique reviewer is looking at it now. If they ask for changes, the findings will appear here."
          : `${lastRound && lastRound.number > 1 ? "Resubmitted" : "Submitted"}${lastRound ? ` ${formatRelative(lastRound.submittedAt).toLowerCase()}` : ""}. It's waiting for a reviewer.`
      }
    />
  );
}

function Details({ submission }: { submission: SubmissionDetail }) {
  const empty = <span className="text-faint">Not chosen yet</span>;
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      <div>
        <dt className="text-label mb-1">Target markets</dt>
        <dd className="text-small text-ink">{submission.markets.length ? submission.markets.map((m) => m.name).join(", ") : empty}</dd>
      </div>
      <div>
        <dt className="text-label mb-1">Advertising platforms</dt>
        <dd className="text-small text-ink">{submission.platforms.length ? submission.platforms.map((p) => p.name).join(", ") : empty}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-label mb-1">Campaign context</dt>
        <dd className="text-body break-words whitespace-pre-line text-ink-soft">{submission.context || <span className="text-faint">None provided</span>}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-label mb-1">Description</dt>
        <dd className="text-body break-words whitespace-pre-line text-ink-soft">{submission.description || <span className="text-faint">None provided</span>}</dd>
      </div>
      <p className="text-caption text-muted sm:col-span-2">
        Markets and platforms describe where the ad will run, as context for the review. They don&apos;t imply approval by any regulator or platform.
      </p>
    </dl>
  );
}
