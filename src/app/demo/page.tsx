import type { Metadata } from "next";
import { Suspense } from "react";
import { InteractiveYcDemo } from "@/components/demo/interactive-yc-demo";

export const metadata: Metadata = {
  title: "Explore the Demo · Clyntique",
  description:
    "Explore Clyntique as a client or as the review team: submissions, versions, evidence, simulated AI findings and the review workflow, with fictional data and no sign-in.",
};

export default function DemoPage() {
  // The sandbox reads its role and screen from the query string.
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <InteractiveYcDemo />
    </Suspense>
  );
}
