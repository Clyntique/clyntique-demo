import Link from "next/link";
import type { CreativeFormat, Role } from "@/generated/prisma/enums";
import type { SubmissionDetail, SubmissionVersion } from "@/lib/data/submission";
import type { RoundView } from "@/lib/data/submission-review";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { formatBytes } from "@/lib/media";
import { REVIEW_OUTCOME_LABEL } from "@/lib/workflow/labels";
import { MediaFallback, MediaPreview } from "@/components/review/media-preview";
import { TonePill, type Tone } from "@/components/ui/status-badge";

/*
 * The creative stage: the largest thing on the review workspace. A version
 * switcher and Compare live in its toolbar; Compare splits the stage into the
 * earlier version and the selected one, side by side (stacked on phones).
 * Only versions the viewer may see are passed in (the team never receives a
 * revision the client hasn't resubmitted). Links keep everything server-rendered
 * and shareable: ?v=<n> selects a version, ?compare=<n> sets the left side.
 */

type Context = { label: string; tone: Tone; detail: string };

/** What a version means in the review: which round it went in with, and how that round ended. */
function versionContext(v: SubmissionVersion, rounds: RoundView[], role: Role): Context {
  const round = [...rounds].reverse().find((r) => r.version.id === v.id);
  if (!round) {
    const submittedLater = rounds.some((r) => r.submittedAt > v.createdAt);
    return submittedLater
      ? { label: "Not submitted", tone: "neutral", detail: "Replaced before submission" }
      : { label: role === "CLIENT" ? "Not yet submitted" : "Draft", tone: "neutral", detail: role === "CLIENT" ? "Sent with your next resubmission" : "Not submitted" };
  }
  const d = round.decision;
  if (!d) return { label: "Under review", tone: "accent", detail: `Round ${round.number}` };
  if (d.kind === "FINAL") return { label: d.outcome ? REVIEW_OUTCOME_LABEL[d.outcome] : "Review complete", tone: "positive", detail: `Round ${round.number}` };
  return { label: "Changes requested", tone: "attention", detail: `Round ${round.number}` };
}

/** Default left side for Compare: the latest submitted version other than the one on the right, else the previous version. */
export function defaultCompareLeft(right: SubmissionVersion, versions: SubmissionVersion[], rounds: RoundView[]) {
  const submitted = rounds.map((r) => r.version.number).filter((n) => n !== right.versionNumber);
  const fromRounds = submitted.length ? Math.max(...submitted.filter((n) => n < right.versionNumber), 0) : 0;
  if (fromRounds) return fromRounds;
  return versions.find((v) => v.versionNumber < right.versionNumber)?.versionNumber ?? null;
}

