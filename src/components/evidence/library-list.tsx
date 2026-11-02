import type { Role } from "@/generated/prisma/enums";
import type { LibraryDocumentSummary } from "@/lib/data/library";
import { basePathFor } from "@/lib/navigation";
import { Badge } from "@/components/ui/badge";
import { FileIcon } from "@/components/ui/icons";
import { ListGroup, ListRow } from "@/components/ui/list-group";
import { EmptyState } from "@/components/ui/states";
import { EVIDENCE_TYPES } from "@/components/review/evidence-types";
import { LibraryStatusPill, formatBytes } from "./library-status";
import { formatDay } from "./record-status";

/** The documents of this viewer's Content Library (the loader decided which). */
export function LibraryList({ role, documents }: { role: Role; documents: LibraryDocumentSummary[] }) {
  const base = basePathFor(role);
  return (
    <ListGroup
      title="Content Library"
      count={documents.length}
      empty={
        <EmptyState
          icon={<FileIcon />}
          title={role === "TEAM" ? "No documents yet." : "Your library is empty."}
          description={
            role === "TEAM"
              ? "Upload Clyntique reference documents, or wait for a client to share one with reviewers."
              : "Upload your studies, licences, brochures and guidance. Once indexed, you can ask questions about them."
          }
        />
      }
    >
      {documents.map((d) => (
        <ListRow
          key={d.id}
          href={`${base}/evidence/library/${d.id}`}
          title={d.title}
          subtitle={
            <>
              {EVIDENCE_TYPES[d.type]} · {d.fileName} · {formatBytes(d.fileSize)}
              {role === "TEAM" ? ` · ${d.isClyntique ? "Clyntique library" : `${d.ownerName ?? "Client"} (shared)`}` : ""}
            </>
          }
          detail={
            <p className="text-meta mt-1 flex flex-wrap gap-x-2">
              {d.status === "READY" && (
                <span>
                  {d.chunkCount} {d.chunkCount === 1 ? "passage" : "passages"}
                  {d.pageCount ? ` · ${d.pageCount} pages` : ""}
                </span>
              )}
              {d.status === "FAILED" && d.error && <span className="text-attention-ink">{d.error}</span>}
              <span>Uploaded {formatDay(d.createdAt)}</span>
            </p>
          }
          aside={
            <>
              {role === "CLIENT" && d.visibility === "TEAM" && <Badge tone="brand">Shared with Clyntique</Badge>}
              <LibraryStatusPill status={d.status} />
            </>
          }
        />
      ))}
    </ListGroup>
  );
}
