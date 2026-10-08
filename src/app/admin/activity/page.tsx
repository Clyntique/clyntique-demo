import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivityView } from "@/components/views/activity-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Activity · Clyntique" };

export default function TeamActivityPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ActivityView role="TEAM" />
    </Suspense>
  );
}
