import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/lib/auth/dal";
import { GlobalPolicyDashboardView } from "@/components/policy/global-policy-dashboard-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = {
  title: "Global Policy Dashboard · Clyntique",
};

export default function AdminPolicyDashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminPolicyDashboardData />
    </Suspense>
  );
}

async function AdminPolicyDashboardData() {
  await requireRole("TEAM");
  return <GlobalPolicyDashboardView />;
}
