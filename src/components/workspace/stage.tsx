"use client";

import Link from "next/link";
import { useState } from "react";
import type { CreativeFormat, Role } from "@/generated/prisma/enums";
import type { SubmissionDetail, SubmissionVersion } from "@/lib/data/submission";
import type { RoundView } from "@/lib/data/submission-review";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { formatBytes } from "@/lib/media";
import { REVIEW_OUTCOME_LABEL } from "@/lib/workflow/labels";
import { MediaFallback, MediaPreview } from "@/components/review/media-preview";
import { TonePill, type Tone } from "@/components/ui/status-badge";
import { LayersIcon } from "@/components/ui/icons";

/*
 * The creative stage: the visual centerpiece of the review workspace.
 * Features:
 * - Clear version timeline track and compare switcher.
 * - Version & review context labels displayed cleanly OUTSIDE the creative artwork.
 * - Full desktop side-by-side comparison layout.
 * - Mobile Quick-Flip toggle to alternate between versions at full phone width.
 * - Preserves original aspect ratios and links for server shareability.
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
  const [mobileCompareSide, setMobileCompareSide] = useState<"left" | "right">("right");

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
  const rightContext = right ? versionContext(right, rounds, role) : null;
  const leftContext = left ? versionContext(left, rounds, role) : null;

  return (
    <section aria-label="Creative preview" className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
      {/* Top Toolbar: Version Track & Compare Action */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 border-b border-line bg-canvas px-4 py-3 sm:px-5">
        {versions.length > 0 ? (
          <nav aria-label="Versions" className="flex flex-wrap items-center gap-2.5">
            <span className="text-eyebrow">Version Timeline</span>
            <ol className="flex flex-wrap overflow-hidden rounded-lg border border-line-strong bg-surface shadow-xs">
              {[...versions].reverse().map((v) => {
                const on = v.id === right?.id;
                const isCurrent = v.id === current?.id;
                return (
                  <li key={v.id} className="border-l border-line first:border-l-0">
                    <Link
                      href={href({ v: v.versionNumber, compare: left ? left.versionNumber : undefined })}
                      scroll={false}
                      aria-current={on ? "page" : undefined}
                      className={cn(
                        "text-record flex h-8 items-center gap-1.5 px-3 transition-colors",
                        on ? "bg-ink font-semibold text-white" : "text-ink-soft hover:bg-subtle",
                      )}
                    >
                      <span>V{v.versionNumber}</span>
                      {isCurrent && (
                        <span className={cn("text-micro rounded px-1 py-0.5", on ? "bg-gold-500 font-semibold text-ink" : "bg-gold-100 text-gold-700")}>
                          Current
                        </span>
                      )}
                      <span className="sr-only">{isCurrent ? " (current)" : ""}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : (
          <span className="text-caption text-muted">No file uploaded yet</span>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {right && defaultLeft && (
            <Link
              href={left ? href({ v: right.versionNumber }) : href({ v: right.versionNumber, compare: defaultLeft })}
              scroll={false}
              aria-pressed={Boolean(left)}
              className={cn(
                "text-small inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 font-medium transition-colors shadow-xs",
                left ? "border-ink bg-ink text-white hover:bg-brand-700" : "border-line-strong bg-surface text-ink hover:bg-subtle",
              )}
            >
              <LayersIcon className="size-3.5 text-gold-500" />
              <span>{left ? "Exit compare" : "Compare"}</span>
            </Link>
          )}
        </div>
      </div>

      {/* Compare Sub-Toolbar (When Compare is active) */}
      {left && right && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line bg-surface px-4 py-2.5 sm:px-5">
          <nav aria-label="Compare with" className="flex items-center gap-2">
            <span className="text-caption font-medium text-muted">Compared with:</span>
            <ol className="flex overflow-hidden rounded-md border border-line-strong bg-surface shadow-xs">
              {versions
                .filter((o) => o.id !== right.id)
                .reverse()
                .map((o) => (
                  <li key={o.id} className="border-l border-line first:border-l-0">
                    <Link
                      href={href({ v: right.versionNumber, compare: o.versionNumber })}
                      scroll={false}
                      aria-current={o.id === left.id ? "true" : undefined}
                      className={cn(
                        "text-record flex h-7 items-center px-2.5 transition-colors",
                        o.id === left.id ? "bg-brand-600 font-semibold text-white" : "text-ink-soft hover:bg-subtle",
                      )}
                    >
                      V{o.versionNumber}
                    </Link>
                  </li>
                ))}
            </ol>
          </nav>

          {/* Mobile Quick-Flip segmented toggle (< 640px) */}
          <div className="flex sm:hidden items-center gap-1 rounded-md border border-line-strong bg-canvas p-0.5">
            <button
              type="button"
              onClick={() => setMobileCompareSide("left")}
              className={cn(
                "text-caption px-2.5 py-1 rounded font-medium transition-colors",
                mobileCompareSide === "left" ? "bg-ink font-semibold text-white shadow-xs" : "text-muted hover:text-ink",
              )}
            >
              Earlier (V{left.versionNumber})
            </button>
            <button
              type="button"
              onClick={() => setMobileCompareSide("right")}
              className={cn(
                "text-caption px-2.5 py-1 rounded font-medium transition-colors",
                mobileCompareSide === "right" ? "bg-ink font-semibold text-white shadow-xs" : "text-muted hover:text-ink",
              )}
            >
              Selected (V{right.versionNumber})
            </button>
          </div>
        </div>
      )}

      {/* Single View: Context Bar placed cleanly OUTSIDE the creative artwork */}
      {right && !left && rightContext && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/90 px-4 py-2 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-record font-semibold text-ink">Version {right.versionNumber}</span>
            <TonePill tone={rightContext.tone}>{rightContext.label}</TonePill>
            <span className="text-caption text-muted">{rightContext.detail}</span>
          </div>
          {right.fileName && (
            <span className="text-record text-muted truncate max-w-xs">{right.fileName}</span>
          )}
        </div>
      )}

      {/* Canvas Area: Centerpiece Studio Stage */}
      {!right ? (
        <div className="bg-stage">
          <MediaFallback
            title="No file uploaded yet."
            description={role === "CLIENT" ? "Upload the creative file to continue." : "The creative file hasn't been uploaded yet."}
          />
        </div>
      ) : left ? (
        <>
          {/* Desktop Compare: True Side-by-Side with aligned headers and footers */}
          <div className="hidden sm:grid sm:grid-cols-2 bg-stage divide-x divide-line">
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

          {/* Mobile Compare: Quick-Flip View (Displays one version at full device width) */}
          <div className="block sm:hidden bg-stage">
            {mobileCompareSide === "left" && leftContext ? (
              <CompareSide
                version={left}
                context={leftContext}
                name={submission.name}
                format={submission.format}
                side="Earlier"
                isMobileFull
              />
            ) : rightContext ? (
              <CompareSide
                version={right}
                context={rightContext}
                name={submission.name}
                format={submission.format}
                side="Selected"
                isMobileFull
              />
            ) : null}
          </div>
        </>
      ) : (
        /* Single View: Clean studio canvas with zero floating badge occlusion */
        <div className="relative bg-stage p-4 sm:p-6 flex items-center justify-center">
          {right.mediaType ? (
            <MediaPreview
              key={right.id}
              size="stage"
              src={`/api/media/${right.id}`}
              mediaType={right.mediaType}
              format={submission.format}
              label={`${submission.name}, version ${right.versionNumber}`}
            />
          ) : (
            <MediaFallback title="This version has no file." />
          )}
        </div>
      )}

      {/* Technical File Details Strip for the selected version */}
      {right && !left && (
        <div className="flex flex-col gap-2 border-t border-line bg-canvas px-4 py-3 sm:px-5">
          <p className="text-caption flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
            <span className="font-medium text-ink-soft">{right.fileName ?? `Version ${right.versionNumber}`}</span>
            {right.sizeBytes != null && <span>{formatBytes(right.sizeBytes)}</span>}
            <span>
              Uploaded by {right.createdByName} · {formatRelative(right.createdAt).toLowerCase()}
            </span>
          </p>
          {right.changeNotes && (
            <p className="text-small rounded-md bg-surface p-2.5 border border-line break-words whitespace-pre-line text-ink-soft">
              <span className="text-label font-medium mr-2 text-ink">What changed in this version:</span>
              {right.changeNotes}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function CompareSide({
  version,
  context,
  name,
  format,
  side,
  isMobileFull = false,
}: {
  version: SubmissionVersion;
  context: Context;
  name: string;
  format: CreativeFormat;
  side: string;
  isMobileFull?: boolean;
}) {
  return (
    <figure className={cn("flex flex-col min-w-0 bg-surface", !isMobileFull && "h-full")}>
      <figcaption className="flex min-h-11 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-line bg-canvas px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-caption font-semibold uppercase tracking-wider text-muted">{side}</span>
          <span className="text-record font-semibold text-ink">V{version.versionNumber}</span>
          <TonePill tone={context.tone}>{context.label}</TonePill>
        </div>
        <span className="text-caption text-muted">{context.detail}</span>
      </figcaption>

      <div className="flex-1 bg-stage p-3 sm:p-5 flex items-center justify-center">
        {version.mediaType ? (
          <MediaPreview
            key={version.id}
            size={isMobileFull ? "stage" : "compare"}
            src={`/api/media/${version.id}`}
            mediaType={version.mediaType}
            format={format}
            label={`${name}, version ${version.versionNumber}`}
          />
        ) : (
          <MediaFallback title="This version has no file." />
        )}
      </div>

      <div className="border-t border-line bg-canvas px-4 py-3 text-xs space-y-1.5">
        <p className="text-caption text-muted">
          Uploaded by {version.createdByName} · {formatRelative(version.createdAt).toLowerCase()}
        </p>
        <p className="text-small rounded bg-surface p-2 border border-line break-words whitespace-pre-line text-ink-soft">
          <span className="text-label font-medium mr-1.5 text-ink">Revision notes:</span>
          {version.changeNotes || <span className="text-muted">No notes provided for this version.</span>}
        </p>
      </div>
    </figure>
  );
}
