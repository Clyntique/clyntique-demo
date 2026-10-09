import type { Metadata } from "next";
import { Suspense } from "react";
import { NewSubmissionView } from "@/components/views/new-submission-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "New submission · Clyntique" };

export default function NewSubmissionPage({ searchParams }: PageProps<"/dashboard/submissions/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewSubmissionView searchParams={searchParams} />
    </Suspense>
  );
}
