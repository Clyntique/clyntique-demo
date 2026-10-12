import type { Role } from "@/generated/prisma/enums";
import type { EvidenceView, FindingEntry, FindingView } from "@/lib/data/submission-review";
import type { Unmet } from "@/lib/workflow/findings";
import { cn } from "@/lib/cn";
import { REQUIRED_ACTION_LABEL, SEVERITY_CAPTION } from "@/lib/workflow/labels";
import { FindingStatusPill, SeverityMarker } from "@/components/ui/severity";
import { RespondForm, type Choice } from "./client-remediation";
import { DraftFindingControls, PublishedFindingControls, type TargetChoice } from "./review-panel";

// Findings for one submission. The data was already filtered for the viewer
// (src/lib/data/submission-review.ts): a CLIENT never receives draft or
// unpublished findings, nor reviewer moves made after the latest decision,
// so nothing here decides visibility.

// Plain-language versions of the required actions, for clients.
const CLIENT_ACTION_LABEL: Record<FindingView["requiredAction"], string> = {
  REVISE_CONTENT: "change the creative and upload a new version",
  PROVIDE_EVIDENCE: "send evidence that supports the claim",
  CLARIFY: "answer the reviewer's question",
  ACKNOWLEDGE: "confirm you've read this",
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
              "rounded-lg border bg-surface p-4",
              f.status === "DRAFT" ? "border-dashed border-line-strong" : gaps.length ? "border-attention-line" : "border-line",
            )}
          >
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="text-record text-muted">#{i + 1}</span>
              <SeverityMarker severity={f.severity} />
              <FindingStatusPill status={f.status} />
              <span className="text-record text-muted">
                Found V{f.versionNumber ?? "–"}
                {f.resolvedInVersionNumber ? ` · resolved V${f.resolvedInVersionNumber}` : ""}
              </span>
              {[...f.markets, ...f.platforms].length > 0 && <span className="text-caption text-muted">{[...f.markets, ...f.platforms].join(" · ")}</span>}
            </div>

            <h3 className={cn("text-body mt-2 font-semibold break-words text-ink", f.status === "DISMISSED" && "line-through decoration-faint")}>{f.issue}</h3>
            {role === "CLIENT" && <p className="text-label mt-2">Why it matters</p>}
            <p className={cn("text-body break-words whitespace-pre-line text-ink-soft", role === "CLIENT" ? "mt-0.5" : "mt-1")}>{f.explanation}</p>

            <div className={cn("mt-3 rounded-md px-3 py-2.5", gaps.length ? "bg-attention-soft/60" : "bg-subtle")}>
              <p className="text-label mb-0.5">
                {role === "CLIENT" ? `What you need to do · ${CLIENT_ACTION_LABEL[f.requiredAction]}` : `Required action · ${REQUIRED_ACTION_LABEL[f.requiredAction]}`}
              </p>
              <p className="text-body break-words whitespace-pre-line text-ink">{f.actionDetails}</p>
            </div>

            <p className="text-record mt-2 text-muted">
              {role === "TEAM" ? `Recorded by ${f.reviewerName}` : "Clyntique reviewer"} · {formatDate(f.publishedAt ?? f.createdAt)}
              <span className="sr-only"> · {SEVERITY_CAPTION}</span>
            </p>

            {(f.entries.length > 0 || linked.length > 0) && <FindingTimeline entries={f.entries} linked={linked} role={role} />}

            {gaps.length > 0 && (
              <p className="text-small mt-3 flex items-center gap-2 text-attention-ink">
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-attention-solid" />
                Still needed before you resubmit: {gaps.map((g) => GAP_LABEL[g.missing]).join(", ")}.
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
              e.move === "RESOLVED" ? "bg-positive-soft text-positive-ink" : e.move === "REOPENED" ? "bg-attention-soft text-attention-ink" : "bg-subtle text-ink-soft",
            )}
          >
            <p className="text-caption font-medium">
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
