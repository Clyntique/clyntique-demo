import type { CreativeFormat } from "@/generated/prisma/enums";
import type { RoundView } from "@/lib/data/submission-review";
import { REVIEW_OUTCOME_LABEL } from "@/lib/workflow/labels";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MediaFallback, MediaPreview } from "@/components/review/media-preview";

// Side-by-side comparison of the previous round's version and the version
// resubmitted now (TEAM, from round 2). Read-only: both files are served
// through /api/media, which re-checks access.

function formatDateTime(date: Date) {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function CompareRounds({ rounds, format, name }: { rounds: RoundView[]; format: CreativeFormat; name: string }) {
  const [current, previous] = rounds;
  if (!current || !previous) return null;
  const sameFile = current.version.id === previous.version.id;

  return (
    <section aria-labelledby="compare-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="compare-heading" className="text-section-title">
          Compare rounds
        </h2>
        <p className="text-meta mt-0.5">
          Round {previous.number} (V{previous.version.number}) against the resubmitted round {current.number} (V{current.version.number}).
        </p>
      </div>
      {sameFile && (
        <p className="rounded-md bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
          The client resubmitted without a new version: both rounds show V{current.version.number}.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[previous, current].map((r, i) => (
          <Card key={r.id} className="flex min-w-0 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
              <span className="text-card-title">
                Round {r.number} · V{r.version.number}
              </span>
              {i === 1 ? (
                <Badge tone="brand">Under review</Badge>
              ) : r.decision ? (
                <Badge className="bg-amber-50 text-amber-800">
                  {r.decision.kind === "FINAL" && r.decision.outcome ? REVIEW_OUTCOME_LABEL[r.decision.outcome] : "Changes requested"}
                </Badge>
              ) : null}
            </div>
            {r.version.mediaType ? (
              <MediaPreview src={`/api/media/${r.version.id}`} mediaType={r.version.mediaType} format={format} label={`${name}, version ${r.version.number}`} />
            ) : (
              <div className="bg-subtle">
                <MediaFallback title="No preview." description="This version has no file." />
              </div>
            )}
            <div className="flex flex-col gap-1.5 border-t border-line px-4 py-3">
              <p className="text-meta">
                {i === 0 ? "Submitted" : "Resubmitted"} by {r.submittedByName} · <time dateTime={r.submittedAt.toISOString()}>{formatDateTime(r.submittedAt)}</time>
              </p>
              {r.version.changeNotes && (
                <p className="text-body break-words whitespace-pre-line text-ink-soft">
                  <span className="text-label mr-2">Version notes</span>
                  {r.version.changeNotes}
                </p>
              )}
              {r.note && (
                <p className="text-body break-words whitespace-pre-line text-ink-soft">
                  <span className="text-label mr-2">Note to reviewer</span>
                  {r.note}
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
