import type { Metadata } from "next";
import { Suspense } from "react";
import { ReviewQueueView } from "@/components/views/review-queue-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Review queue · Clyntique" };

export default function ReviewQueuePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReviewQueueView />
    </Suspense>
  );
}
