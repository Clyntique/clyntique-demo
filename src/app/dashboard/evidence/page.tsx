import type { Metadata } from "next";
import { Suspense } from "react";
import { EvidenceDictionaryView } from "@/components/evidence/evidence-dictionary-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Evidence Dictionary · Clyntique" };

export default function ClientEvidenceDictionaryPage({ searchParams }: PageProps<"/dashboard/evidence">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EvidenceDictionaryView role="CLIENT" searchParams={searchParams} />
    </Suspense>
  );
}
