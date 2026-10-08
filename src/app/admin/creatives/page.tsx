import type { Metadata } from "next";
import { Suspense } from "react";
import { CreativesView } from "@/components/views/creatives-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Creatives · Clyntique" };

export default function TeamCreativesPage({ searchParams }: PageProps<"/admin/creatives">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CreativesView role="TEAM" searchParams={searchParams} />
    </Suspense>
  );
}
