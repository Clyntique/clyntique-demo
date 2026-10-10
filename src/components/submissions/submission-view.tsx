import Link from "next/link";
import { notFound } from "next/navigation";
import type { CreativeStatus, Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";
import { getSubmission, getTargetingOptions, type SubmissionDetail, type SubmissionVersion } from "@/lib/data/submission";
import { getSubmissionReview, type SubmissionReview } from "@/lib/data/submission-review";
import { cn } from "@/lib/cn";
import { FORMATS } from "@/lib/creative-format";
import { formatRelative, requestTime } from "@/lib/format";
import { formatBytes, getUploadLimits } from "@/lib/media";
import { basePathFor } from "@/lib/navigation";
import { uploadsConfigured } from "@/lib/review/blob";
import { authorize } from "@/lib/workflow/policy";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, SectionHeader } from "@/components/ui/card";
import { CheckIcon, FileIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { MediaFallback, MediaPreview } from "@/components/review/media-preview";
import { VersionUploader } from "@/components/review/version-uploader";
import { REVIEW_OUTCOME_LABEL } from "@/lib/workflow/labels";
import { FindingsList, SeverityLegend } from "./findings-list";
import { AddFindingForm, CompleteReviewForm, RequestChangesForm, StartReviewForm } from "./review-panel";
import { DecisionHistory, EvidenceList } from "./review-history";
import { SubmissionForm } from "./submission-form";
import { SubmitPanel } from "./submit-panel";

/*
 * Detail page for a client submission (workflow SUBMISSION_REVIEW).
 * - CLIENT (owner): upload versions, edit the draft, choose markets and
 *   platforms, submit. Read-only once submitted.
 * - TEAM: reviews submitted work: start review, record draft findings (team
 *   only), request changes or complete the review with an outcome. Never sees
 *   client drafts (getSubmission uses the shared scope).
 * - Findings reach the CLIENT only after the team requests changes or
 *   completes the review; getSubmissionReview filters them in the query.
 * Every control here is backed by a server action that re-checks authorization.
 */

function formatDateTime(date: Date) {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export async function SubmissionView({
  role,
  creativeId,
  versionNumber,
  created,
}: {
  role: Role;
  creativeId: string;
  versionNumber?: number;
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
  const [targeting, review] = await Promise.all([editable ? getTargetingOptions() : Promise.resolve(null), getSubmissionReview(user, submission.id)]);
  if (!review) notFound();

  const team = role === "TEAM";
  const inReview = team && submission.status === "IN_REVIEW";
  const target =
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
  const openCount = cycleFindings.filter((f) => f.status === "OPEN" || f.status === "RESPONDED").length;
  const showFindings = inReview || review.findings.length > 0;
  const defaultScope = [
    submission.markets.length ? `Markets: ${submission.markets.map((m) => m.name).join(", ")}.` : "",
    submission.platforms.length ? `Platforms: ${submission.platforms.map((p) => p.name).join(", ")}.` : "",
    review.round ? `Reviewed V${review.round.versionNumber}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const now = requestTime();
  const base = basePathFor(role);
  const { current, selected } = submission;
  const viewingOld = Boolean(selected && current && selected.id !== current.id);
  const format = FORMATS[submission.format];

  return (
    <>
      <Breadcrumb
        trail={[
          { label: "Projects", href: `${base}/projects` },
          { label: submission.project.name, href: `${base}/projects/${submission.project.id}` },
        ]}
        current={submission.name}
      />
      <PageHeader
        title={submission.name}
        description={
          <>
            {role === "TEAM" && <span className="font-medium text-ink-soft">{submission.project.clientName} — </span>}
            {submission.project.name}
          </>
        }
      />

      <div className="-mt-4 mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-meta">
        <StatusBadge status={submission.status} />
        {current ? <Badge tone="brand">V{current.versionNumber} current</Badge> : <Badge>No file yet</Badge>}
        <span>
          {format.label} · {format.ratio}
        </span>
        <span>Updated {formatRelative(submission.updatedAt, now).toLowerCase()}</span>
      </div>

      {created && (
        <p role="status" className="mb-3 rounded-md bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-800 ring-1 ring-emerald-200 ring-inset">
          Draft created. Upload your creative file, check the details, then submit it for review.
        </p>
      )}

      <Progress status={submission.status} />
      <StatusBanner submission={submission} role={role} review={review} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <section aria-label="Creative preview" className="flex flex-col gap-3">
            {viewingOld && selected && current && (
              <p className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-subtle px-4 py-2.5 text-[13px] text-ink-soft">
                <span>
                  You&apos;re viewing <strong className="font-semibold text-ink">V{selected.versionNumber}</strong>, an earlier
                  version. V{current.versionNumber} is current.
                </span>
                <Link href={`${base}/creatives/${submission.id}`} className="font-medium text-brand-700 hover:underline">
                  View current version
                </Link>
              </p>
            )}
            <Card className="overflow-hidden">
              {selected?.mediaType ? (
                <MediaPreview
                  key={selected.id}
                  src={`/api/media/${selected.id}`}
                  mediaType={selected.mediaType}
                  format={submission.format}
                  label={`${submission.name}, version ${selected.versionNumber}`}
                />
              ) : (
                <div className="bg-subtle">
                  <MediaFallback
                    title="No file uploaded yet."
                    description={canUpload ? "Upload the creative file to continue." : "The creative file hasn't been uploaded yet."}
                  />
                </div>
              )}
              {selected && <VersionFooter version={selected} now={now} />}
            </Card>
          </section>

          <Card className="p-5">
            <SectionHeader title="Submission details" className="mb-4" />
            <Details submission={submission} />
          </Card>

          {showFindings && (
            <section aria-labelledby="findings-heading" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id="findings-heading" className="text-section-title">
                    Findings
                  </h2>
                  <p className="text-meta mt-0.5">
                    {team
                      ? draftCount
                        ? `${draftCount} draft (team only) · ${openCount} shared and open`
                        : `${openCount} shared and open`
                      : "Issues raised by the Clyntique reviewer, and what each one needs from you."}
                  </p>
                </div>
                <SeverityLegend />
              </div>
              {review.findings.length ? (
                <FindingsList findings={review.findings} role={role} editable={inReview} markets={submission.markets} platforms={submission.platforms} />
              ) : (
                <p className="text-meta rounded-md border border-dashed border-line-strong px-4 py-5">
                  No findings yet. Add a finding for each issue, or complete the review with “No issues identified”.
                </p>
              )}
              {inReview && <AddFindingForm creativeId={submission.id} markets={submission.markets} platforms={submission.platforms} />}
            </section>
          )}

          {submission.status !== "DRAFT" && (
            <Card className="p-5">
              <SectionHeader title="Evidence" className="mb-3" />
              <EvidenceList evidence={review.evidence} role={role} />
            </Card>
          )}

          {editable && targeting && (
            <Card className="p-5">
              <details className="group" open={!current}>
                <summary className="flex cursor-pointer list-none items-center justify-between text-section-title">
                  Edit details
                  <span className="text-meta font-normal group-open:hidden">Edit</span>
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
            </Card>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          {team && submission.status === "SUBMITTED" && (
            <Card className="border-brand-200 p-5">
              <SectionHeader
                title="Ready for review"
                description={review.round ? `Round ${review.round.number} · V${review.round.versionNumber}` : undefined}
                className="mb-4"
              />
              <StartReviewForm creativeId={submission.id} />
            </Card>
          )}

          {target && (
            <>
              <Card className="p-5">
                <SectionHeader title="Request changes" description="Shares the findings with the client and asks for a revision." className="mb-4" />
                <RequestChangesForm target={target} drafts={draftCount} open={openCount} />
              </Card>
              {review.outcomes && (
                <Card className="p-5">
                  <SectionHeader title="Complete review" description="Records the internal outcome for this version." className="mb-4" />
                  <CompleteReviewForm target={target} drafts={draftCount} availability={review.outcomes} defaultScope={defaultScope} />
                </Card>
              )}
            </>
          )}

          {review.decisions.length > 0 && (
            <Card className="p-5">
              <SectionHeader title="Review decisions" className="mb-3" />
              <DecisionHistory decisions={review.decisions} role={role} />
            </Card>
          )}

          {canSubmit && (
            <Card className="border-brand-200 p-5">
              <SectionHeader title="Ready to submit?" description="Everything below is needed before review." className="mb-4" />
              <SubmitPanel
                creativeId={submission.id}
                readiness={{ file: Boolean(current), market: submission.markets.length > 0, platform: submission.platforms.length > 0 }}
              />
            </Card>
          )}

          {canUpload && (
            <Card id="upload" className="scroll-mt-6 p-5">
              <SectionHeader
                title={current ? "Upload a new version" : "Upload the creative"}
                description={current ? `Adds V${current.versionNumber + 1}. Earlier versions are kept.` : "Image (JPEG, PNG, WebP) or video (MP4, WebM)."}
                className="mb-4"
              />
              <VersionUploader
                creativeId={submission.id}
                nextVersion={(current?.versionNumber ?? 0) + 1}
                limits={getUploadLimits()}
                configured={uploadsConfigured()}
                isDraft
                doneHint="Submit it for review when everything is ready."
                notesHint="Shown to the reviewer next to this version."
              />
            </Card>
          )}

          <Card className="p-5">
            <SectionHeader title="Versions" className="mb-3" />
            {submission.versions.length ? (
              <VersionList submission={submission} base={base} now={now} />
            ) : (
              <p className="text-meta">No versions yet.</p>
            )}
          </Card>

          {submission.rounds.length > 0 && (
            <Card className="p-5">
              <SectionHeader title="Submission history" className="mb-3" />
              <ol className="flex flex-col gap-2.5">
                {submission.rounds.map((r) => (
                  <li key={`${r.number}-${r.submittedAt.toISOString()}`} className="text-[13px]">
                    <p className="text-ink">
                      {r.number === 1 ? "Submitted" : `Resubmitted (round ${r.number})`} · V{r.versionNumber}
                    </p>
                    <p className="text-meta">
                      {r.submittedByName} · <time dateTime={r.submittedAt.toISOString()}>{formatDateTime(r.submittedAt)}</time>
                    </p>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

const STEPS: { label: string; statuses: CreativeStatus[] }[] = [
  { label: "Draft", statuses: ["DRAFT"] },
  { label: "Submitted", statuses: ["SUBMITTED"] },
  { label: "In review", statuses: ["IN_REVIEW", "CHANGES_REQUESTED"] },
  { label: "Review complete", statuses: ["REVIEW_COMPLETE"] },
];

function Progress({ status }: { status: CreativeStatus }) {
  const at = Math.max(0, STEPS.findIndex((s) => s.statuses.includes(status)));
  return (
    <ol aria-label="Submission progress" className="mb-4 grid grid-cols-4 gap-2">
      {STEPS.map((step, i) => {
        const done = i < at;
        const currentStep = i === at;
        const label = currentStep && status === "CHANGES_REQUESTED" ? "Changes requested" : step.label;
        return (
          <li key={step.label} aria-current={currentStep ? "step" : undefined} className="flex flex-col gap-1.5">
            <span className={cn("h-1 rounded-full", done || currentStep ? "bg-brand-600" : "bg-subtle", currentStep && status === "CHANGES_REQUESTED" && "bg-amber-500")} />
            <span className={cn("flex items-center gap-1 text-[12px]", currentStep ? "font-medium text-ink" : done ? "text-ink-soft" : "text-faint")}>
              {done && <CheckIcon className="size-3 text-brand-600" />}
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StatusBanner({ submission, role, review }: { submission: SubmissionDetail; role: Role; review: SubmissionReview }) {
  const submitted = submission.submittedAt ? formatDateTime(submission.submittedAt) : null;
  const final = review.decisions.find((d) => d.kind === "FINAL" && d.outcome);
  const outcome = final?.outcome ? `Outcome: ${REVIEW_OUTCOME_LABEL[final.outcome]}.` : "";
  const messages: Record<Role, Partial<Record<CreativeStatus, string>>> = {
    CLIENT: {
      DRAFT: "Private draft. Only you can see it until you submit it.",
      SUBMITTED: `Submitted${submitted ? ` on ${submitted}` : ""}. It's waiting for the Clyntique team to review it.`,
      IN_REVIEW: "The Clyntique team is reviewing this submission.",
      CHANGES_REQUESTED: "The reviewer requested changes. Each finding below says what's needed.",
      REVIEW_COMPLETE: `The internal review is complete. ${outcome}`.trim(),
    },
    TEAM: {
      SUBMITTED: `Submitted by ${submission.createdByName ?? submission.project.clientName}${submitted ? ` on ${submitted}` : ""}. Waiting for review.`,
      IN_REVIEW: review.round
        ? `In review: round ${review.round.number}, V${review.round.versionNumber}. Findings stay internal until you request changes or complete the review.`
        : "In review.",
      CHANGES_REQUESTED: "Changes requested. Waiting for the client's revision.",
      REVIEW_COMPLETE: `Review complete. ${outcome}`.trim(),
    },
  };
  const tone: Partial<Record<CreativeStatus, string>> = {
    SUBMITTED: "bg-violet-50 text-violet-900",
    IN_REVIEW: "bg-sky-50 text-sky-900",
    CHANGES_REQUESTED: "bg-amber-50 text-amber-900",
    REVIEW_COMPLETE: "bg-teal-50 text-teal-900",
  };
  const message = messages[role][submission.status];
  if (!message) return null;
  return (
    <p role="status" className={cn("mb-6 rounded-md px-4 py-2.5 text-[13px]", tone[submission.status] ?? "bg-subtle text-ink-soft")}>
      {message}
    </p>
  );
}

function Details({ submission }: { submission: SubmissionDetail }) {
  const empty = <span className="text-faint">Not chosen yet</span>;
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      <div>
        <dt className="text-label mb-1">Target markets</dt>
        <dd className="flex flex-wrap gap-1.5">
          {submission.markets.length ? submission.markets.map((m) => <Badge key={m.code} tone="outline">{m.name}</Badge>) : empty}
        </dd>
      </div>
      <div>
        <dt className="text-label mb-1">Advertising platforms</dt>
        <dd className="flex flex-wrap gap-1.5">
          {submission.platforms.length ? submission.platforms.map((p) => <Badge key={p.code} tone="outline">{p.name}</Badge>) : empty}
        </dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-label mb-1">Campaign context</dt>
        <dd className="text-body whitespace-pre-line text-ink-soft">{submission.context || <span className="text-faint">None provided</span>}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-label mb-1">Description</dt>
        <dd className="text-body whitespace-pre-line text-ink-soft">{submission.description || <span className="text-faint">None provided</span>}</dd>
      </div>
      <p className="text-meta sm:col-span-2">
        Markets and platforms describe where the ad will run, as context for the review. They don&apos;t imply approval by any regulator or platform.
      </p>
    </dl>
  );
}

function VersionFooter({ version, now }: { version: SubmissionVersion; now: number }) {
  return (
    <div className="flex flex-col gap-2 border-t border-line px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-ink-soft">
          <FileIcon className="size-3.5 shrink-0" />
          <span className="truncate">{version.fileName ?? `Version ${version.versionNumber}`}</span>
        </span>
        {version.sizeBytes != null && <span>{formatBytes(version.sizeBytes)}</span>}
        <span>
          V{version.versionNumber} uploaded by {version.createdByName} · {formatRelative(version.createdAt, now).toLowerCase()}
        </span>
      </div>
      {version.changeNotes && (
        <p className="text-body whitespace-pre-line text-ink-soft">
          <span className="text-label mr-2">Notes</span>
          {version.changeNotes}
        </p>
      )}
    </div>
  );
}

function VersionList({ submission, base, now }: { submission: SubmissionDetail; base: string; now: number }) {
  return (
    <ol className="flex flex-col gap-1">
      {submission.versions.map((version) => {
        const isCurrent = version.id === submission.current?.id;
        const isSelected = version.id === submission.selected?.id;
        const href = isCurrent ? `${base}/creatives/${submission.id}` : `${base}/creatives/${submission.id}?v=${version.versionNumber}`;
        return (
          <li key={version.id}>
            <Link
              href={href}
              scroll={false}
              aria-current={isSelected ? "page" : undefined}
              className={cn("flex flex-col gap-1 rounded-md px-3 py-2.5 transition-colors", isSelected ? "bg-brand-50 ring-1 ring-brand-200 ring-inset" : "hover:bg-subtle")}
            >
              <span className="flex items-center gap-2">
                <span className="text-card-title tabular-nums">V{version.versionNumber}</span>
                {isCurrent && <Badge tone="brand">Current</Badge>}
                <span className="text-meta ml-auto shrink-0">{formatRelative(version.createdAt, now)}</span>
              </span>
              {version.changeNotes && <span className="text-meta line-clamp-2">{version.changeNotes}</span>}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
