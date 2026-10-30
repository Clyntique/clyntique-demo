import type { Role } from "@/generated/prisma/enums";
import type { EvidenceView, FindingEntry, FindingView } from "@/lib/data/submission-review";
import type { Unmet } from "@/lib/workflow/findings";
import { cn } from "@/lib/cn";
import { AI_ORIGIN_NOTE, REQUIRED_ACTION_LABEL, SEVERITY_CAPTION } from "@/lib/workflow/labels";
import { FindingStatusPill, SeverityMarker } from "@/components/ui/severity";
import { RespondForm, type Choice } from "./client-remediation";
import { DraftFindingControls, PublishedFindingControls, type RuleChoice, type TargetChoice } from "./review-panel";
import { PolicyReference } from "./policy-reference";

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
  rules = [],
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
  /** TEAM, while in review: verified, approved rules a finding may cite. */
  rules?: RuleChoice[];
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
            id={`finding-${f.id}`}
            className={cn(
              "scroll-mt-6 rounded-xl border bg-surface p-4 sm:p-5 shadow-xs transition-shadow",
              f.status === "DRAFT"
                ? "border-dashed border-line-strong bg-subtle/30"
                : gaps.length
                  ? "border-attention-line ring-1 ring-attention-line/50"
                  : f.status === "RESOLVED"
                    ? "border-positive-line/70"
                    : "border-line",
            )}
          >
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="text-record font-semibold text-muted">#{i + 1}</span>
              <SeverityMarker severity={f.severity} />
              <FindingStatusPill status={f.status} />
              <span className="text-record text-muted">
                Found V{f.versionNumber ?? "–"}
                {f.resolvedInVersionNumber ? ` · resolved V${f.resolvedInVersionNumber}` : ""}
              </span>
              {[...f.markets, ...f.platforms].length > 0 && <span className="text-caption text-muted">{[...f.markets, ...f.platforms].join(" · ")}</span>}
            </div>

            <h3 className={cn("text-card-title sm:text-body mt-2.5 font-semibold break-words text-ink", f.status === "DISMISSED" && "line-through decoration-faint")}>{f.issue}</h3>
            {role === "CLIENT" && <p className="text-eyebrow mt-2.5">Why it matters</p>}
            {f.claimText && (
              <p className="text-small mt-1.5 break-words text-ink">
                <span className="font-medium text-ink-soft">Claim:</span> “{f.claimText}”
                {f.claimLocation && <span className="text-meta"> · {f.claimLocation}</span>}
              </p>
            )}
            {!f.claimText && f.claimLocation && <p className="text-meta mt-1.5">Where: {f.claimLocation}</p>}
            <p className={cn("text-small break-words whitespace-pre-line text-ink-soft", role === "CLIENT" ? "mt-1" : "mt-1.5")}>{f.explanation}</p>
            {f.policy && <PolicyReference policy={f.policy} />}

            <div className={cn("mt-3.5 rounded-lg border px-3.5 py-3", gaps.length ? "border-attention-line/70 bg-attention-soft/60" : "border-line bg-subtle/60")}>
              <p className="text-eyebrow mb-1">
                {role === "CLIENT" ? `What you need to do · ${CLIENT_ACTION_LABEL[f.requiredAction]}` : `Required action · ${REQUIRED_ACTION_LABEL[f.requiredAction]}`}
              </p>
              <p className="text-small font-medium break-words whitespace-pre-line text-ink">{f.actionDetails}</p>
              {f.suggestedRevision && (
                <p className="text-small mt-2 break-words whitespace-pre-line text-ink-soft">
                  <span className="font-medium text-ink">Suggested wording:</span> {f.suggestedRevision}
                </p>
              )}
            </div>

            <p className="text-caption mt-2.5 text-muted">
              {role === "TEAM" ? `Recorded by ${f.reviewerName}` : "Clyntique reviewer"} · {formatDate(f.publishedAt ?? f.createdAt)}
              <span className="sr-only"> · {SEVERITY_CAPTION}</span>
              {role === "TEAM" && f.origin === "AI_SUGGESTION_ACCEPTED" && <span className="block">{AI_ORIGIN_NOTE}</span>}
            </p>

            {(f.entries.length > 0 || linked.length > 0) && <FindingTimeline entries={f.entries} linked={linked} role={role} />}

            {gaps.length > 0 && (
              <p className="text-small mt-3 flex items-center gap-2 font-medium text-attention-ink">
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-attention-solid" />
                Still needed before you resubmit: {gaps.map((g) => GAP_LABEL[g.missing]).join(", ")}.
              </p>
            )}

            {editable && f.status === "DRAFT" && <DraftFindingControls finding={f} markets={markets} platforms={platforms} rules={rules} />}
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
    <div className="mt-3.5 flex flex-col gap-2.5 border-t border-line pt-3">
      {entries.map((e) =>
        e.kind === "response" ? (
          <div key={e.id} className="rounded-lg border border-brand-200 bg-brand-50/50 px-3.5 py-2.5">
            <p className="text-meta">
              <span className="font-semibold text-brand-900">{e.byClient ? (role === "CLIENT" ? "Your response" : `Response from ${e.authorName}`) : e.authorName}</span>
              {" · "}
              <time dateTime={e.createdAt.toISOString()}>{formatDateTime(e.createdAt)}</time>
              {e.roundNumber ? ` · after round ${e.roundNumber}` : ""}
            </p>
            <p className="text-small mt-1 break-words whitespace-pre-line text-ink">{e.message}</p>
          </div>
        ) : (
          <div
            key={e.id}
            className={cn(
              "rounded-lg border px-3.5 py-2.5",
              e.move === "RESOLVED"
                ? "border-positive-line bg-positive-soft text-positive-ink"
                : e.move === "REOPENED"
                  ? "border-attention-line bg-attention-soft text-attention-ink"
                  : "border-line bg-subtle text-ink-soft",
            )}
          >
            <p className="text-caption font-semibold">
              {e.move === "RESOLVED" ? "Resolved" : e.move === "REOPENED" ? "Reopened" : "Withdrawn"} by {e.actorName} ·{" "}
              <time dateTime={e.createdAt.toISOString()}>{formatDateTime(e.createdAt)}</time>
            </p>
            {e.note && <p className="text-small mt-1 break-words whitespace-pre-line">{e.note}</p>}
          </div>
        ),
      )}
      {linked.length > 0 && (
        <p className="text-caption mt-1 flex flex-wrap items-center gap-1.5 text-muted">
          <span className="font-medium text-ink-soft">Linked evidence:</span>{" "}
          {linked.map((e, i) => (
            <span key={e.id}>
              {i > 0 && ", "}
              <a href={`#evidence-${e.id}`} className={cn("font-medium text-brand-700 hover:underline", e.withdrawn && "line-through")}>
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
