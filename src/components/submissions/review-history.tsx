import type { Role } from "@/generated/prisma/enums";
import type { DecisionView, EvidenceView } from "@/lib/data/submission-review";
import {
  EVIDENCE_ASSESSMENT_LABEL,
  EVIDENCE_ASSESSMENT_NOTICE,
  REVIEW_DISCLAIMER,
  REVIEW_OUTCOME_DESCRIPTION,
  REVIEW_OUTCOME_LABEL,
} from "@/lib/workflow/labels";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/media";
import { Badge } from "@/components/ui/badge";
import { ExternalLinkIcon, FileIcon } from "@/components/ui/icons";
import { EVIDENCE_TYPES } from "@/components/review/evidence-types";
import { WithdrawEvidenceForm } from "./client-remediation";
import { AssessEvidenceForm } from "./assess-evidence-form";

// Decision history and evidence for a submission (both roles). The controls
// are withdrawing evidence (client) and assessing it (team), each offered
// only when the loader says it's allowed.
// The data is already filtered for the viewer by getSubmissionReview.

function formatDateTime(date: Date) {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function DecisionHistory({ decisions, role }: { decisions: DecisionView[]; role: Role }) {
  if (!decisions.length) return <p className="text-meta">No decisions recorded yet.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {decisions.map((d) => (
        <li key={d.id} className="rounded-md border border-line px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {d.kind === "FINAL" && d.outcome ? (
              <Badge className="bg-positive-soft text-positive-ink">{REVIEW_OUTCOME_LABEL[d.outcome]}</Badge>
            ) : (
              <Badge className="bg-attention-soft text-attention-ink">Changes requested</Badge>
            )}
            <span className="text-meta">
              V{d.versionNumber} · round {d.roundNumber}
            </span>
          </div>
          <p className="text-body mt-1.5 break-words whitespace-pre-line text-ink">{d.summary}</p>
          {d.kind === "FINAL" && d.outcome && <p className="text-meta mt-1">{REVIEW_OUTCOME_DESCRIPTION[d.outcome]}</p>}
          {d.scopeNote && (
            <p className="text-meta mt-1 break-words whitespace-pre-line">
              <span className="font-medium text-ink-soft">Scope:</span> {d.scopeNote}
            </p>
          )}
          <p className="text-meta mt-1.5">
            {role === "TEAM" ? d.reviewerName : "Clyntique reviewer"} · <time dateTime={d.createdAt.toISOString()}>{formatDateTime(d.createdAt)}</time>
          </p>
        </li>
      ))}
      {decisions.some((d) => d.kind === "FINAL") && <p className="text-meta">{REVIEW_DISCLAIMER}</p>}
    </ol>
  );
}

