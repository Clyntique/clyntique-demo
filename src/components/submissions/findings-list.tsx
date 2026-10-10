import type { FindingSeverity, FindingStatus, Role } from "@/generated/prisma/enums";
import type { FindingView } from "@/lib/data/submission-review";
import { cn } from "@/lib/cn";
import { FINDING_STATUS_LABEL, REQUIRED_ACTION_LABEL, SEVERITY_CAPTION, SEVERITY_LABEL } from "@/lib/workflow/labels";
import { Badge } from "@/components/ui/badge";
import { DraftFindingControls, type TargetChoice } from "./review-panel";

// Findings for one submission. The data was already filtered for the viewer
// (src/lib/data/submission-review.ts): a CLIENT never receives draft or
// unpublished findings, so nothing here decides visibility.

export const SEVERITY_STYLE: Record<FindingSeverity, string> = {
  HIGH: "bg-red-50 text-red-800 ring-red-200",
  MEDIUM: "bg-amber-50 text-amber-800 ring-amber-200",
  LOW: "bg-sky-50 text-sky-800 ring-sky-200",
  ADVISORY: "bg-zinc-50 text-zinc-700 ring-zinc-200",
};

const STATUS_STYLE: Record<FindingStatus, string> = {
  DRAFT: "border border-dashed border-line-strong text-muted",
  OPEN: "bg-amber-50 text-amber-800",
  RESPONDED: "bg-violet-50 text-violet-800",
  RESOLVED: "bg-emerald-50 text-emerald-800",
  DISMISSED: "bg-subtle text-muted",
};

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function FindingsList({
  findings,
  role,
  editable,
  markets,
  platforms,
}: {
  findings: FindingView[];
  role: Role;
  /** TEAM, while in review: draft findings can be edited or dismissed. */
  editable: boolean;
  markets: TargetChoice[];
  platforms: TargetChoice[];
}) {
  if (!findings.length) return null;
  return (
    <ol className="flex flex-col gap-3">
      {findings.map((f, i) => (
        <li
          key={f.id}
          className={cn(
            "rounded-lg border bg-surface p-4 shadow-card",
            f.status === "DRAFT" ? "border-dashed border-line-strong" : "border-line",
            f.status === "DISMISSED" && "opacity-70",
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-meta tabular-nums">#{i + 1}</span>
            <span
              title={SEVERITY_CAPTION}
              className={cn("inline-flex h-5 items-center rounded-sm px-1.5 text-[11px] font-semibold ring-1 ring-inset", SEVERITY_STYLE[f.severity])}
            >
              {SEVERITY_LABEL[f.severity]}
            </span>
            <span className={cn("inline-flex h-5 items-center rounded-sm px-1.5 text-[11px] font-medium", STATUS_STYLE[f.status])}>
              {f.status === "DRAFT" ? "Draft · team only" : FINDING_STATUS_LABEL[f.status]}
            </span>
            {f.versionNumber && <Badge tone="outline">Found on V{f.versionNumber}</Badge>}
            {[...f.markets, ...f.platforms].map((t) => (
              <Badge key={t} tone="outline">
                {t}
              </Badge>
            ))}
          </div>

          <h3 className={cn("text-card-title mt-2 break-words", f.status === "DISMISSED" && "line-through decoration-faint")}>{f.issue}</h3>
          <p className="text-body mt-1 break-words whitespace-pre-line text-ink-soft">{f.explanation}</p>

          <div className="mt-3 rounded-md bg-subtle px-3 py-2.5">
            <p className="text-label mb-0.5">Required action · {REQUIRED_ACTION_LABEL[f.requiredAction]}</p>
            <p className="text-body break-words whitespace-pre-line text-ink">{f.actionDetails}</p>
          </div>

          {f.resolutionNote && f.status === "RESOLVED" && (
            <p className="text-meta mt-2">
              <span className="font-medium text-emerald-800">Resolved:</span> {f.resolutionNote}
            </p>
          )}

          <p className="text-meta mt-2">
            {role === "TEAM" ? `Recorded by ${f.reviewerName}` : "Clyntique reviewer"} · {formatDate(f.publishedAt ?? f.createdAt)}
            <span className="sr-only"> · {SEVERITY_CAPTION}</span>
          </p>

          {editable && f.status === "DRAFT" && <DraftFindingControls finding={f} markets={markets} platforms={platforms} />}
        </li>
      ))}
    </ol>
  );
}

export function SeverityLegend() {
  return <p className="text-meta">Severity is the reviewer&apos;s assessment, not a legal classification.</p>;
}
