// Pure rules of knowledge search: turning a question into PostgreSQL text
// queries, deciding the verdict a result set supports, validating an AI
// answer against the passages it was given, and the wording shown to users.
// No I/O here; the database and the model live in search.ts and answer.ts.

export type KnowledgeVerdict = "EVIDENCE_FOUND" | "POTENTIAL_CONCERN" | "INSUFFICIENT_INFORMATION";

export const KNOWLEDGE_VERDICT_LABEL: Record<KnowledgeVerdict, string> = {
  EVIDENCE_FOUND: "Evidence found",
  POTENTIAL_CONCERN: "Potential concern",
  INSUFFICIENT_INFORMATION: "Insufficient information",
};

export const KNOWLEDGE_VERDICT_DESCRIPTION: Record<KnowledgeVerdict, string> = {
  EVIDENCE_FOUND: "Your uploaded documents contain passages related to this question. Read the cited passages: they are what the answer is based on, and a Clyntique reviewer decides whether they substantiate a claim.",
  POTENTIAL_CONCERN: "Something in the results needs a closer look or human review: a policy or guidance document is involved, or the passages point to a limitation, risk or requirement.",
  INSUFFICIENT_INFORMATION: "The library does not contain enough reliable information to answer this. Upload the relevant document, or ask your Clyntique reviewer.",
};

export const KNOWLEDGE_SEARCH_PROMPT = "Ask anything about your content and evidence.";

export const KNOWLEDGE_NOTICE =
  "Answers are drawn only from documents in this library and from policy rules Clyntique has verified and approved. They are information for your own review, not legal, medical, regulatory or platform advice, and never a promise that a claim will work or that an advertisement will be approved.";

export const KNOWLEDGE_AI_OFF_NOTICE =
  "AI-written answers are switched off until the handling of private documents by an external AI service has been reviewed and approved. Search, passages and sources work without it.";

/** Shown next to the question box: questions are kept in an audit log, so they must not identify anyone. */
export const KNOWLEDGE_PRIVACY_NOTICE =
  "Privacy: do not enter patient names, contact details, dates of birth, record numbers or any other information that identifies a person, or other sensitive personal information. Questions you search are saved in an audit log.";

/** Shown when the address carries a question that has not been submitted as a search (an old link, or one typed by hand). */
export const KNOWLEDGE_NOT_RUN_NOTICE =
  "This question has not been searched yet. Press Search to run it. Questions made only of very short or common words cannot be searched.";

/** Words that carry no search meaning on their own (PostgreSQL drops most of them too; this keeps the OR query short). */
const STOP_WORDS = new Set(
  "a an the and or but if then than this that these those is are was were be been being do does did doing have has had having will would can could should may might must shall of in on at to for from by with about into over under between through during before after above below up down out off again further once here there when where why how all any both each few more most other some such no nor not only own same so too very s t just don now we our ours us you your yours they them their it its i me my mine he she his her him what which who whom whose will".split(" "),
);

/** Lower-cased alphanumeric terms of at least three letters, de-duplicated, minus stop words. */
export function searchTerms(question: string): string[] {
  const seen = new Set<string>();
  for (const raw of String(question ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
    const term = raw.trim();
    if (term.length < 3 || STOP_WORDS.has(term) || seen.has(term)) continue;
    seen.add(term);
  }
  return [...seen].slice(0, 24);
}

export type QueryPlan = {
  /** The question as typed (trimmed, capped), for websearch_to_tsquery: every term must match. */
  strict: string;
  /** Terms joined with OR for to_tsquery: at least one term must match (ranked by how many do). */
  loose: string | null;
  terms: string[];
};

export const QUESTION_MAX_CHARS = 300;

export function planQuery(question: string): QueryPlan | null {
  const strict = String(question ?? "").replace(/\s+/g, " ").trim().slice(0, QUESTION_MAX_CHARS);
  const terms = searchTerms(strict);
  if (!strict || terms.length === 0) return null;
  return { strict, loose: terms.map((t) => `${t}:*`).join(" | "), terms };
}

export type PassageFact = {
  chunkId: string;
  rank: number;
  /** The document's evidence type; policy references raise a concern flag. */
  documentType: string;
};

/**
 * The verdict the retrieved material supports, with no AI involved:
 * - nothing relevant → INSUFFICIENT_INFORMATION;
 * - a policy reference document or a verified policy rule is among the
 *   results, or the question is about a problem/risk → POTENTIAL_CONCERN
 *   (a person must look);
 * - otherwise passages exist → EVIDENCE_FOUND (passages, not a verification).
 */
export function verdictFor(input: { passages: PassageFact[]; ruleMatches: number; question: string }): KnowledgeVerdict {
  if (input.passages.length === 0 && input.ruleMatches === 0) return "INSUFFICIENT_INFORMATION";
  const concernWords = /\b(problem|issue|risk|concern|prohibit|banned|ban|forbid|violat|complian|allowed|legal|illegal|safe|side effect|warning|restricted)\w*/i;
  if (input.ruleMatches > 0 || input.passages.some((p) => p.documentType === "POLICY_REFERENCE") || concernWords.test(input.question)) {
    return "POTENTIAL_CONCERN";
  }
  if (input.passages.length === 0) return "INSUFFICIENT_INFORMATION";
  return "EVIDENCE_FOUND";
}

export type GroundedAnswer = {
  verdict: KnowledgeVerdict;
  /** Short plain-text answer; every sentence rests on the cited passages. */
  answer: string;
  /** Passage ids the answer rests on; a subset of what was retrieved. */
  citations: string[];
  /** What the documents do not establish. */
  uncertainties: string[];
};

const VERDICTS: KnowledgeVerdict[] = ["EVIDENCE_FOUND", "POTENTIAL_CONCERN", "INSUFFICIENT_INFORMATION"];

/** Words an answer must never use to describe a claim or an advertisement. */
const FORBIDDEN_PROMISES = /\b(guarantee[ds]?|will (definitely )?work|is (fully )?compliant|(is|are) approved|legally cleared|cleared by|certified compliant)\b/i;

/**
 * Validates what the model returned against the passages it was given.
 * Unknown citations are dropped; an answer with no surviving citation is
 * downgraded to INSUFFICIENT_INFORMATION; promise language is refused.
 * Returns null when the output is unusable, so the caller shows search results only.
 */
export function validateGroundedAnswer(raw: unknown, allowedChunkIds: readonly string[]): GroundedAnswer | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const allowed = new Set(allowedChunkIds);
  const citations = Array.isArray(o.citations) ? [...new Set(o.citations.map(String).filter((id) => allowed.has(id)))] : [];
  const answer = String(o.answer ?? "").replace(/\s+/g, " ").trim().slice(0, 1500);
  if (!answer) return null;
  if (FORBIDDEN_PROMISES.test(answer)) return null;
  const uncertainties = Array.isArray(o.uncertainties) ? o.uncertainties.map((u) => String(u).trim()).filter(Boolean).slice(0, 6) : [];
  let verdict = VERDICTS.find((v) => v === o.verdict) ?? "INSUFFICIENT_INFORMATION";
  if (citations.length === 0 && verdict !== "INSUFFICIENT_INFORMATION") verdict = "INSUFFICIENT_INFORMATION";
  return { verdict, answer, citations, uncertainties };
}

/** AI answers run only when explicitly switched on (data-handling review, brief §6/§12) and a key exists. */
export function aiAnswersEnabled(env: Record<string, string | undefined> = process.env) {
  return env.KNOWLEDGE_AI_ANSWERS === "on" && Boolean(env.GEMINI_API_KEY?.trim());
}
