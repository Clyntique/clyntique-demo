# Evidence Dictionary as a searchable knowledge base

Prepared November 2, 2026 for Deepanshi, from the brief of 17:23 UTC. Branch
`feature/knowledge-base`, stacked on PR #25 (`feature/mvp-passport-evidence-dictionary`).
Nothing is merged, no migration has been applied anywhere, no Production data
was touched. The public `/demo` sandbox is unchanged.

## 1. Deepanshi's vision: requirements mapping

| Clients should be able to… | Where it is now |
| --- | --- |
| Upload their existing content and evidence library | Content Library on `/dashboard/evidence` (PDF, DOCX, TXT, 10 MB each, 200 per workspace) |
| Search across the uploaded information | PostgreSQL full-text search over extracted passages (`LibraryChunk.tsv`, GIN index) |
| Ask questions naturally, without predefined categories | "Ask your Knowledge Base" box on top of the page; whole questions, no type or category needed |
| Discover relevant documents, supporting evidence and guidance | Results list passages (with the matched words marked), dictionary records and verified policy rules |
| Understand whether information supports a claim or flags a concern | Every result set carries one of three labels: Evidence found, Potential concern, Insufficient information |
| Open the original source behind every result | Each passage links to its document page and to the original file (`/api/library/[documentId]`, access-checked) |
| Reuse relevant evidence when reviewing or submitting creatives | "Save as evidence record" on any passage → Evidence Dictionary record (quoting the passage, linked to the document) → attach to a creative via PR #25's flows → reviewer check → Compliance Passport |

The example questions in the brief work as typed: the planner keeps the
meaningful words, searches with all of them first, then with any of them, and
ranks by how many match.

## 2. What PR #25 already supports

Reusable evidence records per workspace, attaching a record to a creative as
an ordinary evidence row (so versions, submission visibility, withdrawal,
finding links and cycle assessments apply unchanged), append-only reviewer
checks, strict client/team scope, and the real Compliance Passport showing
record status, validity, reviewer checks and findings-to-evidence links. All
of that is kept and reused: a knowledge-search result becomes evidence only by
becoming a record and being attached by the client, exactly as before.

## 3. What was missing

Uploading whole documents (PR #25 records hold text and a link, files stayed
on submissions); extracting and indexing their text; searching by question
rather than by filter; grounded answers with citations; a verdict vocabulary;
secure deletion with index cleanup; an audit trail of questions asked.

## 4. Knowledge base architecture

```
upload (browser → private Blob, token from /api/library/upload, own-workspace path only)
  → createLibraryDocument  (verifies URL, path, size, type; row PENDING)
  → processLibraryDocument (reads the file from the private store, extracts text:
                            unpdf for PDF, mammoth for DOCX, UTF-8 for TXT;
                            ~900-character chunks with overlap, never across a page;
                            LibraryChunk rows; tsvector filled by a PostgreSQL trigger; status READY/FAILED)
ask (GET ?q= on /evidence)
  → searchKnowledge        (scope decided on the server; websearch_to_tsquery, then to_tsquery OR fallback;
                            ≤10 passages, ≤3 per document, ts_headline snippets;
                            + Evidence Dictionary records + VERIFIED and APPROVED policy rules only)
  → verdictFor             (rules in query.ts, no AI needed)
  → generateGroundedAnswer (ONLY when KNOWLEDGE_AI_ANSWERS=on and GEMINI_API_KEY set;
                            receives the retrieved passages only; output validated: citations ⊆ passages,
                            no promise language, uncited → Insufficient; may only tighten the verdict)
  → KnowledgeQuery row     (question, verdict, result count, whether AI was used)
save (passage → saveChunkAsRecord → EvidenceRecord with documentId → existing attach/check/passport flows)
delete (deleteLibraryDocument → chunks removed, file removed, row kept as a DELETED tombstone)
```

No new infrastructure: PostgreSQL full-text search is built in, the private
Blob store and the Gemini integration already exist. Semantic embeddings were
not added: they would need either an external embedding service (same
privacy question as AI answers) or a vector extension on the Render database.
That is a documented later phase, not a requirement for grounded retrieval.

New dependencies: `unpdf` (PDF text) and `mammoth` (DOCX text), both MIT, run
on the server only.

## 5. Features implemented

