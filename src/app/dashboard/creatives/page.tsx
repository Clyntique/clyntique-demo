import type { Metadata } from "next";
import { Suspense } from "react";
import { CreativesView } from "@/components/views/creatives-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Submissions · Clyntique" };

export default function ClientCreativesPage({ searchParams }: PageProps<"/dashboard/creatives">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CreativesView role="CLIENT" searchParams={searchParams} />
    </Suspense>
  );
}
