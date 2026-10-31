import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { PricingView } from "@/components/plans/pricing-view";

export const metadata: Metadata = {
  title: "Review Plans & Pricing · Clyntique",
  description:
    "Explore Clyntique AI-only review vs AI + Human Review plans, on-demand human review add-on, and defensible compliance documentation.",
};

export default function PricingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-ink antialiased">
      <MarketingNavbar />
      <main className="flex-1">
        <PricingView />
      </main>
      <MarketingFooter />
    </div>
  );
}
