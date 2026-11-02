import type { Metadata } from "next";
import { Suspense } from "react";
import { EvidenceDictionaryView } from "@/components/evidence/evidence-dictionary-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Evidence Dictionary · Clyntique" };
// Uploading a document extracts and indexes its text within the request.
export const maxDuration = 60;

export default function TeamEvidenceDictionaryPage({ searchParams }: PageProps<"/admin/evidence">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EvidenceDictionaryView role="TEAM" searchParams={searchParams} />
    </Suspense>
  );
}
