"use client";

import { useState } from "react";
import { parseReviewTier, getReviewTierDetails, type ReviewTier } from "@/lib/plans/review-tier";
import { updateReviewTierAction } from "@/app/dashboard/submissions/review-tier-action";
import { ShieldIcon, ClockIcon, CheckIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

interface ReviewTierCardProps {
  creativeId: string;
  context?: string | null;
  status: string;
  isClient: boolean;
  canEdit: boolean;
}

export function ReviewTierCard({
  creativeId,
  context,
  status,
  isClient,
  canEdit,
}: ReviewTierCardProps) {
  const initialTier = parseReviewTier(context);
  const [tier, setTier] = useState<ReviewTier>(initialTier);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const details = getReviewTierDetails(tier, status);

  async function handleTierChange(newTier: ReviewTier) {
    if (newTier === tier || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await updateReviewTierAction(creativeId, newTier);
      if (res.ok && res.tier) {
        setTier(res.tier);
        setMessage(
          newTier === "HUMAN_REVIEW"
            ? "Human review requested. A Senior Regulatory Specialist will evaluate this creative once submitted."
            : "Switched to AI-Only Review. Fast automated screening will be run upon submission."
        );
      } else {
        setMessage(res.error ?? "Failed to update review tier.");
      }
    } catch {
      setMessage("An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-caption font-semibold uppercase tracking-wider text-muted">
              Review Type & Request Status
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-micro font-bold",
                details.tier === "HUMAN_REVIEW"
                  ? "bg-brand-50 text-brand-700 border border-brand-200"
                  : "bg-blue-50 text-blue-700 border border-blue-200"
              )}
            >
              {details.label}
            </span>
          </div>

          <h3 className="text-small font-bold text-ink mt-1">
            {details.statusLabel}
          </h3>
          <p className="text-caption text-ink-soft mt-0.5">
            {details.statusDescription}
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-micro text-muted shrink-0 font-medium bg-subtle px-2.5 py-1 rounded-md">
          <ClockIcon className="size-3.5 text-brand-600" />
          <span>{details.slaText}</span>
        </div>
      </div>

      {message && (
        <div className="mt-3 rounded-lg bg-brand-50 p-2.5 text-caption text-brand-800 border border-brand-200">
          {message}
        </div>
      )}

      {/* Action / Upgrade Buttons */}
      {isClient && (
        <div className="mt-3.5 pt-3 border-t border-line/70 flex flex-wrap items-center justify-between gap-2">
          {tier === "AI_ONLY" ? (
            <div className="flex items-center justify-between w-full">
              <span className="text-micro text-muted">
                Need a defensible sign-off? Human review is an optional add-on.
              </span>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleTierChange("HUMAN_REVIEW")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-caption font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer shadow-xs"
              >
                <ShieldIcon className="size-3.5" />
                <span>{saving ? "Updating…" : "Request Human Review (Add-on)"}</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <span className="text-micro text-positive-ink font-medium flex items-center gap-1">
                <CheckIcon className="size-3.5" />
                <span>Senior Regulatory Specialist review active (Included in pilot quota)</span>
              </span>
              {canEdit && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleTierChange("AI_ONLY")}
                  className="text-micro font-medium text-muted hover:text-ink transition-colors cursor-pointer underline"
                >
                  {saving ? "Updating…" : "Switch to AI-only review"}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
