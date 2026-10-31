"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AI_ONLY_PLAN,
  AI_HUMAN_PLAN,
  HUMAN_REVIEW_ADDON,
} from "@/lib/plans/data";
import {
  ShieldIcon,
  CheckIcon,
  ClockIcon,
  LayersIcon,
  PlusIcon,
  InfoIcon,
  CloseIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export function ClientPlansView() {
  const [activeTab, setActiveTab] = useState<"current" | "switch" | "addons">("current");
  const [modalText, setModalText] = useState<string | null>(null);
  const [addonQuantity, setAddonQuantity] = useState(2);

  return (
    <div className="space-y-8 pb-16">
      {/* Illustrative Disclaimer */}
      <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-4 text-small text-brand-900 shadow-2xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white font-bold text-micro">
              i
            </span>
            <span>
              <strong>Sample Illustrative Plans Prototype:</strong> Demonstrates in-app plan switching,
              usage quota tracking, and on-demand human review add-on management. No live billing is connected.
            </span>
          </div>
          <Link
            href="/policy-dashboard"
            className="text-caption font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2 shrink-0"
          >
            Inspect Global Policy Dashboard &rarr;
          </Link>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-display font-bold text-ink sm:text-3xl">
            Plans & Review Add-ons
          </h1>
          <p className="mt-1 text-small text-ink-soft">
            Manage your Clyntique compliance review tier, track monthly quota usage, and configure on-demand human escalations.
          </p>
        </div>

        <Link
          href="/dashboard/submissions/new"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-small font-semibold text-white shadow-xs hover:bg-brand-700 transition-colors shrink-0"
        >
          <PlusIcon className="size-4" />
          <span>New Submission</span>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-line gap-4 text-small font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("current")}
          className={cn(
            "pb-3 border-b-2 transition-colors cursor-pointer",
            activeTab === "current"
              ? "border-brand-600 text-brand-600 font-bold"
              : "border-transparent text-ink-soft hover:text-ink"
          )}
        >
          Active Plan & Quotas
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("switch")}
          className={cn(
            "pb-3 border-b-2 transition-colors cursor-pointer",
            activeTab === "switch"
              ? "border-brand-600 text-brand-600 font-bold"
              : "border-transparent text-ink-soft hover:text-ink"
          )}
        >
          Compare & Switch Plans
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("addons")}
          className={cn(
            "pb-3 border-b-2 transition-colors cursor-pointer",
            activeTab === "addons"
              ? "border-brand-600 text-brand-600 font-bold"
              : "border-transparent text-ink-soft hover:text-ink"
          )}
        >
          On-Demand Human Add-ons
        </button>
      </div>

      {/* Tab 1: Current Plan & Quotas */}
      {activeTab === "current" && (
        <div className="space-y-6">
          {/* Active Plan Card */}
          <div className="rounded-2xl border border-brand-300 bg-surface p-6 sm:p-8 shadow-xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-line">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-micro font-bold text-brand-700 mb-2">
                  <ShieldIcon className="size-3.5" />
                  <span>Enterprise Pilot Active</span>
                </div>
                <h2 className="text-title font-bold text-ink sm:text-2xl">
                  {AI_HUMAN_PLAN.name}
                </h2>
                <p className="mt-1 text-small text-ink-soft max-w-xl">
                  {AI_HUMAN_PLAN.tagline}. Dual-layer compliance: automated policy checks paired with Senior Regulatory Specialist sign-off.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 shrink-0">
                <div className="text-left sm:text-right">
                  <div className="text-caption text-muted">Plan rate</div>
                  <div className="text-2xl font-extrabold text-ink">${AI_HUMAN_PLAN.monthlyPrice} <span className="text-micro font-normal text-muted">/ month</span></div>
                  <div className="text-micro text-positive-ink font-semibold">Pilot account (no charges)</div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalText("Plan Management: Contact your account lead to update subscription seats.")}
                  className="rounded-xl border border-line bg-surface px-4 py-2.5 text-caption font-semibold text-ink hover:bg-subtle transition-colors cursor-pointer"
                >
                  Manage Subscription
                </button>
              </div>
            </div>

            {/* Quota Progress Meters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
              {/* Meter 1: Human Reviews */}
              <div className="rounded-xl border border-line bg-subtle/50 p-4">
                <div className="flex items-center justify-between text-caption font-medium text-ink-soft">
                  <span>Human Regulatory Reviews</span>
                  <span className="font-mono font-bold text-ink">14 / 30 used</span>
                </div>
                <div className="mt-3 h-2 w-full rounded-full bg-line overflow-hidden">
                  <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: "46%" }} />
                </div>
                <p className="mt-2 text-micro text-muted">
                  16 reviews remaining in current billing cycle (resets in 12 days).
                </p>
              </div>

              {/* Meter 2: Automated Scans */}
              <div className="rounded-xl border border-line bg-subtle/50 p-4">
                <div className="flex items-center justify-between text-caption font-medium text-ink-soft">
                  <span>AI Policy Engine Scans</span>
                  <span className="font-mono font-bold text-positive-ink">Unlimited</span>
                </div>
                <div className="mt-3 h-2 w-full rounded-full bg-line overflow-hidden">
                  <div className="h-full rounded-full bg-positive-solid transition-all" style={{ width: "100%" }} />
                </div>
                <p className="mt-2 text-micro text-muted">
                  184 scans executed this month across Meta, Google Ads, and TikTok.
                </p>
              </div>

              {/* Meter 3: Add-on credits */}
              <div className="rounded-xl border border-line bg-subtle/50 p-4">
                <div className="flex items-center justify-between text-caption font-medium text-ink-soft">
                  <span>On-Demand Add-on Credits</span>
                  <span className="font-mono font-bold text-ink">2 available</span>
                </div>
                <div className="mt-3 h-2 w-full rounded-full bg-line overflow-hidden">
                  <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: "66%" }} />
                </div>
                <p className="mt-2 text-micro text-muted">
                  Optional single-review dual-check credits (illustrative pilot quota; non-binding queue targets).
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="rounded-xl border border-line bg-surface p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <LayersIcon className="size-5" />
              </span>
              <div>
                <h3 className="text-small font-bold text-ink">Need an urgent single creative escalation?</h3>
                <p className="text-caption text-ink-soft">
                  Request human review for high-stakes campaigns via pilot quota or optional add-on without changing your baseline plan.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("addons")}
              className="rounded-lg bg-ink px-4 py-2 text-caption font-semibold text-white hover:bg-ink-soft transition-colors cursor-pointer shrink-0"
            >
              Get Add-on Reviews
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Compare & Switch Plans */}
      {activeTab === "switch" && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* AI-Only Plan Option */}
            <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8 flex flex-col justify-between shadow-xs">
              <div>
                <span className="rounded-full bg-subtle px-2.5 py-0.5 text-micro font-semibold text-ink-soft">
                  Self-Service
                </span>
                <h2 className="mt-3 text-card-title font-bold text-ink">{AI_ONLY_PLAN.name}</h2>
                <p className="mt-1 text-small text-ink-soft">{AI_ONLY_PLAN.tagline}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-ink">${AI_ONLY_PLAN.monthlyPrice}</span>
                  <span className="text-small text-muted">/ month</span>
                </div>
                <div className="mt-4 pt-4 border-t border-line space-y-2.5 text-small">
                  {AI_ONLY_PLAN.features.slice(0, 5).map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <CheckIcon className="size-4 text-positive-ink shrink-0" />
                      <span>{f.text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalText("Downgrade request submitted (Illustrative Prototype).")}
                className="mt-6 w-full rounded-xl border border-line px-4 py-2.5 text-small font-semibold text-ink hover:bg-subtle transition-colors cursor-pointer"
              >
                Switch to AI-Only Plan
              </button>
            </div>

            {/* AI + Human Plan Option (Current) */}
            <div className="rounded-2xl border-2 border-brand-500 bg-surface p-6 sm:p-8 flex flex-col justify-between shadow-md">
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-brand-600 px-3 py-0.5 text-micro font-semibold text-white">
                    Current Active Plan
                  </span>
                  <span className="text-caption font-semibold text-brand-700">Recommended</span>
                </div>
                <h2 className="mt-3 text-card-title font-bold text-ink">{AI_HUMAN_PLAN.name}</h2>
                <p className="mt-1 text-small text-ink-soft">{AI_HUMAN_PLAN.tagline}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-ink">${AI_HUMAN_PLAN.monthlyPrice}</span>
                  <span className="text-small text-muted">/ month</span>
                </div>
                <div className="mt-4 pt-4 border-t border-line space-y-2.5 text-small">
                  {AI_HUMAN_PLAN.features.slice(0, 5).map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <CheckIcon className="size-4 text-positive-ink shrink-0" />
                      <span className="font-medium text-ink">{f.text}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-6 rounded-xl bg-brand-50 py-2.5 text-center text-small font-semibold text-brand-800">
                Currently Active
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: On-Demand Human Add-ons */}
      {activeTab === "addons" && (
        <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8 max-w-3xl shadow-xs">
          <div className="flex items-center gap-2 text-brand-600 font-semibold text-small mb-1">
            <ClockIcon className="size-4" />
            <span>On-Demand Escalations</span>
          </div>
          <h2 className="text-title font-bold text-ink sm:text-2xl">
            {HUMAN_REVIEW_ADDON.name}
          </h2>
          <p className="mt-1 text-small text-ink-soft">
            {HUMAN_REVIEW_ADDON.description}
          </p>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-line bg-subtle/50 p-4">
              <span className="text-caption text-muted">Price per escalation</span>
              <div className="text-2xl font-bold text-ink mt-0.5">${HUMAN_REVIEW_ADDON.price}</div>
              <span className="text-micro text-muted">Turnaround: {HUMAN_REVIEW_ADDON.turnaround}</span>
            </div>
            <div className="rounded-xl border border-line bg-subtle/50 p-4">
              <span className="text-caption text-muted">Deliverable</span>
              <div className="text-small font-bold text-ink mt-0.5">Formal Review Record (PDF)</div>
              <span className="text-micro text-muted">Signed by Regulatory Specialist</span>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-line">
            <label htmlFor="addon-qty-slider" className="block text-small font-semibold text-ink mb-2">
              Select number of review credits to add:
            </label>
            <div className="flex items-center gap-4">
              <input
                id="addon-qty-slider"
                type="range"
                min="1"
                max="10"
                value={addonQuantity}
                onChange={(e) => setAddonQuantity(Number(e.target.value))}
                className="w-full accent-brand-600 cursor-pointer"
                aria-label="Number of review credits to add"
              />
              <span className="font-mono text-title font-bold text-ink w-16 text-right">
                {addonQuantity} credits
              </span>
            </div>

            <div className="mt-6 flex items-center justify-between rounded-xl bg-brand-50 p-4 border border-brand-200">
              <div>
                <div className="text-caption font-semibold text-brand-900">Total Add-on Cost (Illustrative):</div>
                <div className="text-2xl font-extrabold text-brand-700">
                  ${addonQuantity * HUMAN_REVIEW_ADDON.price}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalText(`Added ${addonQuantity} Human Review credits for $${addonQuantity * HUMAN_REVIEW_ADDON.price} (Illustrative Prototype).`)}
                className="rounded-xl bg-brand-600 px-5 py-2.5 text-small font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer shadow-xs"
              >
                Confirm Add-on Credits
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Illustrative Modal */}
      {modalText && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-pop">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2 text-brand-600 font-semibold text-small">
                <InfoIcon className="size-4" />
                <span>Prototype Action Recorded</span>
              </div>
              <button
                type="button"
                onClick={() => setModalText(null)}
                className="text-muted hover:text-ink cursor-pointer p-1"
                aria-label="Close dialog"
              >
                <CloseIcon className="size-4" />
              </button>
            </div>

            <div className="py-4 text-small text-ink-soft">
              <p>{modalText}</p>
              <p className="mt-2 text-caption text-muted">
                No payment processor or database subscription rows are modified.
              </p>
            </div>

            <div className="flex justify-end pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setModalText(null)}
                className="rounded-lg bg-ink px-4 py-2 text-caption font-semibold text-white hover:bg-ink-soft transition-colors cursor-pointer"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
