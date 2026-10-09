import type { Metadata } from "next";
import { Suspense } from "react";
import { CreativeReviewView } from "@/components/review/creative-review-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Creative review · Clyntique" };

export default function ClientCreativePage({ params, searchParams }: PageProps<"/dashboard/creatives/[creativeId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CreativeReviewView role="CLIENT" params={params} searchParams={searchParams} />
    </Suspense>
  );
}
