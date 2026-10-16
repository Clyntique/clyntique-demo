import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { HeroSection } from "@/components/marketing/hero-section";
import { BeforeAfterSection } from "@/components/marketing/before-after-section";
import { WorkflowSection } from "@/components/marketing/workflow-section";
import { FeaturesSection } from "@/components/marketing/features-section";
import { PolicyLibrarySection } from "@/components/marketing/policy-library-section";
import { FinalCTASection } from "@/components/marketing/final-cta-section";
import { MarketingFooter } from "@/components/marketing/footer";

export const metadata: Metadata = {
  title: "Clyntique · Creative work, without the back-and-forth",
  description:
    "Bring creative submissions, feedback, evidence, revisions, and approvals into one shared workspace. Enterprise advertising review with policy-grounded intelligence.",
};

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-ink antialiased">
      <MarketingNavbar />
      <main className="flex-1">
        <HeroSection />
        <BeforeAfterSection />
        <WorkflowSection />
        <FeaturesSection />
        <PolicyLibrarySection />
        <FinalCTASection />
      </main>
      <MarketingFooter />
    </div>
  );
}
