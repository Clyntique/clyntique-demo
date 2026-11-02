import type { Metadata } from "next";
import { Suspense } from "react";
import { EvidenceRecordView } from "@/components/evidence/evidence-record-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Evidence record · Clyntique" };

// `params` is awaited inside the Suspense boundary (cacheComponents), as on the creative page.
export default function TeamEvidenceRecordPage({ params }: PageProps<"/admin/evidence/[recordId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EvidenceRecordView role="TEAM" params={params} />
    </Suspense>
  );
}
