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
 * from the passages below. Every question is logged (KnowledgeQuery).
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
// Long enough to cover the dashboard's 30 s auto-refresh (AutoRefresh in the
// signed-in layouts re-renders an open results page), so a results tab left
// open logs its question at most twice an hour instead of every 30 s.
export const QUERY_LOG_WINDOW_MS = 30 * 60_000;
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

export async function searchKnowledge(user: CurrentUser, question: string): Promise<KnowledgeResult | null> {
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
    const generated = await generateGroundedAnswer(plan.strict, passages, rules);
    if (generated.ok) {
      answer = generated.answer;
      // The model may only make the verdict more cautious, never less.
      if (answer.verdict === "INSUFFICIENT_INFORMATION" || (answer.verdict === "POTENTIAL_CONCERN" && verdict === "EVIDENCE_FOUND")) verdict = answer.verdict;
    } else {
      aiNote = generated.note;
    }
  } else if (aiEnabled) {
    aiNote = "No passages to answer from.";
  }

  // One audit row per question: the page renders more than once per view
  // (two concurrent renders a few milliseconds apart, plus the layout's 30 s
  // auto-refresh), so the same question by the same person within
  // QUERY_LOG_WINDOW_MS (30 minutes) is logged once.
  // The check and the insert run under a transaction-scoped advisory lock on
  // (person, question), so concurrent renders cannot both pass the check.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${user.id}\n${plan.strict}`}))`;
      const recent = await tx.knowledgeQuery.findFirst({
        where: { userId: user.id, question: plan.strict, createdAt: { gte: new Date(Date.now() - QUERY_LOG_WINDOW_MS) } },
        select: { id: true },
      });
      if (!recent) {
        await tx.knowledgeQuery.create({ data: { userId: user.id, ownerClientId: user.role === "TEAM" ? null : user.id, question: plan.strict, verdict, resultCount: passages.length, aiUsed: answer !== null } });
      }
    });
  } catch (error) {
    console.error("Knowledge query log failed", error instanceof Error ? error.name : "unknown error");
  }

  return { question: plan.strict, verdict, passages, records: records.slice(0, 6), rules, answer, aiEnabled, aiNote, documentsSearched };
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
