import type { Metadata } from "next";
import { Suspense } from "react";
import { requireRole } from "@/lib/auth/dal";
import { ClientPlansView } from "@/components/plans/client-plans-view";
import { PageSkeleton } from "@/components/views/page-skeleton";

export const metadata: Metadata = {
  title: "Review Plans & Add-ons · Clyntique",
};

export default function ClientPlansPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ClientPlansData />
    </Suspense>
  );
}

async function ClientPlansData() {
  await requireRole("CLIENT");
  return <ClientPlansView />;
}
