import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
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
  const impact = await getPolicyImpact(user);
  if (!impact) notFound();
  return <PolicyImpactView impact={impact} />;
}
