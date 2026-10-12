import type { ActivityType } from "@/generated/prisma/enums";
import type { ActivityItem } from "@/lib/data/workspace";
import { cn } from "@/lib/cn";
import { formatDayLabel, formatRelative } from "@/lib/format";

const DOT: Record<ActivityType, string> = {
  CREATIVE_UPLOADED: "bg-faint",
  VERSION_UPLOADED: "bg-brand-500",
  FEEDBACK_RECEIVED: "bg-brand-500",
  CHANGES_REQUESTED: "bg-attention-solid",
  CREATIVE_APPROVED: "bg-positive-solid",
  OTHER: "bg-line-strong",
  // Submission-review workflow events.
  SUBMISSION_SUBMITTED: "bg-brand-500",
  EVIDENCE_SUBMITTED: "bg-faint",
  REVIEW_STARTED: "bg-brand-500",
  FINDING_RECORDED: "bg-attention-solid",
  RESUBMITTED: "bg-brand-500",
  REVIEW_COMPLETED: "bg-positive-solid",
};

function Entry({ item, now, last }: { item: ActivityItem; now: number; last: boolean }) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {/* Timeline rail */}
      {!last && <span aria-hidden className="absolute top-4 bottom-0 left-[4.5px] w-px bg-line" />}
      <span aria-hidden className={cn("relative mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-surface", DOT[item.type])} />
      <div className="min-w-0 flex-1">
        <p className="text-small break-words text-ink">{item.message}</p>
        <p className="text-caption mt-0.5 truncate text-muted">
          {item.projectName} · {item.actorName}
        </p>
        <p className="text-record mt-0.5 text-faint">{formatRelative(item.createdAt, now)}</p>
      </div>
    </li>
  );
}

// Compact list for the dashboard.
export function ActivityList({ items, now }: { items: ActivityItem[]; now: number }) {
  return (
    <ol>
      {items.map((item, i) => (
        <Entry key={item.id} item={item} now={now} last={i === items.length - 1} />
      ))}
    </ol>
  );
}

// Full timeline grouped by day.
export function ActivityTimeline({ items, now }: { items: ActivityItem[]; now: number }) {
  const groups = new Map<string, ActivityItem[]>();
  for (const item of items) {
    const label = formatDayLabel(item.createdAt, now);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }

  return (
    <div className="flex flex-col gap-8">
      {[...groups].map(([label, dayItems]) => (
        <section key={label} aria-label={label}>
          <h2 className="text-small mb-4 font-semibold text-ink">{label}</h2>
          <ol>
            {dayItems.map((item, i) => (
              <Entry key={item.id} item={item} now={now} last={i === dayItems.length - 1} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