export function Stage({
  submission,
  rounds,
  role,
  base,
  compareWith,
}: {
  submission: SubmissionDetail;
  rounds: RoundView[];
  role: Role;
  base: string;
  compareWith?: number;
}) {
  const { versions, current, selected } = submission;
  const href = (q: Record<string, number | undefined>) => {
    const params = new URLSearchParams();
    if (q.v && q.v !== current?.versionNumber) params.set("v", String(q.v));
    if (q.compare) params.set("compare", String(q.compare));
    const s = params.toString();
    return `${base}/creatives/${submission.id}${s ? `?${s}` : ""}`;
  };

  const right = selected ?? current;
  const left = compareWith && right ? versions.find((v) => v.versionNumber === compareWith && v.id !== right.id) : undefined;
  const defaultLeft = right ? defaultCompareLeft(right, versions, rounds) : null;

  return (
    <section aria-label="Creative preview" className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-stage">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line bg-canvas px-3 py-2 sm:px-4">
        {versions.length > 0 ? (
          <nav aria-label="Versions" className="flex min-w-0 items-center gap-2">
            <span className="text-caption text-muted max-sm:sr-only">Version</span>
            <ol className="flex flex-wrap overflow-hidden rounded-md border border-line-strong bg-surface">
              {[...versions].reverse().map((v) => {
                const on = v.id === right?.id;
                return (
                  <li key={v.id} className="border-l border-line first:border-l-0">
                    <Link
                      href={href({ v: v.versionNumber, compare: left ? left.versionNumber : undefined })}
                      scroll={false}
                      aria-current={on ? "page" : undefined}
                      className={cn("text-record flex h-7 items-center px-2.5 transition-colors", on ? "bg-ink text-white" : "text-ink-soft hover:bg-subtle")}
                    >
                      V{v.versionNumber}
                      <span className="sr-only">{v.id === current?.id ? " (current)" : ""}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : (
          <span className="text-caption text-muted">No file yet</span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {left && right && (
            <nav aria-label="Compare with" className="flex items-center gap-2">
              <span className="text-caption text-muted">Compared with</span>
              <ol className="flex overflow-hidden rounded-md border border-line-strong bg-surface">
                {versions
                  .filter((o) => o.id !== right.id)
                  .reverse()
                  .map((o) => (
                    <li key={o.id} className="border-l border-line first:border-l-0">
                      <Link
                        href={href({ v: right.versionNumber, compare: o.versionNumber })}
                        scroll={false}
                        aria-current={o.id === left.id ? "true" : undefined}
                        className={cn("text-record flex h-7 items-center px-2.5", o.id === left.id ? "bg-ink-soft text-white" : "text-ink-soft hover:bg-subtle")}
                      >
                        V{o.versionNumber}
                      </Link>
                    </li>
                  ))}
              </ol>
            </nav>
          )}
          {right && defaultLeft && (
            <Link
              href={left ? href({ v: right.versionNumber }) : href({ v: right.versionNumber, compare: defaultLeft })}
              scroll={false}
              aria-pressed={Boolean(left)}
              className={cn(
                "text-small inline-flex h-7 items-center rounded-md border px-2.5 font-medium transition-colors",
                left ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink hover:bg-subtle",
              )}
            >
              {left ? "Exit compare" : "Compare"}
            </Link>
          )}
        </div>
      </div>

      {/* Canvas */}
      {!right ? (
        <MediaFallback title="No file uploaded yet." description={role === "CLIENT" ? "Upload the creative file to continue." : "The creative file hasn't been uploaded yet."} />
      ) : left ? (
        <div className="grid grid-cols-2 grid-rows-[auto_1fr_auto]">
          {[left, right].map((v, i) => (
            <CompareSide
              key={v.id}
              version={v}
              context={versionContext(v, rounds, role)}
              name={submission.name}
              format={submission.format}
              side={i === 0 ? "Earlier" : "Selected"}
            />
          ))}
        </div>
      ) : (
        <div className="relative">
          <ContextBadge context={versionContext(right, rounds, role)} version={right} />
          {right.mediaType ? (
            <MediaPreview key={right.id} size="stage" src={`/api/media/${right.id}`} mediaType={right.mediaType} format={submission.format} label={`${submission.name}, version ${right.versionNumber}`} />
          ) : (
            <MediaFallback title="This version has no file." />
          )}
        </div>
      )}

      {/* File details for the selected version */}
      {right && !left && (
        <div className="flex flex-col gap-1.5 border-t border-line bg-canvas px-4 py-3">
          <p className="text-caption flex flex-wrap gap-x-3 gap-y-1 text-muted">
            <span className="min-w-0 truncate text-ink-soft">{right.fileName ?? `Version ${right.versionNumber}`}</span>
            {right.sizeBytes != null && <span>{formatBytes(right.sizeBytes)}</span>}
            <span>
              Uploaded by {right.createdByName} · {formatRelative(right.createdAt).toLowerCase()}
            </span>
          </p>
          {right.changeNotes && (
            <p className="text-small break-words whitespace-pre-line text-ink-soft">
              <span className="text-label mr-2">What changed</span>
              {right.changeNotes}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ContextBadge({ context, version }: { context: Context; version: SubmissionVersion }) {
  return (
    <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-md bg-surface/90 px-2 py-1 ring-1 ring-line backdrop-blur">
      <span className="text-record text-ink">V{version.versionNumber}</span>
      <TonePill tone={context.tone}>{context.label}</TonePill>
      <span className="text-caption text-muted max-sm:hidden">{context.detail}</span>
    </div>
  );
}

function CompareSide({
  version,
  context,
  name,
  format,
  side,
}: {
  version: SubmissionVersion;
  context: Context;
  name: string;
  format: CreativeFormat;
  side: string;
}) {
  return (
    <figure className="row-span-3 grid min-w-0 grid-rows-subgrid border-l border-line first:border-l-0">
      <figcaption className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-surface/70 px-3 py-2">
        <span className="text-caption text-muted max-sm:sr-only">{side}</span>
        <span className="text-record text-ink">V{version.versionNumber}</span>
        <TonePill tone={context.tone}>{context.label}</TonePill>
        <span className="text-caption text-muted max-sm:hidden">{context.detail}</span>
      </figcaption>
      {version.mediaType ? (
        <MediaPreview key={version.id} size="compare" src={`/api/media/${version.id}`} mediaType={version.mediaType} format={format} label={`${name}, version ${version.versionNumber}`} />
      ) : (
        <MediaFallback title="This version has no file." />
      )}
      <div className="border-t border-line bg-canvas px-3 py-2.5">
        <p className="text-caption text-muted">
          Uploaded by {version.createdByName} · {formatRelative(version.createdAt).toLowerCase()}
        </p>
        <p className="text-small mt-0.5 break-words whitespace-pre-line text-ink-soft">{version.changeNotes || <span className="text-faint">No notes for this version.</span>}</p>
      </div>
    </figure>
  );
}
