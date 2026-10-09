import type { Metadata } from "next";
import { Suspense } from "react";
import { NewCreativeView } from "@/components/views/form-views";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Add creative · Clyntique" };

export default function NewCreativePage({ params }: PageProps<"/admin/projects/[projectId]/creatives/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewCreativeView params={params} />
    </Suspense>
  );
}
