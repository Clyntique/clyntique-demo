import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/lib/auth/dal";
import { GlobalPolicyDashboardView } from "@/components/policy/global-policy-dashboard-view";
import { PageSkeleton } from "@/components/views/page-skeleton";
import type { PolicyRule } from "@/lib/policy/types";

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
  let dbRules: PolicyRule[] = [];
  try {
    const { getDbPolicyRules } = await import("@/lib/policy/db");
    dbRules = await getDbPolicyRules();
  } catch {
    dbRules = [];
  }
  return <GlobalPolicyDashboardView isStandalone={false} initialDbRules={dbRules} />;
}
