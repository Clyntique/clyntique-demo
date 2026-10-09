import Link from "next/link";
import { notFound } from "next/navigation";
import type { ApprovalStatus, Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";
import { getCreativeReview, type CreativeReview, type ReviewVersion, type ThreadEntry } from "@/lib/data/review";
import { cn } from "@/lib/cn";
import { FORMATS } from "@/lib/creative-format";
import { formatRelative, requestTime } from "@/lib/format";
import { formatBytes, getUploadLimits } from "@/lib/media";
import { basePathFor, ROLE_LABEL } from "@/lib/navigation";
import { uploadsConfigured } from "@/lib/review/blob";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { ExternalLinkIcon, FileIcon, LayersIcon, MessageIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { REVIEW_STATE } from "@/components/workspace/copy";
import type { SearchParams } from "@/components/views/projects-view";
import { EVIDENCE_TYPES } from "./evidence-types";
import { MediaFallback, MediaPreview } from "./media-preview";
import { AddEvidence, CommentForm, DecisionPanel, DetailsForm, EditEvidence, ShareForm } from "./review-forms";
import { VersionUploader } from "./version-uploader";
import { SubmissionView } from "@/components/submissions/submission-view";

/*
 * The LEGACY creative review page (pre-compliance workflow), shared by both roles:
 * - TEAM: upload versions, share drafts, manage evidence and details, reply.
 * - CLIENT: preview, read evidence and context, comment, approve or request changes.
 * Access comes from getCreativeReview, which applies the same scope as every
 * other workspace query; the actions re-check it on every submit.
 */

const DECISION_LABEL: Record<ApprovalStatus, string> = {
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
};

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(date: Date) {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function CreativeReviewView({
  role,
  params,
  searchParams,
}: {
  role: Role;
  params: Promise<{ creativeId: string }>;
  searchParams: SearchParams;
}) {
  const user = await requireRole(role);
  const [{ creativeId }, { v, created }] = await Promise.all([params, searchParams]);
  const requested = typeof v === "string" && /^\d{1,4}$/.test(v) ? Number(v) : undefined;

  // Scoped lookup: a client gets a 404 for drafts and for other clients' work.
  const review = await getCreativeReview(user, creativeId, requested);
  if (!review) notFound();
  // Client-owned submissions have their own page; this view stays for legacy records.
  if (review.workflow === "SUBMISSION_REVIEW") {
    return <SubmissionView role={role} creativeId={review.id} versionNumber={requested} created={created === "1"} />;
  }

  const now = requestTime();
  const team = role === "TEAM";
  const base = basePathFor(role);
  const { current, selected } = review;
  const viewingOld = Boolean(selected && current && selected.id !== current.id);
  const awaitingClient = review.status === "IN_REVIEW" && current !== null;
  const format = FORMATS[review.format];

  return (
    <>
      <Breadcrumb
        trail={[
          { label: "Projects", href: `${base}/projects` },
          { label: review.project.name, href: `${base}/projects/${review.project.id}` },
        ]}
        current={review.name}
      />

      <PageHeader
        title={review.name}
        description={
          <>
            {team && <span className="font-medium text-ink-soft">{review.project.clientName} — </span>}
            {review.project.name}
          </>
        }
        action={
          team && review.status === "DRAFT" && current ? (
            <ShareForm creativeId={review.id} versionNumber={current.versionNumber} />
          ) : team && review.status !== "ARCHIVED" ? (
            <a href="#upload" className={buttonClasses({ variant: current ? "secondary" : "primary" })}>
              {current ? "Upload new version" : "Upload file"}
            </a>
          ) : undefined
        }
      />

      <div className="-mt-4 mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-meta">
        <StatusBadge status={review.status} />
        {current ? (
          <Badge tone="brand">V{current.versionNumber} current</Badge>
        ) : (
          <Badge>No file yet</Badge>
        )}
        <span>
          {format.label} · {format.ratio}
        </span>
        {current?.mediaType && <span>{current.mediaType === "VIDEO" ? "Video" : "Image"}</span>}
        <span>Updated {formatRelative(review.updatedAt, now).toLowerCase()}</span>
      </div>

      {team && created === "1" && (
        <p role="status" className="mb-3 rounded-md bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-800 ring-1 ring-emerald-200 ring-inset">
          Creative created as a draft.
        </p>
      )}
      <StatusBanner review={review} role={role} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <section aria-label="Creative preview" className="flex flex-col gap-3">
            {viewingOld && selected && current && (
              <p className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-subtle px-4 py-2.5 text-[13px] text-ink-soft">
                <span>
                  You&apos;re viewing <strong className="font-semibold text-ink">V{selected.versionNumber}</strong>, an
                  earlier version. V{current.versionNumber} is current.
                </span>
                <Link href={`${base}/creatives/${review.id}`} className="font-medium text-brand-700 hover:underline">
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
                  format={review.format}
                  label={`${review.name}, version ${selected.versionNumber}`}
                />
              ) : selected ? (
                <MediaFallback title="This version has no previewable file." />
              ) : (
                <div className="bg-subtle">
                  <MediaFallback
                    title="No file uploaded yet."
                    description={team ? "Upload the creative below to start the review." : "The team hasn't uploaded a file yet."}
                  />
                </div>
              )}
              {selected && <VersionFooter version={selected} now={now} />}
            </Card>
          </section>

          {!team && awaitingClient && current && (
            <Card className="border-brand-200 p-5">
              <SectionHeader
                title={viewingOld ? `V${current.versionNumber} needs your decision` : `Your decision on V${current.versionNumber}`}
                description="Approve it as it is, or tell the team what to change."
                className="mb-4"
              />
              {viewingOld ? (
                <Link href={`${base}/creatives/${review.id}`} className={buttonClasses({ size: "sm" })}>
                  Review V{current.versionNumber}
                </Link>
              ) : (
                <DecisionPanel creativeId={review.id} versionId={current.id} versionNumber={current.versionNumber} />
              )}
            </Card>
          )}

          <section className="flex flex-col gap-4" aria-labelledby="feedback-heading">
            <div>
              <h2 id="feedback-heading" className="text-section-title">
                Feedback{selected ? ` on V${selected.versionNumber}` : ""}
              </h2>
              <p className="text-meta mt-0.5">
                {team ? "Comments and client decisions for this version." : "Questions and comments for the team."}
              </p>
            </div>
            {selected ? (
              <>
                <Thread entries={review.thread} now={now} />
                <Card className="p-4">
                  <CommentForm
                    creativeId={review.id}
                    versionId={selected.id}
                    versionNumber={selected.versionNumber}
                    placeholder={team ? "Reply to the client or add a note…" : "Ask a question or leave feedback for the team…"}
                  />
                </Card>
              </>
            ) : (
              <p className="text-meta">Feedback opens once a file is uploaded.</p>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <Card className="p-5">
            <SectionHeader title="Versions" className="mb-3" />
            {review.versions.length ? (
              <VersionHistory review={review} base={base} now={now} />
            ) : (
              <p className="text-meta">No versions yet.</p>
            )}
          </Card>

          {team && review.status !== "ARCHIVED" && (
            <Card id="upload" className="scroll-mt-6 p-5">
              <SectionHeader
                title={current ? "Upload a new version" : "Upload the creative"}
                description={
                  current
                    ? review.status === "DRAFT"
                      ? `Adds V${current.versionNumber + 1}. The client sees it once you share the creative.`
                      : `Adds V${current.versionNumber + 1} and sends it to the client for review. Earlier versions and decisions are kept.`
                    : "The file the client will review."
                }
                className="mb-4"
              />
              <VersionUploader
                creativeId={review.id}
                nextVersion={(current?.versionNumber ?? 0) + 1}
                limits={getUploadLimits()}
                configured={uploadsConfigured()}
                isDraft={review.status === "DRAFT"}
              />
            </Card>
          )}

          <Card className="p-5">
            <SectionHeader title="Evidence & context" className="mb-3" />
            <EvidencePanel review={review} team={team} />
          </Card>

          {team && (
            <Card className="p-5">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between text-section-title">
                  Creative details
                  <span className="text-meta font-normal group-open:hidden">Edit</span>
                </summary>
                <div className="mt-4">
                  <DetailsForm creative={review} />
                </div>
              </details>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}

function StatusBanner({ review, role }: { review: CreativeReview; role: Role }) {
  const current = review.current;
  let message: string;
  let tone = "bg-subtle text-ink-soft";

  if (role === "TEAM") {
    if (review.status === "DRAFT") {
      message = current
        ? `Draft. Only your team can see it. Share V${current.versionNumber} when it's ready for the client.`
        : "Draft. Only your team can see it. Upload the file, add evidence, then share it for review.";
    } else if (review.status === "IN_REVIEW") {
      message = current
        ? `V${current.versionNumber} is with the client for review.`
        : "Shared with the client, but no file is uploaded yet. Upload one so they can review it.";
      tone = "bg-sky-50 text-sky-900";
    } else if (review.status === "CHANGES_REQUESTED") {
      message = "The client requested changes. Address the feedback and upload a new version.";
      tone = "bg-amber-50 text-amber-900";
    } else if (review.status === "APPROVED") {
      message = `The client approved V${current?.versionNumber ?? "?"}. Uploading a new version sends it back for review.`;
      tone = "bg-emerald-50 text-emerald-900";
    } else {
      message = REVIEW_STATE.TEAM[review.status];
    }
  } else {
    if (review.status === "IN_REVIEW" && current) {
      message = `V${current.versionNumber} is ready for your review.`;
      tone = "bg-brand-50 text-brand-900";
    } else if (review.status === "IN_REVIEW") {
      message = "The team is preparing the file for this creative.";
    } else if (review.status === "CHANGES_REQUESTED") {
      message = "You requested changes. The team is working on the next version.";
      tone = "bg-amber-50 text-amber-900";
    } else if (review.status === "APPROVED") {
      message = `You approved V${current?.versionNumber ?? "?"}.`;
      tone = "bg-emerald-50 text-emerald-900";
    } else {
      message = REVIEW_STATE.CLIENT[review.status];
    }
  }

  return (
    <p role="status" className={cn("mb-6 rounded-md px-4 py-2.5 text-[13px]", tone)}>
      {message}
    </p>
  );
}

function VersionFooter({ version, now }: { version: ReviewVersion; now: number }) {
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

function VersionHistory({ review, base, now }: { review: CreativeReview; base: string; now: number }) {
  return (
    <ol className="flex flex-col gap-1">
      {review.versions.map((version) => {
        const isCurrent = version.id === review.current?.id;
        const isSelected = version.id === review.selected?.id;
        const href = isCurrent ? `${base}/creatives/${review.id}` : `${base}/creatives/${review.id}?v=${version.versionNumber}`;
        return (
          <li key={version.id}>
            <Link
              href={href}
              scroll={false}
              aria-current={isSelected ? "page" : undefined}
              className={cn(
                "flex flex-col gap-1 rounded-md px-3 py-2.5 transition-colors",
                isSelected ? "bg-brand-50 ring-1 ring-brand-200 ring-inset" : "hover:bg-subtle",
              )}
            >
              <span className="flex items-center gap-2">
                <span className="text-card-title tabular-nums">V{version.versionNumber}</span>
                {isCurrent && <Badge tone="brand">Current</Badge>}
                {version.decision && (
                  <Badge
                    className={
                      version.decision.status === "APPROVED"
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-amber-50 text-amber-800"
                    }
                  >
                    {DECISION_LABEL[version.decision.status]}
                  </Badge>
                )}
                <span className="text-meta ml-auto shrink-0">{formatRelative(version.createdAt, now)}</span>
              </span>
              {version.changeNotes && <span className="text-meta line-clamp-2">{version.changeNotes}</span>}
              <span className="text-meta inline-flex items-center gap-1">
                <MessageIcon className="size-3" /> {version.commentCount}
                <span className="mx-1 text-faint">·</span>
                {version.createdByName}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function Thread({ entries, now }: { entries: ThreadEntry[]; now: number }) {
  if (!entries.length) {
    return (
      <p className="text-meta flex items-center gap-2 rounded-md border border-dashed border-line-strong px-4 py-6">
        <LayersIcon className="size-4" /> No feedback on this version yet.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-3">
      {entries.map((entry) =>
        entry.kind === "comment" ? (
          <li key={entry.id} className="flex gap-3">
            <Avatar name={entry.authorName} size="sm" className="mt-0.5" />
            <div className="min-w-0 flex-1 rounded-md border border-line bg-surface px-4 py-3 shadow-card">
              <p className="text-meta mb-1">
                <span className="font-medium text-ink">{entry.authorName}</span>
                <span className="mx-1.5 text-faint">·</span>
                {ROLE_LABEL[entry.authorRole]}
                <span className="mx-1.5 text-faint">·</span>
                <time dateTime={entry.createdAt.toISOString()} title={formatDateTime(entry.createdAt)}>
                  {formatRelative(entry.createdAt, now)}
                </time>
              </p>
              <p className="text-body break-words whitespace-pre-line text-ink">{entry.content}</p>
            </div>
          </li>
        ) : (
          <li
            key={entry.id}
            className={cn(
              "rounded-md px-4 py-3 ring-1 ring-inset",
              entry.status === "APPROVED" ? "bg-emerald-50 ring-emerald-200" : "bg-amber-50 ring-amber-200",
            )}
          >
            <p className={cn("text-card-title", entry.status === "APPROVED" ? "text-emerald-900" : "text-amber-900")}>
              {entry.authorName} {entry.status === "APPROVED" ? "approved this version" : "requested changes"}
              <span className="text-meta ml-2 font-normal">{formatDateTime(entry.createdAt)}</span>
            </p>
            {entry.reason && <p className="text-body mt-1 break-words whitespace-pre-line text-ink">{entry.reason}</p>}
          </li>
        ),
      )}
    </ol>
  );
}

function EvidencePanel({ review, team }: { review: CreativeReview; team: boolean }) {
  const hasContext = Boolean(review.context || review.description);
  return (
    <div className="flex flex-col gap-5">
      {hasContext ? (
        <div className="flex flex-col gap-3">
          {review.context && (
            <div>
              <h3 className="text-label mb-1">Campaign context</h3>
              <p className="text-body whitespace-pre-line text-ink-soft">{review.context}</p>
            </div>
          )}
          {review.description && (
            <div>
              <h3 className="text-label mb-1">About this creative</h3>
              <p className="text-body whitespace-pre-line text-ink-soft">{review.description}</p>
            </div>
          )}
        </div>
      ) : (
        !team && <p className="text-meta">The team hasn&apos;t added campaign context yet.</p>
      )}

      {review.evidence.length > 0 && (
        <ul className="flex flex-col divide-y divide-line border-t border-line">
          {review.evidence.map((item) => (
            <li key={item.id} className="py-4 first:pt-4 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="outline">{EVIDENCE_TYPES[item.type]}</Badge>
                {item.date && <span className="text-meta">{formatDate(item.date)}</span>}
              </div>
              <h3 className="text-card-title mt-1.5 break-words">{item.title}</h3>
              {item.description && (
                <p className="text-body mt-1 break-words whitespace-pre-line text-ink-soft">{item.description}</p>
              )}
              {(item.source || item.url) && (
                <p className="text-meta mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {item.source && <span>Source: {item.source}</span>}
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"
                    >
                      {hostOf(item.url)} <ExternalLinkIcon className="size-3" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  )}
                </p>
              )}
              {team && (
                <EditEvidence
                  creativeId={review.id}
                  evidence={{
                    id: item.id,
                    title: item.title,
                    type: item.type,
                    description: item.description,
                    source: item.source,
                    url: item.url,
                    date: item.date ? item.date.toISOString().slice(0, 10) : null,
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {!team && review.evidence.length === 0 && hasContext && (
        <p className="text-meta">No supporting evidence added yet.</p>
      )}
      {team && <AddEvidence creativeId={review.id} hasEvidence={review.evidence.length > 0} />}
    </div>
  );
}
