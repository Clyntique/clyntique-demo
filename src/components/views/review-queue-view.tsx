import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { getReviewQueue, type QueueItem } from "@/lib/data/review-queue";
import { cn } from "@/lib/cn";
import { formatRelative, requestTime } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { LayersIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/states";
import { CreativeThumb } from "@/components/workspace/creative-card";

// TEAM: client submissions waiting for, or in, internal review. Oldest first,
// so nothing waits longest by accident. Client drafts never appear here.

export async function ReviewQueueView() {
  const user = await requireRole("TEAM");
  const queue = await getReviewQueue(user);
  const now = requestTime();
  const waiting = queue.filter((q) => q.status === "SUBMITTED");
  const inReview = queue.filter((q) => q.status === "IN_REVIEW");

  return (
    <>
      <PageHeader title="Review queue" description="Client submissions waiting for, or in, internal review. Oldest submission first." />
      {queue.length ? (
        <div className="flex flex-col gap-10">
          <QueueSection title="Waiting for review" empty="Nothing is waiting. New submissions appear here." items={waiting} now={now} />
          <QueueSection title="In review" empty="No reviews in progress." items={inReview} now={now} />
        </div>
      ) : (
        <EmptyState icon={<LayersIcon />} title="The review queue is clear." description="Client submissions appear here as soon as they are submitted for review." />
      )}
    </>
  );
}

function QueueSection({ title, empty, items, now }: { title: string; empty: string; items: QueueItem[]; now: number }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="text-section-title">
        {title} <span className="text-meta ml-1 font-normal tabular-nums">{items.length}</span>
      </h2>
      {items.length ? (
        <Card className="divide-y divide-line">
          {items.map((item) => (
            <QueueRow key={item.id} item={item} now={now} />
          ))}
        </Card>
      ) : (
        <p className="text-meta">{empty}</p>
      )}
    </section>
  );
}

export function QueueRow({ item, now, compact = false }: { item: QueueItem; now: number; compact?: boolean }) {
  const targets = [...item.markets, ...item.platforms];
  return (
    <Link href={`/admin/creatives/${item.id}`} className="flex items-center gap-4 p-3 pr-5 transition-colors hover:bg-canvas/60">
      <CreativeThumb creative={item} className="size-14 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="text-card-title truncate">{item.name}</p>
        <p className="text-meta mt-0.5 truncate">
          {item.clientName} — {item.projectName}
        </p>
        {!compact && targets.length > 0 && <p className="text-meta mt-1 truncate">{targets.join(" · ")}</p>}
      </div>
      <div className="hidden shrink-0 flex-col items-end gap-1 text-right sm:flex">
        <span
          className={cn(
            "inline-flex h-5 items-center rounded-sm px-1.5 text-[11px] font-medium",
            item.status === "SUBMITTED" ? "bg-violet-50 text-violet-800" : "bg-sky-50 text-sky-800",
          )}
        >
          {item.status === "SUBMITTED" ? "Waiting" : "In review"}
          {item.status === "IN_REVIEW" && item.draftFindings > 0 && ` · ${item.draftFindings} draft finding${item.draftFindings === 1 ? "" : "s"}`}
        </span>
        <span className="text-meta">
          {item.roundNumber > 1 ? `Resubmitted (round ${item.roundNumber})` : "Submitted"} · V{item.versionNumber} · {formatRelative(item.submittedAt, now)}
        </span>
      </div>
    </Link>
  );
}
