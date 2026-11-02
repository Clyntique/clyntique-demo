import Link from "next/link";
import type { EvidenceRecordStatus, EvidenceType, Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";
import { getEvidenceRecords, RECORD_STATUSES } from "@/lib/data/evidence-records";
import { getLibraryDocuments } from "@/lib/data/library";
import { searchKnowledge } from "@/lib/knowledge/search";
import { basePathFor } from "@/lib/navigation";
import { uploadsConfigured } from "@/lib/review/blob";
import { libraryOwnerFor } from "@/lib/workflow/library-commands";
import { EVIDENCE_DICTIONARY_NOTICE, EVIDENCE_RECORD_NOTICE, EVIDENCE_RECORD_STATUS_LABEL } from "@/lib/workflow/labels";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { BookOpenIcon, SearchIcon } from "@/components/ui/icons";
import { Input, Select } from "@/components/ui/input";
import { ListGroup, ListRow } from "@/components/ui/list-group";
import { EmptyState } from "@/components/ui/states";
import { SummaryStrip } from "@/components/ui/summary-strip";
import { Badge } from "@/components/ui/badge";
import { EVIDENCE_TYPES } from "@/components/review/evidence-types";
import { NewRecordForm } from "./evidence-record-forms";
import { KnowledgeResults, KnowledgeSearchBox } from "./knowledge-search";
import { LibraryList } from "./library-list";
import { LibraryUploadForm } from "./library-upload";
import { RecordStatusPill, formatDay } from "./record-status";

/*
 * The Evidence Dictionary (both roles), laid out as the CEO asked on Nov 2:
 * a question box on top ("Ask your Knowledge Base"), the answer and its
 * sources in the main area, then the Content Library (uploads) and the
 * structured evidence records with their filters. The loaders decide what
 * this viewer may see (src/lib/data/*, src/lib/knowledge/search.ts); this
 * page only lays it out. The question and the record filters are plain query
 * parameters, so any view can be linked and the page needs no client state.
 */

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TYPES = Object.keys(EVIDENCE_TYPES) as EvidenceType[];

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function EvidenceDictionaryView({ role, searchParams }: { role: Role; searchParams: SearchParams }) {
  const [user, params] = await Promise.all([requireRole(role), searchParams]);
  const type = TYPES.find((t) => t === one(params.type));
  const status = RECORD_STATUSES.find((s) => s === one(params.status));
  const owner = role === "TEAM" && (one(params.owner) === "CLIENT" || one(params.owner) === "CLYNTIQUE") ? (one(params.owner) as "CLIENT" | "CLYNTIQUE") : undefined;

  // `q` asks the knowledge base; `records` filters the structured record list.
  const question = (one(params.q) ?? "").trim().slice(0, 300);
  const recordQuery = (one(params.records) ?? "").trim().slice(0, 120);

  const [records, all, documents, result] = await Promise.all([
    getEvidenceRecords(user, { query: recordQuery, type, status, owner }),
    getEvidenceRecords(user),
    getLibraryDocuments(user),
    question ? searchKnowledge(user, question) : Promise.resolve(null),
  ]);
  const base = basePathFor(role);
  const href = `${base}/evidence`;
  const count = (s: EvidenceRecordStatus) => all.filter((r) => r.status === s).length;
  const filtered = Boolean(recordQuery || type || status || owner);
  const indexed = documents.filter((d) => d.status === "READY").length;

  return (
    <>
      <PageHeader
        title="Evidence Dictionary"
        description={
          role === "TEAM"
            ? "Ask questions across Clyntique's library, documents clients shared with you, your reference records and verified policy rules. Check a record once; every submission citing it shows the result."
            : "Your searchable knowledge base: upload your content and evidence library, ask questions in your own words, open the sources, and reuse what you find as evidence on a submission."
        }
      />

      <div className="flex flex-col gap-8">
        <KnowledgeSearchBox role={role} question={question} documentsSearched={indexed} />

        {result && <KnowledgeResults role={role} result={result} />}

        <section aria-label="Content Library" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-section-title text-ink">Content Library</h2>
              <p className="text-small mt-0.5 text-muted">
                {role === "TEAM" ? "Clyntique's reference documents and the documents clients chose to share. " : "The documents your questions are answered from. "}
                Text is extracted and indexed on upload; the original file stays in private storage.
              </p>
            </div>
            <LibraryUploadForm role={role} workspaceId={libraryOwnerFor(user)} configured={uploadsConfigured()} />
          </div>
          <LibraryList role={role} documents={documents} />
        </section>

        <section aria-label="Evidence records" className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-section-title text-ink">Evidence records</h2>
            <p className="text-small mt-0.5 text-muted">
              {role === "TEAM"
                ? "Clyntique's reference records, and clients' records once they reached you through a submission."
                : "Reusable evidence for your claims: licences, studies, certifications and other substantiation. Attach a record to any submission; the reviewer sees it when you submit."}
            </p>
          </div>
          <NewRecordForm role={role} />
        </div>
        <SummaryStrip
          label="Evidence records"
          items={[
            { label: "Records", value: all.length, note: "in this workspace", href },
            { label: "Checked", value: count("ACCEPTED"), note: "accepted by a reviewer", href: `${href}?status=ACCEPTED` },
            { label: "Needs info", value: count("NEEDS_MORE_INFO") + count("NOT_ACCEPTED"), note: "more information or not accepted", href: `${href}?status=NEEDS_MORE_INFO`, tone: "attention" },
            { label: "Not yet checked", value: count("UNCHECKED"), note: "awaiting a reviewer", href: `${href}?status=UNCHECKED` },
          ]}
        />

        <form method="get" action={href} className="flex flex-col gap-3 sm:flex-row sm:items-end" role="search" aria-label="Search evidence records">
          {question && <input type="hidden" name="q" value={question} />}
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-small font-medium text-ink-soft">Filter records</span>
            <Input name="records" defaultValue={recordQuery} icon={<SearchIcon />} placeholder="Title, claim, source or description" maxLength={120} aria-label="Search evidence records" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-ink-soft">Type</span>
            <Select name="type" defaultValue={type ?? ""} aria-label="Filter by type">
              <option value="">All types</option>
              {TYPES.filter((t) => role === "TEAM" || t !== "POLICY_REFERENCE").map((t) => (
                <option key={t} value={t}>
                  {EVIDENCE_TYPES[t]}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-ink-soft">Status</span>
            <Select name="status" defaultValue={status ?? ""} aria-label="Filter by status">
              <option value="">All statuses</option>
              {RECORD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {EVIDENCE_RECORD_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </label>
          {role === "TEAM" && (
            <label className="flex flex-col gap-1.5">
              <span className="text-small font-medium text-ink-soft">Workspace</span>
              <Select name="owner" defaultValue={owner ?? ""} aria-label="Filter by workspace">
                <option value="">All</option>
                <option value="CLYNTIQUE">Clyntique records</option>
                <option value="CLIENT">Client records</option>
              </Select>
            </label>
          )}
          <div className="flex gap-2">
            <button type="submit" className={buttonClasses({ variant: "secondary" })}>
              Apply
            </button>
            {filtered && (
              <Link href={question ? `${href}?q=${encodeURIComponent(question)}` : href} className={buttonClasses({ variant: "ghost" })}>
                Clear
              </Link>
            )}
          </div>
        </form>

        <ListGroup
          title={filtered ? "Matching records" : "All records"}
          count={records.length}
          empty={
            <EmptyState
              icon={<BookOpenIcon />}
              title={filtered ? "No record matches these filters." : role === "TEAM" ? "No records yet." : "Your dictionary is empty."}
              description={
                role === "TEAM"
                  ? "Add a Clyntique reference record, or wait for a client's record to arrive with a submission."
                  : "Add a record for a licence, study or certification you reuse across ads, or tick “Save to my Evidence Dictionary” when you add evidence to a submission."
              }
            />
          }
        >
          {records.map((r) => (
            <ListRow
              key={r.id}
              href={`${href}/${r.id}`}
              title={r.title}
              subtitle={
                <>
                  {EVIDENCE_TYPES[r.type]}
                  {r.claimText ? ` · “${r.claimText}”` : ""}
                  {r.source ? ` · ${r.source}` : ""}
                  {role === "TEAM" ? ` · ${r.isClyntique ? "Clyntique record" : (r.ownerName ?? "Client")}` : ""}
                </>
              }
              detail={
                <p className="text-meta mt-1 flex flex-wrap gap-x-2">
                  <span>
                    {r.usageCount} {r.usageCount === 1 ? "submission" : "submissions"}
                  </span>
                  {r.validUntil && <span>Valid until {formatDay(r.validUntil)}</span>}
                  <span>Added {formatDay(r.createdAt)}</span>
                </p>
              }
              aside={
                <>
                  {r.isClyntique && role === "TEAM" && <Badge tone="brand">Clyntique</Badge>}
                  <RecordStatusPill status={r.status} expired={r.expired} />
                </>
              }
            />
          ))}
        </ListGroup>

        <div className="flex flex-col gap-1">
          <p className="text-meta">{EVIDENCE_DICTIONARY_NOTICE}</p>
          <p className="text-meta">{EVIDENCE_RECORD_NOTICE}</p>
        </div>
        </section>
      </div>
    </>
  );
}
