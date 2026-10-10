import type { Role } from "@/generated/prisma/enums";
import type { DecisionView, EvidenceView } from "@/lib/data/submission-review";
import { REVIEW_DISCLAIMER, REVIEW_OUTCOME_DESCRIPTION, REVIEW_OUTCOME_LABEL } from "@/lib/workflow/labels";
import { Badge } from "@/components/ui/badge";
import { ExternalLinkIcon } from "@/components/ui/icons";
import { EVIDENCE_TYPES } from "@/components/review/evidence-types";

// Decision history and evidence for a submission (read-only, both roles).
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
              <Badge className="bg-teal-50 text-teal-800">{REVIEW_OUTCOME_LABEL[d.outcome]}</Badge>
            ) : (
              <Badge className="bg-amber-50 text-amber-800">Changes requested</Badge>
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

export function EvidenceList({ evidence, role }: { evidence: EvidenceView[]; role: Role }) {
  if (!evidence.length) {
    return (
      <p className="text-meta">
        {role === "TEAM" ? "The client hasn't supplied evidence for this submission." : "No evidence added yet."}
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-line">
      {evidence.map((e) => (
        <li key={e.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="outline">{EVIDENCE_TYPES[e.type]}</Badge>
            {e.origin === "REVIEWER_ADDED" && <Badge>Added by reviewer</Badge>}
            {e.visibility === "INTERNAL" && role === "TEAM" && <Badge>Team only</Badge>}
            {e.withdrawn && <Badge>Withdrawn</Badge>}
          </div>
          <p className="text-card-title mt-1 break-words">{e.title}</p>
          {e.description && <p className="text-body mt-0.5 break-words whitespace-pre-line text-ink-soft">{e.description}</p>}
          <p className="text-meta mt-1 flex flex-wrap items-center gap-x-2">
            {e.source && <span>Source: {e.source}</span>}
            {e.url && (
              <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                Open link <ExternalLinkIcon className="size-3" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
            {e.addedByName && <span>Added by {e.addedByName}</span>}
          </p>
        </li>
      ))}
    </ul>
  );
}
