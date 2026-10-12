import { requireRole } from "@/lib/auth/dal";
import { getReviewQueue, type QueueItem } from "@/lib/data/review-queue";
import { cn } from "@/lib/cn";
import { formatRelative, pluralize, requestTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { ListGroup, ListRow } from "@/components/ui/list-group";
import { TonePill } from "@/components/ui/status-badge";
import { CreativeThumb } from "@/components/workspace/creative-card";

// TEAM: client submissions waiting for, or in, internal review. Oldest first,
// so nothing waits longest by accident. Client drafts never appear here.

const DAY = 24 * 60 * 60 * 1000;

export async function ReviewQueueView() {
  const user = await requireRole("TEAM");
  const queue = await getReviewQueue(user);
  const now = requestTime();
  const waiting = queue.filter((q) => q.status === "SUBMITTED");
  const inReview = queue.filter((q) => q.status === "IN_REVIEW");

  return (
    <>
      <PageHeader
        title="Review queue"
        description={
          waiting.length
            ? `${pluralize(waiting.length, "submission")} waiting, oldest first. ${pluralize(inReview.length, "review")} in progress.`
            : "Client submissions waiting for, or in, internal review, oldest first."
        }
      />
      <div className="flex flex-col gap-6">
        <ListGroup title="Waiting for review" count={waiting.length} meta="Oldest first" empty="Nothing is waiting. New submissions appear here as soon as they're submitted.">
          {waiting.map((item, i) => (
            <QueueRow key={item.id} item={item} now={now} next={i === 0} />
          ))}
        </ListGroup>
        <ListGroup title="In review" count={inReview.length} empty="No reviews in progress.">
          {inReview.map((item) => (
            <QueueRow key={item.id} item={item} now={now} />
          ))}
        </ListGroup>
      </div>
    </>
  );
}

export function QueueRow({ item, now, next = false }: { item: QueueItem; now: number; next?: boolean }) {
  const targets = [...item.markets, ...item.platforms];
  const late = now - item.submittedAt.getTime() > 2 * DAY;
  return (
    <ListRow
      href={`/admin/creatives/${item.id}`}
      thumb={<CreativeThumb creative={item} fill className="h-14 w-11 shrink-0 rounded-sm" />}
      title={item.name}
      subtitle={
        <>
          {item.clientName} — {item.projectName}
          {targets.length > 0 && <span className="max-sm:hidden"> · {targets.join(", ")}</span>}
          {item.status === "IN_REVIEW" && item.draftFindings > 0 && ` · ${pluralize(item.draftFindings, "draft finding")}`}
        </>
      }
      aside={
        <span className="flex flex-col items-end gap-1">
          {next ? <TonePill tone="accent">Next</TonePill> : null}
          <span className={cn("text-record whitespace-nowrap", late ? "text-attention-ink" : "text-muted")}>
            {item.roundNumber > 1 ? `Resubmitted · R${item.roundNumber}` : "Submitted"} · V{item.versionNumber} · {formatRelative(item.submittedAt, now)}
          </span>
        </span>
      }
    />
  );
}
