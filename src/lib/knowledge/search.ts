import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { EvidenceType, LibraryVisibility } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { basePathFor } from "@/lib/navigation";
import { getEvidenceRecords, type EvidenceRecordSummary } from "@/lib/data/evidence-records";
import { getDbPolicyRules } from "@/lib/policy/db";
import { libraryScope } from "@/lib/data/library";
import { generateGroundedAnswer } from "./answer";
import { aiAnswersEnabled, planQuery, verdictFor, type GroundedAnswer, type KnowledgeVerdict } from "./query";

/*
 * Knowledge search (Nov 2): one question, searched across the viewer's
 * Content Library (PostgreSQL full-text search over LibraryChunk), the
 * viewer's Evidence Dictionary records, and the policy rules Clyntique has
 * VERIFIED and APPROVED (never drafts). The verdict is decided by rules
 * (query.ts); an AI-written answer is added only when switched on, and only
 * from the passages below.
 *
 * Logging (Nov 10): a question is logged (KnowledgeQuery) only when a person
 * submits the search form (submitKnowledgeSearch, called by the form action).
 * Rendering the results page never writes a log row, so the signed-in
 * layout's 30 s auto-refresh, a reload or the back button cannot add rows.
 * The page shows results only for a question that has its log row
 * (findLoggedSearch), so every displayed result has exactly one audit entry.
 */

export type Passage = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentType: EvidenceType;
  fileName: string;
  /** Whether the viewer's workspace uploaded the document (only then can a passage be saved as a record). */
  ownedByViewer: boolean;
  page: number | null;
  /** Full passage text. */
  text: string;
  /** Short excerpt with the matched words marked [[like this]]. */
  snippet: string;
  rank: number;
  href: string;
  downloadHref: string;
};

export type RuleHit = {
  id: string;
  versionId: string;
  code: string;
  title: string;
  summary: string;
  jurisdictionCode: string;
  platformCode: string | null;
  versionNumber: number;
};

export type KnowledgeResult = {
  question: string;
  verdict: KnowledgeVerdict;
  passages: Passage[];
  records: EvidenceRecordSummary[];
  rules: RuleHit[];
  /** Present only when AI answers are on and the model returned a usable, grounded answer. */
  answer: GroundedAnswer | null;
  aiEnabled: boolean;
  /** Why no AI answer was produced although AI is on. */
  aiNote: string | null;
  /** Number of indexed documents searched. */
  documentsSearched: number;
};

export const MAX_PASSAGES = 10;
// A double click or a double form submission of the same question by the
// same person within this window is one search, and gets one log row.
// Deliberately asking the same question again later is logged again.
export const DOUBLE_SUBMIT_WINDOW_MS = 10_000;
// An AI answer may be requested once per logged search, and only while the
// search is this fresh (the first render after the form was submitted).
export const AI_CLAIM_WINDOW_MS = 2 * 60_000;
export const AI_ONCE_NOTICE = "The AI reading is produced once, when a search is submitted. Press Search to ask again.";
const SEARCH_ID_MAX_CHARS = 64;
const MAX_PER_DOCUMENT = 3;

type Row = { id: string; documentId: string; page: number | null; text: string; snippet: string; rank: number };

function scopeSql(user: CurrentUser): Prisma.Sql {
  // Mirrors libraryScope(): a client's own documents, or Clyntique's plus shared ones for the team.
  if (user.role === "CLIENT") return Prisma.sql`d."ownerClientId" = ${user.id}`;
  const shared: LibraryVisibility = "TEAM";
  return Prisma.sql`(d."ownerClientId" IS NULL OR d."visibility" = ${shared}::"LibraryVisibility")`;
}

