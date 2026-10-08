import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardView } from "@/components/views/dashboard-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Dashboard · Clyntique" };

export default function ClientDashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardView role="CLIENT" />
    </Suspense>
  );
}
