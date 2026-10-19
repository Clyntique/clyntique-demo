import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { LifecycleUnavailableError } from "@/lib/data/lifecycle";
import { getPolicyImpact } from "@/lib/data/policy-impact";
import { PolicyImpactView } from "@/components/policy/impact-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = { title: "Rule changes & impact · Clyntique" };

export default function PolicyImpactPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PolicyImpactData />
    </Suspense>
  );
}

async function PolicyImpactData() {
  const user = await requireRole("TEAM");
  let impact;
  try {
    impact = await getPolicyImpact(user);
  } catch (error) {
    if (!(error instanceof LifecycleUnavailableError)) throw error;
    return (
      <p className="text-small rounded-md border border-line bg-subtle px-4 py-3 text-ink-soft">
        Rule changes and impact aren&apos;t available on this environment yet: its database hasn&apos;t received the lifecycle records update.
      </p>
    );
  }
  if (!impact) notFound();
  return <PolicyImpactView impact={impact} />;
}
