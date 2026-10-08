import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectsView } from "@/components/views/projects-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Projects · Clyntique" };

export default function ClientProjectsPage({ searchParams }: PageProps<"/dashboard/projects">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProjectsView role="CLIENT" searchParams={searchParams} />
    </Suspense>
  );
}