async function searchChunks(user: CurrentUser, mode: "strict" | "loose", query: string, limit: number): Promise<Row[]> {
  const tsquery = mode === "strict" ? Prisma.sql`websearch_to_tsquery('english', ${query})` : Prisma.sql`to_tsquery('english', ${query})`;
  return prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT c."id", c."documentId", c."page", c."text",
           ts_headline('english', c."text", q, 'MaxWords=28, MinWords=12, StartSel=[[, StopSel=]]') AS "snippet",
           ts_rank_cd(c."tsv", q, 32)::float8 AS "rank"
    FROM "LibraryChunk" c
    JOIN "LibraryDocument" d ON d."id" = c."documentId"
    CROSS JOIN ${tsquery} q
    WHERE d."status" = 'READY'::"LibraryDocumentStatus" AND ${scopeSql(user)} AND c."tsv" @@ q
    ORDER BY "rank" DESC, c."documentId", c."index"
    LIMIT ${limit}
  `);
}

/** Verified and approved rules whose title or summary mentions at least two of the question's terms (one, for a one-term question). */
async function matchingRules(terms: string[]): Promise<RuleHit[]> {
  const rules = await getDbPolicyRules({ status: "ACTIVE" });
  const needed = Math.min(2, terms.length);
  const hits: RuleHit[] = [];
  for (const rule of rules) {
    const v = rule.currentVersion;
    if (!v || v.status !== "ACTIVE" || v.verificationStatus !== "VERIFIED") continue;
    const haystack = `${rule.title} ${v.summary}`.toLowerCase();
    const matched = terms.filter((t) => haystack.includes(t)).length;
    if (matched >= needed) {
      hits.push({ id: rule.id, versionId: v.id, code: rule.code, title: rule.title, summary: v.summary, jurisdictionCode: rule.jurisdictionCode, platformCode: rule.platformCode ?? null, versionNumber: v.versionNumber });
    }
  }
  return hits.slice(0, 5);
}

export type SearchOptions = {
  /**
   * Id of this search's log row (from submitKnowledgeSearch). Without it no
   * external AI request is ever made. With it, an AI answer is requested only
   * if this call wins the one-time claim on that row (claimAiAnswer).
   */
  searchId?: string | null;
};

/**
 * One-time permission to send this search to the external AI service: flips
 * `aiUsed` from false to true on the search's own log row, atomically, and
 * only while the row is fresh. A page refresh, a reload, a second tab or a
 * concurrent render finds the flag already set and gets no AI request.
 * `aiUsed` therefore means "an external AI request was made for this search".
 */
async function claimAiAnswer(user: CurrentUser, searchId: string, question: string): Promise<boolean> {
  try {
    const claimed = await prisma.knowledgeQuery.updateMany({
      where: { id: searchId, userId: user.id, question, aiUsed: false, createdAt: { gte: new Date(Date.now() - AI_CLAIM_WINDOW_MS) } },
      data: { aiUsed: true },
    });
    return claimed.count === 1;
  } catch (error) {
    console.error("Knowledge AI claim failed", error instanceof Error ? error.name : "unknown error");
    return false;
  }
}

/**
 * Runs one question and returns what this viewer may see. Read-only apart
 * from the one-time AI claim above: it never creates a log row.
 */
export async function searchKnowledge(user: CurrentUser, question: string, options: SearchOptions = {}): Promise<KnowledgeResult | null> {
  const plan = planQuery(question);
  if (!plan) return null;
  const base = basePathFor(user.role);

  const [documentsSearched, strictRows, records, rules] = await Promise.all([
    prisma.libraryDocument.count({ where: { AND: [libraryScope(user), { status: "READY" }] } }),
    searchChunks(user, "strict", plan.strict, MAX_PASSAGES * 2),
    getEvidenceRecords(user, { query: plan.terms.slice(0, 3).join(" ") }).catch(() => [] as EvidenceRecordSummary[]),
    matchingRules(plan.terms),
  ]);
  // A question rarely contains every word of the passage that answers it: when the
  // all-words query finds little, add passages matching any of the words.
  let rows = strictRows;
  if (rows.length < 3 && plan.loose) {
    const loose = await searchChunks(user, "loose", plan.loose, MAX_PASSAGES * 2).catch(() => [] as Row[]);
    const seen = new Set(rows.map((r) => r.id));
    rows = [...rows, ...loose.filter((r) => !seen.has(r.id))];
  }

  // At most a few passages per document, so one long document cannot crowd out the rest.
  const perDocument = new Map<string, number>();
  const kept: Row[] = [];
  for (const r of rows) {
    const n = perDocument.get(r.documentId) ?? 0;
    if (n >= MAX_PER_DOCUMENT) continue;
    perDocument.set(r.documentId, n + 1);
    kept.push(r);
    if (kept.length >= MAX_PASSAGES) break;
  }
  const docs = kept.length
    ? await prisma.libraryDocument.findMany({ where: { id: { in: [...new Set(kept.map((r) => r.documentId))] } }, select: { id: true, title: true, type: true, fileName: true, ownerClientId: true } })
    : [];
  const docById = new Map(docs.map((d) => [d.id, d]));
  const passages: Passage[] = kept.flatMap((r) => {
    const d = docById.get(r.documentId);
    if (!d) return [];
    return [{ chunkId: r.id, documentId: d.id, documentTitle: d.title, documentType: d.type, fileName: d.fileName, ownedByViewer: d.ownerClientId === (user.role === "TEAM" ? null : user.id), page: r.page, text: r.text, snippet: r.snippet, rank: r.rank, href: `${base}/evidence/library/${d.id}`, downloadHref: `/api/library/${d.id}` }];
  });

  let verdict = verdictFor({ question: plan.strict, ruleMatches: rules.length, passages: passages.map((p) => ({ chunkId: p.chunkId, rank: p.rank, documentType: p.documentType })) });

  const aiEnabled = aiAnswersEnabled();
  let answer: GroundedAnswer | null = null;
  let aiNote: string | null = null;
  if (aiEnabled && passages.length > 0) {
    const searchId = validSearchId(options.searchId);
    if (searchId && (await claimAiAnswer(user, searchId, plan.strict))) {
      const ruleVerdict = verdict;
      const generated = await generateGroundedAnswer(plan.strict, passages, rules);
      if (generated.ok) {
        answer = generated.answer;
        // The model may only make the verdict more cautious, never less.
        if (answer.verdict === "INSUFFICIENT_INFORMATION" || (answer.verdict === "POTENTIAL_CONCERN" && verdict === "EVIDENCE_FOUND")) verdict = answer.verdict;
      } else {
        aiNote = generated.note;
      }
      if (verdict !== ruleVerdict) {
        // Keep the log row in step with the verdict the person was shown.
        await prisma.knowledgeQuery.updateMany({ where: { id: searchId, userId: user.id }, data: { verdict } }).catch(() => undefined);
      }
    } else {
      aiNote = AI_ONCE_NOTICE;
    }
  } else if (aiEnabled) {
    aiNote = "No passages to answer from.";
  }

  return { question: plan.strict, verdict, passages, records: records.slice(0, 6), rules, answer, aiEnabled, aiNote, documentsSearched };
}

function validSearchId(value: string | null | undefined): string | null {
  const id = String(value ?? "").trim();
  return id && id.length <= SEARCH_ID_MAX_CHARS && /^[A-Za-z0-9_-]+$/.test(id) ? id : null;
}

/**
 * The log row of a submitted search, if `searchId` names one that belongs to
 * this person and this exact question. Read-only. The results page shows
 * results only when this returns a row, so a hand-typed or shared `?q=` link
 * cannot run a search that is missing from the audit log, and one person's
 * search id is useless to anyone else.
 */
export async function findLoggedSearch(user: CurrentUser, searchId: string | null | undefined, question: string): Promise<{ id: string; question: string } | null> {
  const id = validSearchId(searchId);
  const plan = planQuery(question);
  if (!id || !plan) return null;
  return prisma.knowledgeQuery.findFirst({ where: { id, userId: user.id, question: plan.strict }, select: { id: true, question: true } });
}

export type SubmittedSearch = { question: string; searchId: string | null };

/**
 * A person pressed Search (or an example question): runs the question once,
 * with no AI, and writes its one audit row. Called only by the form action.
 * Returns null for a question with nothing searchable in it; `searchId` is
 * null when the audit row could not be written (the page then shows no
 * results, so nothing is displayed without an audit entry).
 *
 * The check and the insert run under a transaction-scoped advisory lock on
 * (person, question), so a double click cannot write two rows.
 */
export async function submitKnowledgeSearch(user: CurrentUser, question: string): Promise<SubmittedSearch | null> {
  const plan = planQuery(question);
  if (!plan) return null;
  const result = await searchKnowledge(user, plan.strict);
  if (!result) return null;
  try {
    const searchId = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${user.id}\n${plan.strict}`}))`;
      const recent = await tx.knowledgeQuery.findFirst({
        where: { userId: user.id, question: plan.strict, createdAt: { gte: new Date(Date.now() - DOUBLE_SUBMIT_WINDOW_MS) } },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (recent) return recent.id;
      const created = await tx.knowledgeQuery.create({
        data: { userId: user.id, ownerClientId: user.role === "TEAM" ? null : user.id, question: plan.strict, verdict: result.verdict, resultCount: result.passages.length, aiUsed: false },
        select: { id: true },
      });
      return created.id;
    });
    return { question: plan.strict, searchId };
  } catch (error) {
    console.error("Knowledge query log failed", error instanceof Error ? error.name : "unknown error");
    return { question: plan.strict, searchId: null };
  }
}

/** Recent questions of this workspace, for "have we asked this before". */
export async function recentQuestions(user: CurrentUser, limit = 8) {
  return prisma.knowledgeQuery.findMany({
    where: { ownerClientId: user.role === "TEAM" ? null : user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, question: true, verdict: true, resultCount: true, createdAt: true },
  });
}
