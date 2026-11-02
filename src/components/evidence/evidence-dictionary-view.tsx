import Link from "next/link";
import type { EvidenceRecordStatus, EvidenceType, Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";
import { getEvidenceRecords, RECORD_STATUSES } from "@/lib/data/evidence-records";
import { basePathFor } from "@/lib/navigation";
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
import { RecordStatusPill, formatDay } from "./record-status";

/*
 * The Evidence Dictionary list (both roles). The loader decides what this
 * viewer may see (src/lib/data/evidence-records.ts); this page only lays it
 * out. Search and filters are plain query parameters, so a filtered view can
 * be linked and the page needs no client state.
 */

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TYPES = Object.keys(EVIDENCE_TYPES) as EvidenceType[];

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function EvidenceDictionaryView({ role, searchParams }: { role: Role; searchParams: SearchParams }) {
  const [user, params] = await Promise.all([requireRole(role), searchParams]);
  const query = (one(params.q) ?? "").trim().slice(0, 120);
  const type = TYPES.find((t) => t === one(params.type));
  const status = RECORD_STATUSES.find((s) => s === one(params.status));
  const owner = role === "TEAM" && (one(params.owner) === "CLIENT" || one(params.owner) === "CLYNTIQUE") ? (one(params.owner) as "CLIENT" | "CLYNTIQUE") : undefined;

  const [records, all] = await Promise.all([getEvidenceRecords(user, { query, type, status, owner }), getEvidenceRecords(user)]);
  const base = basePathFor(role);
  const href = `${base}/evidence`;
  const count = (s: EvidenceRecordStatus) => all.filter((r) => r.status === s).length;
  const filtered = Boolean(query || type || status || owner);

  return (
    <>
      <PageHeader
        title="Evidence Dictionary"
        description={
          role === "TEAM"
            ? "Clyntique's reference records, and clients' records once they reached you through a submission. Check a record once; every submission citing it shows the result."
            : "Reusable evidence for your claims: licences, studies, certifications and other substantiation. Attach a record to any submission; the reviewer sees it when you submit."
        }
        action={<NewRecordForm role={role} />}
      />

      <div className="flex flex-col gap-6">
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
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-small font-medium text-ink-soft">Search</span>
            <Input name="q" defaultValue={query} icon={<SearchIcon />} placeholder="Title, claim, source or description" maxLength={120} aria-label="Search evidence records" />
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
              <Link href={href} className={buttonClasses({ variant: "ghost" })}>
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
      </div>
    </>
  );
}
