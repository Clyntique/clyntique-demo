import Link from "next/link";
import type { Role } from "@/generated/prisma/enums";
import type { KnowledgeResult, Passage } from "@/lib/knowledge/search";
import { KNOWLEDGE_AI_OFF_NOTICE, KNOWLEDGE_NOTICE, KNOWLEDGE_SEARCH_PROMPT, KNOWLEDGE_VERDICT_DESCRIPTION, KNOWLEDGE_VERDICT_LABEL, QUESTION_MAX_CHARS, type KnowledgeVerdict } from "@/lib/knowledge/query";
import { basePathFor } from "@/lib/navigation";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { SearchIcon, SparklesIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { TonePill, type Tone } from "@/components/ui/status-badge";
import { EVIDENCE_TYPES } from "@/components/review/evidence-types";
import { SaveChunkForm } from "./library-controls";
import { RecordStatusPill } from "./record-status";

/*
 * "Ask your Knowledge Base": the question box and the results of one
 * question (src/lib/knowledge/search.ts decides what this viewer may see).
 * Everything shown is traceable: each passage links to its document and the
 * original file; an AI answer, when present, cites passage ids from this
 * same list and never replaces them.
 */

const VERDICT_TONE: Record<KnowledgeVerdict, Tone> = {
  EVIDENCE_FOUND: "positive",
  POTENTIAL_CONCERN: "attention",
  INSUFFICIENT_INFORMATION: "neutral",
};

const EXAMPLES = [
  "Do we have evidence supporting this claim?",
  "What information do we have about this treatment?",
  "Could this potentially cause an advertising compliance issue?",
  "Which documents support this statement?",
];

export function KnowledgeSearchBox({ role, question, documentsSearched }: { role: Role; question: string; documentsSearched: number }) {
  const href = `${basePathFor(role)}/evidence`;
  return (
    <form method="get" action={href} role="search" aria-label="Ask your Knowledge Base" className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-small font-medium text-ink-soft">Ask your Knowledge Base</span>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input name="q" size="lg" defaultValue={question} icon={<SearchIcon />} placeholder={KNOWLEDGE_SEARCH_PROMPT} maxLength={QUESTION_MAX_CHARS} className="flex-1" aria-label={KNOWLEDGE_SEARCH_PROMPT} />
          <button type="submit" className={buttonClasses({ variant: "primary", size: "lg" })}>
            Search
          </button>
        </div>
      </label>
      <p className="text-meta">
        Full questions work; no category needed. Searches {documentsSearched} indexed {documentsSearched === 1 ? "document" : "documents"}, your Evidence Dictionary and Clyntique&apos;s verified policy rules.
      </p>
      {!question && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Example questions">
          {EXAMPLES.map((q) => (
            <li key={q}>
              <Link href={`${href}?q=${encodeURIComponent(q)}`} className="inline-flex rounded-full border border-line bg-surface px-2.5 py-1 text-caption text-ink-soft hover:border-line-strong hover:text-ink">
                {q}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

/** Renders a ts_headline snippet, with the [[marked]] words emphasised. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(\[\[.*?\]\])/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("[[") && part.endsWith("]]") ? (
          <mark key={i} className="rounded bg-brand-50 px-0.5 text-brand-900">
            {part.slice(2, -2)}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function PassageCard({ passage, cited, role }: { passage: Passage; cited: boolean; role: Role }) {
  return (
    <li id={`passage-${passage.chunkId}`} className={cn("flex flex-col gap-2 rounded-lg border bg-surface p-4", cited ? "border-brand-500" : "border-line")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={passage.href} className="text-small font-medium text-ink hover:underline">
          {passage.documentTitle}
        </Link>
        <Badge tone="outline">{EVIDENCE_TYPES[passage.documentType]}</Badge>
        {passage.page && <span className="text-meta">Page {passage.page}</span>}
        {cited && <TonePill tone="accent">Cited in the answer</TonePill>}
      </div>
      <p className="text-small text-ink-soft">
        …<Snippet text={passage.snippet} />…
      </p>
      <details className="text-small">
        <summary className="cursor-pointer text-meta">Full passage</summary>
        <p className="mt-1 whitespace-pre-line break-words text-ink-soft">{passage.text}</p>
      </details>
      <div className="flex flex-wrap items-center gap-3">
        <a href={passage.downloadHref} className="text-small font-medium text-brand-700 hover:underline">
          Open original ({passage.fileName})
        </a>
        {passage.ownedByViewer && <SaveChunkForm chunkId={passage.chunkId} recordsHref={`${basePathFor(role)}/evidence`} />}
      </div>
    </li>
  );
}

export function KnowledgeResults({ role, result }: { role: Role; result: KnowledgeResult }) {
  const base = basePathFor(role);
  const cited = new Set(result.answer?.citations ?? []);
  const nothing = result.passages.length === 0 && result.records.length === 0 && result.rules.length === 0;

  return (
    <section aria-label="Answer" className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <TonePill tone={VERDICT_TONE[result.verdict]}>{KNOWLEDGE_VERDICT_LABEL[result.verdict]}</TonePill>
          <span className="text-meta">
            for “{result.question}” · {result.passages.length} {result.passages.length === 1 ? "passage" : "passages"}
            {result.rules.length > 0 ? ` · ${result.rules.length} verified ${result.rules.length === 1 ? "rule" : "rules"}` : ""}
            {result.records.length > 0 ? ` · ${result.records.length} dictionary ${result.records.length === 1 ? "record" : "records"}` : ""}
          </span>
        </div>
        <p className="text-small text-ink-soft">{KNOWLEDGE_VERDICT_DESCRIPTION[result.verdict]}</p>

        {result.answer ? (
          <div className="flex flex-col gap-2 rounded-md border border-line bg-subtle p-3">
            <p className="text-caption font-medium text-ink-soft">
              <SparklesIcon className="mr-1 inline size-3.5" /> AI reading of the cited passages (an interpretation, not a document fact)
            </p>
            <p className="text-small whitespace-pre-line text-ink">{result.answer.answer}</p>
            {result.answer.uncertainties.length > 0 && (
              <ul className="list-disc pl-5 text-small text-ink-soft">
                {result.answer.uncertainties.map((u) => (
                  <li key={u}>Not established by the documents: {u}</li>
                ))}
              </ul>
            )}
            <p className="text-meta">
              Based on {result.answer.citations.length} cited {result.answer.citations.length === 1 ? "passage" : "passages"} below. Read them before relying on this.
            </p>
          </div>
        ) : result.aiEnabled ? (
          result.aiNote && <p className="text-meta">{result.aiNote}</p>
        ) : (
          <p className="text-meta">{KNOWLEDGE_AI_OFF_NOTICE}</p>
        )}
        <p className="text-meta">{KNOWLEDGE_NOTICE}</p>
      </Card>

      {nothing && (
        <Card className="p-4 sm:p-5">
          <p className="text-small text-ink">Nothing in the library matches this question.</p>
          <p className="text-meta mt-1">
            Try other words, or upload the document that would answer it. {result.documentsSearched === 0 ? "No document has been indexed yet." : ""}
          </p>
        </Card>
      )}

      {result.passages.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeader title="Passages from your documents" description="Document facts, in the documents' own words. Open the original to read the context." />
          <ul className="flex flex-col gap-3">
            {result.passages.map((p) => (
              <PassageCard key={p.chunkId} passage={p} cited={cited.has(p.chunkId)} role={role} />
            ))}
          </ul>
        </div>
      )}

      {result.rules.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeader title="Verified policy rules that mention this" description="Approved versions of rules Clyntique has verified against the official source. Drafts are never shown here." />
          <ul className="flex flex-col gap-2">
            {result.rules.map((r) => (
              <li key={r.versionId} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="brand">{r.code}</Badge>
                  <span className="text-small font-medium text-ink">{r.title}</span>
                  <span className="text-meta">
                    v{r.versionNumber} · {r.jurisdictionCode}
                    {r.platformCode ? ` · ${r.platformCode}` : ""}
                  </span>
                </div>
                <p className="text-small mt-1 text-ink-soft">{r.summary}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.records.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeader title="Evidence Dictionary records that mention this" description="Records you (or Clyntique) already keep, with their reviewer-check status." />
          <ul className="flex flex-col gap-2">
            {result.records.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-4 py-3">
                <div className="min-w-0">
                  <Link href={`${base}/evidence/${r.id}`} className="text-small font-medium text-ink hover:underline">
                    {r.title}
                  </Link>
                  <p className="text-meta">
                    {EVIDENCE_TYPES[r.type]}
                    {r.claimText ? ` · “${r.claimText}”` : ""}
                  </p>
                </div>
                <RecordStatusPill status={r.status} expired={r.expired} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
