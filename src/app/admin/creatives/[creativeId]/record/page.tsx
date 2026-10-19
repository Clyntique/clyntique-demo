import type { Metadata } from "next";
import { Suspense } from "react";
import { ReviewRecord } from "@/components/record/review-record";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Review record · Clyntique" };

// `params` is awaited inside the Suspense boundary (cacheComponents), as on the creative page.
export default function TeamReviewRecordPage({ params }: PageProps<"/admin/creatives/[creativeId]/record">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReviewRecord role="TEAM" params={params} />
    </Suspense>
  );
}
