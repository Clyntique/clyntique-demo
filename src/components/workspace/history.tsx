import type { Role } from "@/generated/prisma/enums";
import type { SubmissionVersion } from "@/lib/data/submission";
import type { DecisionView, EvidenceView, FindingView, RoundView } from "@/lib/data/submission-review";
import { cn } from "@/lib/cn";
import { REVIEW_DISCLAIMER, REVIEW_OUTCOME_LABEL } from "@/lib/workflow/labels";

/*
 * One chronological ledger of everything that happened to a submission:
 * versions, (re)submissions, decisions, responses, reviewer moves and
 * evidence. Built only from data the loaders have already filtered for this
 * viewer, so nothing here decides visibility.
 */

type Tone = "neutral" | "accent" | "attention" | "positive";
type Entry = { key: string; at: Date; tone: Tone; title: string; detail?: string | null; who?: string; note?: string };

const DOT: Record<Tone, string> = {
  neutral: "bg-faint",
  accent: "bg-brand-600",
  attention: "bg-attention-solid",
  positive: "bg-positive-solid",
};

function formatDateTime(date: Date) {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function buildHistory({
  versions,
  rounds,
  decisions,
  findings,
  evidence,
  role,
}: {
  versions: SubmissionVersion[];
  rounds: RoundView[];
  decisions: DecisionView[];
  findings: FindingView[];
  evidence: EvidenceView[];
  role: Role;
}): Entry[] {
  const entries: Entry[] = [];
  const label = (f: FindingView) => `#${findings.indexOf(f) + 1} ${f.issue}`;

  for (const v of versions) {
    entries.push({ key: `v-${v.id}`, at: v.createdAt, tone: "neutral", title: `V${v.versionNumber} uploaded`, who: v.createdByName, note: v.changeNotes ?? undefined });
  }
  for (const r of rounds) {
    entries.push({
      key: `r-${r.id}`,
      at: r.submittedAt,
      tone: "accent",
      title: r.number === 1 ? `Submitted V${r.version.number} for review` : `Resubmitted V${r.version.number} · round ${r.number}`,
      who: r.submittedByName,
      note: r.note ?? undefined,
    });
  }
  for (const d of decisions) {
    entries.push({
      key: `d-${d.id}`,
      at: d.createdAt,
      tone: d.kind === "FINAL" ? "positive" : "attention",
      title: d.kind === "FINAL" ? `Review complete · ${d.outcome ? REVIEW_OUTCOME_LABEL[d.outcome] : "outcome recorded"}` : `Changes requested on V${d.versionNumber}`,
      detail: `Round ${d.roundNumber}`,
      who: role === "TEAM" ? d.reviewerName : "Clyntique reviewer",
      note: d.summary,
    });
  }
  for (const f of findings) {
    for (const e of f.entries) {
      if (e.kind === "response") {
        entries.push({ key: `resp-${e.id}`, at: e.createdAt, tone: "accent", title: `Response to ${label(f)}`, who: e.authorName, note: e.message });
      } else {
        const verb = e.move === "RESOLVED" ? "Resolved" : e.move === "REOPENED" ? "Reopened" : "Withdrew";
        entries.push({ key: `mv-${e.id}`, at: e.createdAt, tone: e.move === "RESOLVED" ? "positive" : e.move === "REOPENED" ? "attention" : "neutral", title: `${verb} ${label(f)}`, who: e.actorName, note: e.note ?? undefined });
      }
    }
  }
  for (const e of evidence) {
    entries.push({ key: `ev-${e.id}`, at: e.createdAt, tone: "neutral", title: `Evidence added: ${e.title}`, who: e.addedByName ?? undefined });
    if (e.withdrawal) entries.push({ key: `evw-${e.id}`, at: e.withdrawal.at, tone: "neutral", title: `Evidence withdrawn: ${e.title}`, who: e.withdrawal.byName ?? undefined });
  }
  return entries.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export function HistoryLedger({ entries, showDisclaimer }: { entries: Entry[]; showDisclaimer: boolean }) {
  if (!entries.length) return <p className="text-small text-muted">Nothing has happened yet. Uploads, submissions and decisions will be listed here in order.</p>;
  return (
    <div className="flex flex-col gap-4">
      <ol className="relative flex flex-col">
        {entries.map((e, i) => (
          <li key={e.key} className="relative flex gap-3 pb-4 last:pb-0">
            {i < entries.length - 1 && <span aria-hidden className="absolute top-3 left-[3.5px] h-full w-px bg-line" />}
            <span aria-hidden className={cn("relative mt-1.5 size-2 shrink-0 rounded-full", DOT[e.tone])} />
            <div className="min-w-0 flex-1">
              <p className="text-small break-words text-ink">
                {e.title}
                {e.detail && <span className="text-muted"> · {e.detail}</span>}
              </p>
              <p className="text-record mt-0.5 text-muted">
                <time dateTime={e.at.toISOString()}>{formatDateTime(e.at)}</time>
                {e.who ? ` · ${e.who}` : ""}
              </p>
              {e.note && <p className="text-small mt-1 break-words whitespace-pre-line text-ink-soft">{e.note}</p>}
            </div>
          </li>
        ))}
      </ol>
      {showDisclaimer && <p className="text-caption rounded-md bg-subtle px-3 py-2 text-muted">{REVIEW_DISCLAIMER}</p>}
    </div>
  );
}
