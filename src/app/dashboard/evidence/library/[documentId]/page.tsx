import type { Metadata } from "next";
import { Suspense } from "react";
import { LibraryDocumentView } from "@/components/evidence/library-document-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Library document · Clyntique" };
// Re-indexing a document reads and extracts its file within the request.
export const maxDuration = 60;

// `params` is awaited inside the Suspense boundary (cacheComponents), as on the creative page.
export default function ClientLibraryDocumentPage({ params }: PageProps<"/dashboard/evidence/library/[documentId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LibraryDocumentView role="CLIENT" params={params} />
    </Suspense>
  );
}