export function EvidenceList({
  evidence,
  role,
  findingLabels,
}: {
  evidence: EvidenceView[];
  role: Role;
  /** Finding id → short label ("#1 Unsupported claim"). */
  findingLabels: Map<string, string>;
}) {
  if (!evidence.length) {
    return (
      <p className="text-meta">
        {role === "TEAM" ? "The client hasn't supplied evidence for this submission." : "No evidence added yet."}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {evidence.map((e) => {
        const supports = e.findingIds.map((id) => findingLabels.get(id)).filter(Boolean);
        return (
          <li key={e.id} id={`evidence-${e.id}`} className={cn("scroll-mt-6 rounded-xl border border-line bg-surface p-4 sm:p-5 shadow-xs transition-shadow", e.withdrawn && "bg-subtle/60")}>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone="outline">{EVIDENCE_TYPES[e.type]}</Badge>
              {e.origin === "REVIEWER_ADDED" && <Badge>Added by reviewer</Badge>}
              {e.visibility === "INTERNAL" && role === "TEAM" && <Badge>Team only</Badge>}
              {e.submittedIn ? (
                <Badge tone="outline">
                  Submitted with cycle {e.submittedIn.cycleNumber}, round {e.submittedIn.roundNumber}
                </Badge>
              ) : (
                role === "CLIENT" && <Badge tone="outline">Not yet submitted</Badge>
              )}
              {e.versionNumber !== null && <Badge tone="outline">Added with V{e.versionNumber}</Badge>}
              {e.withdrawn && <Badge>Withdrawn</Badge>}
            </div>
            <p className={cn("text-card-title sm:text-body mt-1.5 font-semibold text-ink break-words", e.withdrawn && "line-through decoration-faint")}>{e.title}</p>
            {e.claimText && (
              <p className="text-small mt-1 break-words text-ink">
                <span className="font-medium text-ink-soft">Claim:</span> “{e.claimText}”
                {e.claimLocation && <span className="text-meta"> · {e.claimLocation}</span>}
              </p>
            )}
            {!e.claimText && e.claimLocation && <p className="text-meta mt-1">Location: {e.claimLocation}</p>}
            {e.description && <p className="text-small mt-1 break-words whitespace-pre-line text-ink-soft">{e.description}</p>}
            {e.file && (
              <a
                href={`/api/media/evidence/${e.id}`}
                target={e.file.isImage ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="text-small mt-2.5 inline-flex max-w-full items-center gap-2 rounded-lg border border-line-strong bg-canvas px-3 py-1.5 text-ink hover:bg-subtle transition-colors shadow-2xs"
              >
                <FileIcon className="size-3.5 shrink-0 text-muted" />
                <span className="truncate">{e.file.name}</span>
                {e.file.sizeBytes != null && <span className="text-meta shrink-0">{formatBytes(e.file.sizeBytes)}</span>}
                <span className="text-meta font-medium text-brand-700 shrink-0">{e.file.isImage ? "View" : "Download"}</span>
              </a>
            )}
            <p className="text-meta mt-1 flex flex-wrap items-center gap-x-2">
              {e.source && <span>Source: {e.source}</span>}
              {e.url && (
                <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                  Open link <ExternalLinkIcon className="size-3" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
              {e.addedByName && <span>Added by {e.addedByName}</span>}
              <time dateTime={e.createdAt.toISOString()}>{formatDateTime(e.createdAt)}</time>
            </p>
            {supports.length > 0 && <p className="text-meta mt-1">Supports: {supports.join(" · ")}</p>}
            {e.withdrawal && (
              <p className="text-meta mt-1">
                Withdrawn by {e.withdrawal.byName ?? "the client"} · <time dateTime={e.withdrawal.at.toISOString()}>{formatDateTime(e.withdrawal.at)}</time>
              </p>
            )}
            {e.withdrawable && (
              <div className="mt-2">
                <WithdrawEvidenceForm evidenceId={e.id} />
              </div>
            )}
            {e.assessments.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-micro mb-1.5 font-semibold tracking-wider text-muted uppercase">Reviewer assessment</p>
                <ol className="flex flex-col gap-2">
                  {e.assessments.map((a, i) => (
                    <li key={a.id} className={cn("text-small", i < e.assessments.length - 1 && "text-muted")}>
                      <span className="font-medium text-ink">{EVIDENCE_ASSESSMENT_LABEL[a.result]}</span>
                      {i < e.assessments.length - 1 && <span className="text-meta"> (superseded)</span>}
                      {a.note && <span className="block break-words whitespace-pre-line text-ink-soft">{a.note}</span>}
                      <span className="text-meta block">
                        {a.reviewerName} · cycle {a.cycleNumber} · <time dateTime={a.createdAt.toISOString()}>{formatDateTime(a.createdAt)}</time>
                      </span>
                    </li>
                  ))}
                </ol>
                <p className="text-caption mt-2 text-muted">{EVIDENCE_ASSESSMENT_NOTICE}</p>
              </div>
            )}
            {e.assessable && (
              <div className="mt-3">
                <AssessEvidenceForm evidenceId={e.id} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
