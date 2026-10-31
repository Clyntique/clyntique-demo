"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AI_ONLY_PLAN,
  AI_HUMAN_PLAN,
  HUMAN_REVIEW_ADDON,
  COMPARISON_FEATURES,
  PRICING_FAQS,
  type ReviewPlan,
} from "@/lib/plans/data";
import {
  CheckIcon,
  CloseIcon,
  ShieldIcon,
  ArrowRightIcon,
  ClockIcon,
  LayersIcon,
  InfoIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export function PricingView() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [selectedPlanModal, setSelectedPlanModal] = useState<string | null>(null);
  const [addonVolume, setAddonVolume] = useState<number>(3);
  const [faqOpen, setFaqOpen] = useState<Record<number, boolean>>({ 0: true, 1: true });

  const toggleFaq = (idx: number) => {
    setFaqOpen((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="py-12 sm:py-16 lg:py-20">
      {/* Top Banner / Disclaimer */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mb-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-attention-line bg-attention-soft/50 p-4 text-small text-attention-ink">
          <div className="flex items-center gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-attention-solid text-white font-bold text-micro">
              i
            </span>
            <span>
              <strong>Sample Illustrative Pricing Prototype:</strong> All plans, add-ons and figures shown here are
              illustrative for YC demo and pilot client evaluation. No real payment processing or subscriptions are connected.
            </span>
          </div>
          <Link
            href="/demo"
            className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2"
          >
            <span>Explore Interactive Demo &rarr;</span>
          </Link>
        </div>
      </div>

      {/* Hero Header */}
      <div className="mx-auto max-w-4xl text-center px-4 sm:px-6 lg:px-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1 text-caption font-semibold text-brand-700 mb-4">
          <ShieldIcon className="size-4" />
          <span>AI-Only vs. Human Review Architecture</span>
        </div>
        <h1 className="text-display font-semibold tracking-tight text-ink sm:text-4xl lg:text-5xl">
          Compliant advertising review, configured for your speed and stakes.
        </h1>
        <p className="mt-4 text-lead text-ink-soft max-w-2xl mx-auto">
          Choose automated, instant screening for high-frequency iteration, or full dual-check regulatory review
          with senior human verification and defensible audit records.
        </p>

        {/* Billing Toggle */}
        <div className="mt-8 inline-flex items-center justify-center rounded-xl border border-line bg-surface p-1 shadow-xs">
          <button
            type="button"
            onClick={() => setBillingCycle("monthly")}
            className={cn(
              "rounded-lg px-4 py-2 text-small font-medium transition-all cursor-pointer",
              billingCycle === "monthly"
                ? "bg-brand-600 text-white shadow-2xs"
                : "text-ink-soft hover:text-ink"
            )}
          >
            Monthly billing
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle("annual")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-small font-medium transition-all cursor-pointer",
              billingCycle === "annual"
                ? "bg-brand-600 text-white shadow-2xs"
                : "text-ink-soft hover:text-ink"
            )}
          >
            <span>Annual billing</span>
            <span className={cn(
              "rounded-full px-2 py-0.5 text-micro font-semibold",
              billingCycle === "annual" ? "bg-brand-700 text-white" : "bg-positive-soft text-positive-ink"
            )}>
              Save 20%
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          {/* Card 1: AI-Only Plan */}
          <PlanCard
            plan={AI_ONLY_PLAN}
            billingCycle={billingCycle}
            onSelect={() => setSelectedPlanModal(AI_ONLY_PLAN.name)}
          />

          {/* Card 2: AI + Human Review Plan (Featured) */}
          <PlanCard
            plan={AI_HUMAN_PLAN}
            billingCycle={billingCycle}
            featured
            onSelect={() => setSelectedPlanModal(AI_HUMAN_PLAN.name)}
          />
        </div>

        {/* On-Demand Human Review Add-On Highlight Banner */}
        <div className="mt-12 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50/60 via-surface to-brand-50/30 p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-1.5 rounded-md bg-brand-100 px-2.5 py-0.5 text-caption font-semibold text-brand-800 mb-2">
                <ClockIcon className="size-3.5" />
                <span>{HUMAN_REVIEW_ADDON.badge}</span>
              </div>
              <h2 className="text-title font-semibold text-ink sm:text-2xl">
                {HUMAN_REVIEW_ADDON.name} — ${HUMAN_REVIEW_ADDON.price}{" "}
                <span className="text-small font-normal text-muted">{HUMAN_REVIEW_ADDON.unit}</span>
              </h2>
              <p className="mt-1.5 text-small text-ink-soft">
                {HUMAN_REVIEW_ADDON.description} Perfect for AI-Only plan subscribers who need an occasional
                expert regulatory escalation for a hero launch or complex medical claim.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {HUMAN_REVIEW_ADDON.benefits.slice(0, 3).map((b, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-md bg-surface border border-line px-2.5 py-1 text-micro text-ink font-medium">
                    <CheckIcon className="size-3 text-positive-ink" />
                    <span>{b}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Interactive Add-On Cost Calculator */}
            <div className="w-full lg:w-80 shrink-0 rounded-xl border border-line bg-surface p-5 shadow-xs">
              <div className="flex items-center justify-between text-caption font-medium text-ink-soft">
                <span>Add-on estimator</span>
                <span className="font-mono text-ink font-semibold">{addonVolume} reviews / mo</span>
              </div>
              <input
                type="range"
                min="1"
                max="20"
                value={addonVolume}
                onChange={(e) => setAddonVolume(Number(e.target.value))}
                className="w-full mt-2 accent-brand-600 cursor-pointer"
                aria-label="Addon reviews per month"
              />
              <div className="mt-4 pt-3 border-t border-line flex items-baseline justify-between">
                <span className="text-caption text-muted">Est. add-on cost:</span>
                <span className="text-title font-bold text-ink">
                  ${addonVolume * HUMAN_REVIEW_ADDON.price}
                  <span className="text-micro font-normal text-muted"> / mo</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlanModal(`Add-on: ${addonVolume} Human Reviews ($${addonVolume * HUMAN_REVIEW_ADDON.price})`)}
                className="mt-3 w-full rounded-lg bg-ink px-3 py-2 text-caption font-semibold text-white shadow-xs hover:bg-ink-soft transition-colors cursor-pointer"
              >
                Configure add-on
              </button>
            </div>
          </div>
        </div>

        {/* Global Policy Dashboard Teaser */}
        <div className="mt-12 rounded-2xl border border-line bg-surface p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-brand-600 font-semibold text-small mb-1">
              <LayersIcon className="size-5" />
              <span>Multi-Jurisdiction Policy Intelligence</span>
            </div>
            <h3 className="text-title font-semibold text-ink sm:text-2xl">
              Inspect our Global Policy Dashboard
            </h3>
            <p className="mt-1 text-small text-ink-soft">
              Track 48+ monitored rules across Meta, Google Ads, TikTok, US FTC, and UAE MOHAP.
              See verified rules, pending human verifications, and real-time coverage depth across healthcare & medical aesthetics.
            </p>
          </div>
          <Link
            href="/policy-dashboard"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-brand-300 bg-brand-50 px-5 py-2.5 text-small font-semibold text-brand-700 hover:bg-brand-100 transition-colors cursor-pointer"
          >
            <span>Open Global Policy Dashboard</span>
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>

        {/* Feature Comparison Table */}
        <div className="mt-16 sm:mt-24">
          <div className="text-center max-w-3xl mx-auto mb-10">
            <h2 className="text-title font-semibold text-ink sm:text-3xl">
              Compare plans feature-by-feature
            </h2>
            <p className="mt-2 text-small text-ink-soft">
              Detailed breakdown of compliance verification capabilities, evidence auditing, and regulatory defense.
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-line bg-subtle/50">
                  <th scope="col" className="p-4 sm:p-5 text-small font-semibold text-ink w-2/5">
                    Feature & Capability
                  </th>
                  <th scope="col" className="p-4 sm:p-5 text-small font-semibold text-ink text-center w-3/10">
                    <span className="block">{AI_ONLY_PLAN.name}</span>
                    <span className="block text-micro font-normal text-muted mt-0.5">
                      ${billingCycle === "monthly" ? AI_ONLY_PLAN.monthlyPrice : AI_ONLY_PLAN.annualPrice}/mo
                    </span>
                  </th>
                  <th scope="col" className="p-4 sm:p-5 text-small font-semibold text-brand-700 bg-brand-50/50 text-center w-3/10">
                    <span className="block flex items-center justify-center gap-1.5">
                      <span>{AI_HUMAN_PLAN.name}</span>
                      <span className="rounded bg-brand-600 px-1.5 py-0.2 text-[10px] text-white">Recommended</span>
                    </span>
                    <span className="block text-micro font-normal text-brand-800 mt-0.5">
                      ${billingCycle === "monthly" ? AI_HUMAN_PLAN.monthlyPrice : AI_HUMAN_PLAN.annualPrice}/mo
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {COMPARISON_FEATURES.map((feature, i) => (
                  <tr key={i} className="hover:bg-subtle/30 transition-colors">
                    <td className="p-4 sm:p-5">
                      <div className="text-small font-medium text-ink">{feature.name}</div>
                      <div className="text-caption text-muted mt-0.5">{feature.description}</div>
                      {feature.addonAvailable && (
                        <span className="inline-block mt-1 text-micro text-brand-600 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                          Available as on-demand add-on ($49)
                        </span>
                      )}
                    </td>
                    <td className="p-4 sm:p-5 text-center">
                      <ValueCell value={feature.aiOnly} />
                    </td>
                    <td className="p-4 sm:p-5 text-center bg-brand-50/20">
                      <ValueCell value={feature.aiHuman} isFeatured />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQs */}
        <div className="mt-16 sm:mt-24 max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-title font-semibold text-ink sm:text-3xl">
              Frequently Asked Questions
            </h2>
            <p className="mt-2 text-small text-ink-soft">
              Understanding Clyntique review mechanics, SLAs, and defensible audit records.
            </p>
          </div>

          <div className="space-y-4">
            {PRICING_FAQS.map((faq, i) => (
              <div
                key={i}
                className="rounded-xl border border-line bg-surface p-5 shadow-2xs transition-all"
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(i)}
                  className="flex w-full items-center justify-between text-left text-small font-semibold text-ink cursor-pointer gap-4"
                  aria-expanded={faqOpen[i]}
                >
                  <span>{faq.question}</span>
                  <span className="text-muted text-base">
                    {faqOpen[i] ? "−" : "+"}
                  </span>
                </button>
                {faqOpen[i] && (
                  <p className="mt-3 text-small text-ink-soft leading-relaxed border-t border-line/60 pt-3">
                    {faq.answer}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Final CTA Strip */}
        <div className="mt-16 sm:mt-20 rounded-2xl bg-ink p-8 sm:p-12 text-center text-white shadow-md">
          <h2 className="text-title font-bold sm:text-3xl">
            Ready to streamline high-compliance creative approvals?
          </h2>
          <p className="mt-3 text-small sm:text-lead text-white/80 max-w-2xl mx-auto">
            Experience our interactive demo walkthrough or contact our team to join the upcoming enterprise pilot cohort.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-small font-semibold text-ink hover:bg-white/90 transition-all cursor-pointer shadow-xs"
            >
              <span>Try Interactive Demo</span>
              <ArrowRightIcon className="size-4" />
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-small font-semibold text-white hover:bg-white/20 transition-all cursor-pointer"
            >
              <span>Sign In to Workspace</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Illustrative Modal */}
      {selectedPlanModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-pop">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2 text-brand-600 font-semibold text-small">
                <InfoIcon className="size-4" />
                <span>Prototype Preview</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlanModal(null)}
                className="text-muted hover:text-ink cursor-pointer p-1"
                aria-label="Close dialog"
              >
                <CloseIcon className="size-4" />
              </button>
            </div>

            <div className="py-4">
              <h3 className="text-card-title text-ink font-semibold">
                You selected: {selectedPlanModal}
              </h3>
              <p className="mt-2 text-small text-ink-soft">
                This is a live frontend prototype designed for our YC demo and pilot client evaluation.
                Payment gateways, Stripe billing, and automatic account upgrading are deliberately omitted.
              </p>
              <div className="mt-4 rounded-lg bg-brand-50 p-3 text-caption text-brand-800">
                <strong>Next Step:</strong> You can explore the full submission and review lifecycle on our
                interactive demo page right now.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setSelectedPlanModal(null)}
                className="rounded-lg border border-line px-4 py-2 text-caption font-semibold text-ink hover:bg-subtle transition-colors cursor-pointer"
              >
                Dismiss
              </button>
              <Link
                href="/demo"
                onClick={() => setSelectedPlanModal(null)}
                className="rounded-lg bg-brand-600 px-4 py-2 text-caption font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer"
              >
                Go to Interactive Demo
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  billingCycle,
  featured = false,
  onSelect,
}: {
  plan: ReviewPlan;
  billingCycle: "monthly" | "annual";
  featured?: boolean;
  onSelect: () => void;
}) {
  const price = billingCycle === "monthly" ? plan.monthlyPrice : plan.annualPrice;

  return (
    <div
      className={cn(
        "relative flex flex-col justify-between rounded-2xl border p-6 sm:p-8 transition-all shadow-xs",
        featured
          ? "border-brand-500 bg-surface ring-2 ring-brand-500/20 shadow-md"
          : "border-line bg-surface hover:border-line-strong"
      )}
    >
      {featured && (
        <span className="absolute -top-3.5 right-6 rounded-full bg-brand-600 px-3 py-1 text-micro font-semibold uppercase tracking-wide text-white shadow-xs">
          {plan.badge}
        </span>
      )}

      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-card-title font-bold text-ink sm:text-2xl">{plan.name}</h2>
          {!featured && plan.badge && (
            <span className="rounded-full bg-subtle px-2.5 py-0.5 text-micro font-medium text-ink-soft">
              {plan.badge}
            </span>
          )}
        </div>

        <p className="mt-2 text-small text-ink-soft leading-relaxed min-h-[44px]">
          {plan.tagline}
        </p>

        {/* Price display */}
        <div className="mt-6 flex items-baseline gap-1.5">
          <span className="text-4xl font-extrabold tracking-tight text-ink">${price}</span>
          <span className="text-small text-muted font-normal">/ month</span>
          {billingCycle === "annual" && (
            <span className="text-micro text-positive-ink font-semibold ml-2">billed annually</span>
          )}
        </div>

        <div className="mt-2 flex items-center gap-1.5 text-caption font-medium text-brand-700">
          <ClockIcon className="size-4 shrink-0" />
          <span>Turnaround SLA: {plan.turnaround}</span>
        </div>

        <div className="mt-6 pt-6 border-t border-line">
          <div className="text-caption font-semibold uppercase tracking-wider text-muted mb-4">
            Included Capabilities
          </div>
          <ul className="space-y-3">
            {plan.features.map((feat, i) => (
              <li key={i} className="flex items-start gap-3 text-small">
                {feat.included ? (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-positive-soft text-positive-ink mt-0.5">
                    <CheckIcon className="size-3.5" />
                  </span>
                ) : (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-subtle text-muted mt-0.5">
                    <CloseIcon className="size-3" />
                  </span>
                )}
                <div className="flex-1">
                  <span className={cn(
                    feat.included ? "text-ink" : "text-muted",
                    feat.highlight && "font-semibold text-ink"
                  )}>
                    {feat.text}
                  </span>
                  {feat.detail && (
                    <span className="block text-micro text-brand-600 mt-0.5 font-medium">
                      {feat.detail}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-line">
        <button
          type="button"
          onClick={onSelect}
          className={cn(
            "w-full rounded-xl py-3 px-4 text-small font-semibold shadow-xs transition-all cursor-pointer text-center",
            featured
              ? "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 shadow-brand-600/10"
              : "border border-line-strong bg-surface text-ink hover:bg-subtle active:bg-line"
          )}
        >
          {plan.ctaText}
        </button>
        <p className="mt-2.5 text-center text-micro text-muted">
          {plan.disclaimer}
        </p>
      </div>
    </div>
  );
}

function ValueCell({ value, isFeatured = false }: { value: string | boolean; isFeatured?: boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-positive-soft text-positive-ink mx-auto">
        <CheckIcon className="size-3.5" />
      </span>
    ) : (
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-subtle text-muted mx-auto">
        <CloseIcon className="size-3" />
      </span>
    );
  }

  return (
    <span className={cn("text-small font-medium", isFeatured ? "text-brand-700" : "text-ink")}>
      {value}
    </span>
  );
}
