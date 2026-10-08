import type { CreativeStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";
import { STATUS_STYLES } from "./status-badge";

export type StatusCounts = Partial<Record<CreativeStatus, number>>;

const ORDER: CreativeStatus[] = ["APPROVED", "IN_REVIEW", "CHANGES_REQUESTED", "DRAFT"];

// Segmented bar showing how a project's creatives are spread across review states.
export function ReviewProgress({
  counts,
  showLegend = false,
  className,
}: {
  counts: StatusCounts;
  showLegend?: boolean;
  className?: string;
}) {
  const total = ORDER.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  const approved = counts.APPROVED ?? 0;
  const percent = total ? Math.round((approved / total) * 100) : 0;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-3">
        <div
          role="img"
          aria-label={`${approved} of ${total} creatives approved`}
          className="flex h-1.5 flex-1 gap-0.5 overflow-hidden rounded-full bg-subtle"
        >
          {ORDER.map((status) => {
            const n = counts[status] ?? 0;
            if (!n) return null;
            return (
              <span
                key={status}
                className={cn("h-full first:rounded-l-full last:rounded-r-full", STATUS_STYLES[status].bar)}
                style={{ width: `${(n / total) * 100}%` }}
              />
            );
          })}
        </div>
        <span className="w-9 text-right text-xs font-medium text-ink-soft tabular-nums">
          {percent}%
        </span>
      </div>
      {showLegend && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {ORDER.map((status) => {
            const n = counts[status] ?? 0;
            if (!n) return null;
            return (
              <li key={status} className="flex items-center gap-1.5 text-xs text-ink-soft">
                <span aria-hidden className={cn("size-1.5 rounded-full", STATUS_STYLES[status].dot)} />
                <span className="tabular-nums">{n}</span>
                <span className="text-muted">{STATUS_STYLES[status].label.toLowerCase()}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
