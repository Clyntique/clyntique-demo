import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/lib/auth/dal";
import { isMissingTable } from "@/lib/data/lifecycle";
import { getDbMonitoringOverview } from "@/lib/policy/monitoring/service";
import { PolicyMonitoringView } from "@/components/policy/monitoring-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Policy source monitoring · Clyntique" };

export default function PolicyMonitoringPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PolicyMonitoringData />
    </Suspense>
  );
}

async function PolicyMonitoringData() {
  const user = await requireRole("TEAM");
  let overview;
  try {
    overview = await getDbMonitoringOverview(user);
  } catch (error) {
    if (!isMissingTable(error)) throw error;
    return (
      <p className="text-small rounded-md border border-line bg-subtle px-4 py-3 text-ink-soft">
        Source monitoring isn&apos;t available on this environment yet: its database hasn&apos;t received the policy source monitoring migration.
      </p>
    );
  }
  return <PolicyMonitoringView overview={overview} />;
}
