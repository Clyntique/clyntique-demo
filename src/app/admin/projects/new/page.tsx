import type { Metadata } from "next";
import { Suspense } from "react";
import { NewProjectView } from "@/components/views/form-views";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "New project · Clyntique" };

export default function NewProjectPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewProjectView />
    </Suspense>
  );
}