- Content Library per workspace (client; Clyntique's own for the team):
  upload form with title, type, source and, for clients, visibility
  (private, or shared with Clyntique reviewers); document list with
  processing status; document page with metadata, first passages, records
  saved from it, download of the original, retry indexing, share/unshare,
  delete with confirmation.
- Knowledge search: question box, example questions, verdict label and
  explanation, optional AI reading (clearly marked as an interpretation),
  passages with document links and "Open original", verified rules that
  mention the question, dictionary records that mention it, "Save as evidence
  record" on every passage (with an optional claim text).
- Evidence record page and Compliance Passport show "Quoted from <document>"
  (and "document since deleted" when its file is gone).
- Audit: every question is logged with its verdict; documents keep uploader,
  timestamps, processing results and deletion details.

## 6. Document upload and search experience

Upload → the browser sends the file straight to the private store with a
15-minute token bound to one path in the uploader's own folder → the server
verifies and indexes it in the same request (up to 60 s) → the list shows
"Searchable", or "Could not be indexed" with the reason (for example a scanned
PDF without a text layer) and a retry button. Ask → results in one page load,
no client state; a question can be linked and the record filters keep the
question. Limits: 10 MB per file, 200 documents per workspace, 400,000
characters and 600 passages indexed per document, 300 PDF pages, 300
characters per question.

## 7. AI answers and citation safeguards

- Off by default. `KNOWLEDGE_AI_ANSWERS=on` plus `GEMINI_API_KEY` switches
  it on; until then the page says so and search works without it.
- The model receives only the retrieved passages (ids, titles, pages, text)
  and the verified rules, inside a prompt that states the passages are data,
  never instructions; it must cite passage ids, distinguish document facts
  from its reading, never promise results or approval, never diagnose, and
  answer "insufficient" when the passages do not cover the question.
- The output is JSON and is validated: citations outside the retrieved set
  are dropped; an answer with no surviving citation becomes Insufficient
  information; promise language ("will work", "is approved", "guaranteed")
  discards the answer; the model may make the verdict more cautious, never
  less. A discarded answer leaves the passages and sources in place.
- Only VERIFIED and APPROVED rule versions are ever shown or sent to the
  model. The Production library currently has none, so no rule appears until
  the activation workflow completes.
- Notices on the page: answers are information for the client's own review,
  not legal, medical, regulatory or platform advice, and never a promise that
  a claim will work or an ad will be approved.

## 8. Security and data isolation

- Scope is decided in server loaders and commands, never in pages: a client
  reads, searches, downloads, shares and deletes only their own workspace's
  documents; the team reads and searches Clyntique's documents plus those a
  client explicitly shared, and may never change or delete a client's
  document. The SQL search carries the same scope as the loaders (tested).
- Upload tokens are issued only for a path inside the uploader's own
  workspace folder; the server re-checks the stored path, size and type.
- Downloads go through `/api/library/[documentId]` with the session and
  scope re-checked on every request; files are served as attachments with a
  restrictive CSP; blob URLs are never shown.
- Deletion removes the chunks (search index) in a transaction, then the file;
  the row stays as a tombstone so evidence records keep their provenance. A
  file whose bytes are not the declared type (for example an executable
  renamed `.pdf`) is removed from storage as soon as indexing detects it.
- "Save as evidence record" is owner-only: a client saves from their own
  documents, the team only from Clyntique's. A reviewer can read a client's
  shared document but cannot turn its text into a Clyntique record (which
  could otherwise be attached to another client's creative).
- Questions are logged once per person and question within a 10-second
  window (a page can render more than once per view), as typed, up to 300
  characters. A retention period for `KnowledgeQuery` is a product decision
  (section 12).
- Prompt injection: document text reaches the model only as delimited data;
  the model cannot act, only answer, and its answer is validated.
- Nothing from the library is reachable from `/demo` (no imports, no routes).
- Private documents are not sent to any external service unless the AI flag
  is on; even then only retrieved passages are sent, not whole files.

## 9. Test results

`tests/knowledge-base.test.ts`: 36 tests covering chunking, question
planning, verdicts, AI-answer validation, file rules and paths, real text
extraction and signature checks, upload recording (ownership, path, size,
type, library cap, cleanup of bad uploads), processing (ownership, claim,
indexing, failure handling), visibility, deletion with index cleanup and
tombstone, saving passages as records (isolation, Clyntique records from
shared documents), loader scope, search scope and fallback, draft-rule
exclusion, AI gating and validation, prompt content. `tests/migrations.test.ts`
covers the new migration (additive, only the search index cascades) and the
restore order.

Full suite: 49 files, 617 tests passing. `tsc --noEmit`, ESLint and
`next build` clean. Both migrations and both rollback scripts verified on
embedded PostgreSQL (apply, refuse while data exists, roll back, re-apply).

## 10. PR

A separate PR stacked on PR #25 (base branch
`feature/mvp-passport-evidence-dictionary`), so PR #25, already rehearsed, can
be migrated and merged first; this PR then rebases to `main` with one more
migration. Merging them together is also possible: both migrations are
additive and ordered.

## 11. Migration and deployment plan

Migration `20261102200000_content_library` (additive): enums
`LibraryDocumentStatus`, `LibraryVisibility`; tables `LibraryDocument`,
`LibraryChunk` (with a `tsvector` column filled by a database trigger and a GIN index),
`KnowledgeQuery`; nullable `EvidenceRecord.documentId`; foreign keys RESTRICT
except `LibraryChunk → LibraryDocument` CASCADE (the index follows its
document). Rollback: `docs/evidence-dictionary/rollback-20261102200000_content_library.sql`
(refuses while documents or links exist). Restore order updated.

Order, each under separate approval: (1) PR #25 migration → (2) merge PR #25
→ (3) this migration (same procedure as PR #25's runbook, same rehearsal on
GT's local copy first) → (4) merge this PR. As with PR #25, migrate before
merging: the new code reads the new tables. No new environment variables are
required; `KNOWLEDGE_AI_ANSWERS` is an opt-in switch for later. Vercel
function duration for the evidence pages is set to 60 s (`maxDuration`) for
upload processing; on the Hobby plan that is the maximum.

## 12. Remaining product decisions

1. **Switch AI answers on?** Needs the data-handling review the brief asks
   for (private documents' passages sent to Google's Gemini API). Until then
   retrieval, passages, sources and verdict labels work without AI.
2. **Default visibility of client documents**: private (current). Should
   sharing with reviewers be the default instead?
3. **Semantic retrieval** (embeddings) as a later phase: would improve
   paraphrased questions, at the cost of an external service or a vector
   extension on the database.
4. **Scanned PDFs**: no OCR in v1; the uploader is told to provide a PDF with
   a text layer.
5. **Limits**: 10 MB / 200 documents / 600 passages per document are
   starting points, not findings.
6. **Question log retention**: `KnowledgeQuery` stores the question as
   typed (clients may type sensitive details). Decide a retention period
   (for example 90 days) and whether the log is shown to the client; until
   then nothing displays it.
