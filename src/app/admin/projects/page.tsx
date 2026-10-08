import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectsView } from "@/components/views/projects-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Projects · Clyntique" };

export default function TeamProjectsPage({ searchParams }: PageProps<"/admin/projects">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProjectsView role="TEAM" searchParams={searchParams} />
    </Suspense>
  );
}
