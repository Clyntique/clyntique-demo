import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/views/page-skeleton";
import { ProjectDetailView } from "@/components/views/project-detail-view";

export const metadata: Metadata = { title: "Project · Clyntique" };

export default function ClientProjectPage({ params, searchParams }: PageProps<"/dashboard/projects/[projectId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProjectDetailView role="CLIENT" params={params} searchParams={searchParams} />
    </Suspense>
  );
}
