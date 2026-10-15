import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/views/page-skeleton";
import { fetchPolicyLibraryData } from "@/lib/policy/actions";
import { PolicyLibraryView } from "@/components/policy/policy-library-view";

export const metadata: Metadata = {
  title: "Compliance Policy Library · Clyntique",
};

export default function PolicyLibraryPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PolicyLibraryDataView />
    </Suspense>
  );
}

async function PolicyLibraryDataView() {
  const data = await fetchPolicyLibraryData();

  return (
    <PolicyLibraryView
      initialRules={data.rules}
      sources={data.sources}
      isPolicyAdmin={data.isPolicyAdmin}
      currentUser={data.currentUser}
      metrics={data.metrics}
    />
  );
}
