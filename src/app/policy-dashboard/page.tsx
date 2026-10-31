import type { Metadata } from "next";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { MarketingFooter } from "@/components/marketing/footer";
import { GlobalPolicyDashboardView } from "@/components/policy/global-policy-dashboard-view";

export const metadata: Metadata = {
  title: "Global Policy Dashboard · Clyntique",
  description:
    "Live regulatory tracking across Meta, Google Ads, TikTok, US FTC, and UAE MOHAP. Dual-admin human verification pipeline and platform coverage index.",
};

export default function StandalonePolicyDashboardPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface text-ink antialiased">
      <MarketingNavbar />
      <main className="flex-1 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <GlobalPolicyDashboardView isStandalone={true} />
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
