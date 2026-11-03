import Link from "next/link";
import { notFound } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";
import { getLibraryDocument } from "@/lib/data/library";
import { KNOWLEDGE_NOTICE } from "@/lib/knowledge/query";
import { basePathFor } from "@/lib/navigation";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Card, SectionHeader } from "@/components/ui/card";
import { EVIDENCE_TYPES } from "@/components/review/evidence-types";
import { DeleteDocumentForm, ProcessDocumentForm, SaveChunkForm, VisibilityForm } from "./library-controls";
import { LIBRARY_VISIBILITY_LABEL, LibraryStatusPill, formatBytes } from "./library-status";
import { formatDateTime, formatDay } from "./record-status";

/*
 * One Content Library document (both roles): what it is, how it was
 * indexed, the first passages, the records saved from it, and the owner's
 * controls. The loader (getLibraryDocument) decides visibility; missing and
 * forbidden both 404.
 */

export async function LibraryDocumentView({ role, params }: { role: Role; params: Promise<{ documentId: string }> }) {
  const [user, { documentId }] = await Promise.all([requireRole(role), params]);
  const doc = await getLibraryDocument(user, documentId);
  if (!doc) notFound();
  const base = basePathFor(role);
  const evidenceHref = `${base}/evidence`;

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <Breadcrumb trail={[{ label: "Evidence Dictionary", href: evidenceHref }]} current={doc.title} />

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="outline">{EVIDENCE_TYPES[doc.type]}</Badge>
          {role === "TEAM" && (doc.isClyntique ? <Badge tone="brand">Clyntique library</Badge> : <Badge>{doc.ownerName ?? "Client"} workspace, shared</Badge>)}
          {role === "CLIENT" && doc.visibility === "TEAM" && <Badge tone="brand">Shared with Clyntique</Badge>}
          <LibraryStatusPill status={doc.status} />
        </div>
        <h1 className="text-page-title min-w-0 text-balance break-words text-ink">{doc.title}</h1>
        {doc.status === "FAILED" && doc.error && <p className="text-small text-attention-ink">{doc.error}</p>}
        {doc.status === "READY" && doc.error && <p className="text-small text-ink-soft">{doc.error}</p>}
        {doc.status === "DELETED" && <p className="text-small text-ink-soft">This document was deleted{doc.deletedAt ? ` on ${formatDay(doc.deletedAt)}` : ""}. Its file and passages are gone; records that quoted it keep their quote.</p>}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="flex flex-col gap-3 p-4 sm:p-5">
            <dl className="grid gap-x-6 gap-y-1.5 text-small sm:grid-cols-[9rem_1fr]">
              <dt className="text-muted">File</dt>
              <dd className="break-words text-ink">
                {doc.fileName} · {formatBytes(doc.fileSize)}
                {doc.pageCount ? ` · ${doc.pageCount} pages` : ""}
              </dd>
              <dt className="text-muted">Source</dt>
              <dd className="text-ink">{doc.source ?? "Not stated"}</dd>
              <dt className="text-muted">Uploaded</dt>
              <dd className="text-ink">
                {formatDateTime(doc.createdAt)} by {role === "TEAM" || doc.mine ? doc.uploadedByName : "your workspace"}
              </dd>
              <dt className="text-muted">Indexed</dt>
              <dd className="text-ink">
                {doc.processedAt ? `${formatDateTime(doc.processedAt)} · ${doc.chunkCount} passages · ${doc.textChars.toLocaleString("en-US")} characters` : "Not yet"}
              </dd>
              {role === "CLIENT" && (
                <>
                  <dt className="text-muted">Visibility</dt>
                  <dd className="text-ink">{LIBRARY_VISIBILITY_LABEL[doc.visibility]}</dd>
                </>
              )}
            </dl>
            {doc.downloadable && (
              <div>
                <a href={`/api/library/${doc.id}`} className="text-small font-medium text-brand-700 hover:underline">
                  Download the original file
                </a>
              </div>
            )}
          </Card>

          {doc.preview.length > 0 && (
            <div className="flex flex-col gap-3">
              <SectionHeader title="First passages" description="What the search index holds, in the document's own words. Search finds any passage, not only these." />
              <ul className="flex flex-col gap-2">
                {doc.preview.map((c) => (
                  <li key={c.id} className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
                    <p className="text-meta">
                      Passage {c.index + 1}
                      {c.page ? ` · page ${c.page}` : ""}
                    </p>
                    <p className="text-small whitespace-pre-line break-words text-ink-soft">{c.text}</p>
                    {doc.mine && (
                      <div>
                        <SaveChunkForm chunkId={c.id} recordsHref={evidenceHref} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <SectionHeader title="Evidence records saved from this document" />
            {doc.records.length === 0 ? (
              <p className="text-meta">None yet. Ask a question, then save a passage as a record to attach it to a submission.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {doc.records.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-4 py-3">
                    <Link href={`${evidenceHref}/${r.id}`} className="text-small font-medium text-ink hover:underline">
                      {r.title}
                    </Link>
                    <span className="text-meta">Saved {formatDay(r.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-meta">{KNOWLEDGE_NOTICE}</p>
        </div>

        <aside className="flex flex-col gap-4">
          {doc.mine && doc.status !== "DELETED" && (
            <Card className="flex flex-col gap-4 p-4">
              <h2 className="text-card-title">Manage</h2>
              {(doc.status === "FAILED" || doc.status === "PENDING") && doc.downloadable && <ProcessDocumentForm documentId={doc.id} />}
              {role === "CLIENT" && <VisibilityForm documentId={doc.id} visibility={doc.visibility} />}
              <DeleteDocumentForm documentId={doc.id} />
            </Card>
          )}
          {!doc.mine && role === "TEAM" && <p className="text-meta">A client&apos;s document: you can read and quote it, not change or delete it.</p>}
        </aside>
      </div>
    </div>
  );
}
