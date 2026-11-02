import type { LibraryDocumentStatus, LibraryVisibility } from "@/generated/prisma/enums";
import { TonePill, type Tone } from "@/components/ui/status-badge";

/*
 * The one way a Content Library document's processing status is shown. The
 * label is always printed, so status never depends on colour alone.
 */

export const LIBRARY_STATUS_LABEL: Record<LibraryDocumentStatus, string> = {
  PENDING: "Waiting to be indexed",
  PROCESSING: "Indexing",
  READY: "Searchable",
  FAILED: "Could not be indexed",
  DELETED: "Deleted",
};

const TONE: Record<LibraryDocumentStatus, Tone> = {
  PENDING: "neutral",
  PROCESSING: "neutral",
  READY: "positive",
  FAILED: "attention",
  DELETED: "neutral",
};

export const LIBRARY_VISIBILITY_LABEL: Record<LibraryVisibility, string> = {
  PRIVATE: "Private to your workspace",
  TEAM: "Shared with Clyntique reviewers",
};

export function LibraryStatusPill({ status, className }: { status: LibraryDocumentStatus; className?: string }) {
  return (
    <TonePill tone={TONE[status]} className={className}>
      {LIBRARY_STATUS_LABEL[status]}
    </TonePill>
  );
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
