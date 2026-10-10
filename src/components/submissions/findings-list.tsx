import type { FindingSeverity, FindingStatus, Role } from "@/generated/prisma/enums";
import type { EvidenceView, FindingEntry, FindingView } from "@/lib/data/submission-review";
import type { Unmet } from "@/lib/workflow/findings";
import { cn } from "@/lib/cn";
import { FINDING_STATUS_LABEL, REQUIRED_ACTION_LABEL, SEVERITY_CAPTION, SEVERITY_LABEL } from "@/lib/workflow/labels";
import { Badge } from "@/components/ui/badge";
import { RespondForm, type Choice } from "./client-remediation";
import { DraftFindingControls, PublishedFindingControls, type TargetChoice } from "./review-panel";

// Findings for one submission. The data was already filtered for the viewer
// (src/lib/data/submission-review.ts): a CLIENT never receives draft or
// unpublished findings, nor reviewer moves made after the latest decision,
// so nothing here decides visibility.

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

const GAP_LABEL: Record<Unmet["missing"], string> = {
  RESPONSE: "a response",
  NEW_VERSION: "a revised version",
  EVIDENCE: "linked evidence",
};

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(date: Date) {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export type ClientRespond = {
  /** Active evidence the client can link to a response. */
  evidence: Choice[];
  /** What each finding still needs before resubmitting. */
  gaps: Unmet[];
};

export function FindingsList({
  findings,
  role,
  editable,
  reviewingCycle,
  respond,
  evidence,
  markets,
  platforms,
}: {
  findings: FindingView[];
  role: Role;
  /** TEAM, while in review: draft findings can be edited or dismissed. */
  editable: boolean;
  /** TEAM, while in review: the cycle whose published findings can be resolved, reopened or withdrawn. */
  reviewingCycle: number | null;
  /** CLIENT, while changes are requested in the open cycle. */
  respond: (ClientRespond & { cycle: number }) | null;
  evidence: EvidenceView[];
  markets: TargetChoice[];
  platforms: TargetChoice[];
}) {
  if (!findings.length) return null;
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  return (
    <ol className="flex flex-col gap-3">
      {findings.map((f, i) => {
        const open = f.status === "OPEN" || f.status === "RESPONDED";
        const gaps = respond && respond.cycle === f.cycleNumber ? respond.gaps.filter((g) => g.findingId === f.id) : [];
        const linked = f.evidenceIds.map((id) => evidenceById.get(id)).filter((e): e is EvidenceView => Boolean(e));
        return (
          <li
            key={f.id}
            className={cn(
              "rounded-lg border bg-surface p-4 shadow-card",
              f.status === "DRAFT" ? "border-dashed border-line-strong" : "border-line",
              (f.status === "DISMISSED" || f.status === "RESOLVED") && "bg-surface/60",
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
              {f.resolvedInVersionNumber && <Badge tone="outline">Resolved on V{f.resolvedInVersionNumber}</Badge>}
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

            <p className="text-meta mt-2">
              {role === "TEAM" ? `Recorded by ${f.reviewerName}` : "Clyntique reviewer"} · {formatDate(f.publishedAt ?? f.createdAt)}
              <span className="sr-only"> · {SEVERITY_CAPTION}</span>
            </p>

            {(f.entries.length > 0 || linked.length > 0) && <FindingTimeline entries={f.entries} linked={linked} role={role} />}

            {gaps.length > 0 && (
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                Needed before you resubmit: {gaps.map((g) => GAP_LABEL[g.missing]).join(", ")}.
              </p>
            )}

            {editable && f.status === "DRAFT" && <DraftFindingControls finding={f} markets={markets} platforms={platforms} />}
            {reviewingCycle === f.cycleNumber && open && f.publishedAt && <PublishedFindingControls finding={f} />}
            {respond && respond.cycle === f.cycleNumber && open && (
              <RespondForm
                findingId={f.id}
                evidence={respond.evidence}
                hint={
                  f.requiredAction === "REVISE_CONTENT"
                    ? "Say what you changed. Upload the revised version separately."
                    : f.requiredAction === "PROVIDE_EVIDENCE"
                      ? "Explain the evidence. Add it under Evidence and link it here or there."
                      : f.requiredAction === "ACKNOWLEDGE"
                        ? "Confirm you've read and accept this point."
                        : "Answer the reviewer's question."
                }
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function FindingTimeline({ entries, linked, role }: { entries: FindingEntry[]; linked: EvidenceView[]; role: Role }) {
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
      {entries.map((e) =>
        e.kind === "response" ? (
          <div key={e.id} className="rounded-md border border-line px-3 py-2">
            <p className="text-meta">
              <span className="font-medium text-ink-soft">{e.byClient ? (role === "CLIENT" ? "Your response" : `Response from ${e.authorName}`) : e.authorName}</span>
              {" · "}
              <time dateTime={e.createdAt.toISOString()}>{formatDateTime(e.createdAt)}</time>
              {e.roundNumber ? ` · after round ${e.roundNumber}` : ""}
            </p>
            <p className="text-body mt-0.5 break-words whitespace-pre-line text-ink">{e.message}</p>
          </div>
        ) : (
          <div
            key={e.id}
            className={cn(
              "rounded-md px-3 py-2",
              e.move === "RESOLVED" ? "bg-emerald-50 text-emerald-900" : e.move === "REOPENED" ? "bg-amber-50 text-amber-900" : "bg-subtle text-ink-soft",
            )}
          >
            <p className="text-[12px] font-medium">
              {e.move === "RESOLVED" ? "Resolved" : e.move === "REOPENED" ? "Reopened" : "Withdrawn"} by {e.actorName} ·{" "}
              <time dateTime={e.createdAt.toISOString()}>{formatDateTime(e.createdAt)}</time>
            </p>
            {e.note && <p className="text-body mt-0.5 break-words whitespace-pre-line">{e.note}</p>}
          </div>
        ),
      )}
      {linked.length > 0 && (
        <p className="text-meta">
          <span className="font-medium text-ink-soft">Linked evidence:</span>{" "}
          {linked.map((e, i) => (
            <span key={e.id}>
              {i > 0 && ", "}
              <a href={`#evidence-${e.id}`} className={cn("text-brand-700 hover:underline", e.withdrawn && "line-through")}>
                {e.title}
              </a>
              {e.withdrawn && " (withdrawn)"}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

export function SeverityLegend() {
  return <p className="text-meta">Severity is the reviewer&apos;s assessment, not a legal classification.</p>;
}
