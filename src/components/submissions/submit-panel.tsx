"use client";

import { useActionState } from "react";
import { submitSubmission, type SubmissionFormState } from "@/app/dashboard/submissions/actions";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import { FormError } from "@/components/forms/form-error";

// Readiness checklist and the Submit button. The checklist only guides the
// client; submitForReview re-checks every requirement on the server.

export type Readiness = { file: boolean; market: boolean; platform: boolean; industry: boolean };

const ITEMS: { key: keyof Readiness; label: string }[] = [
  { key: "file", label: "Creative file uploaded" },
  { key: "market", label: "At least one target market" },
  { key: "platform", label: "At least one advertising platform" },
  { key: "industry", label: "Industry chosen" },
];

export function SubmitPanel({ creativeId, readiness }: { creativeId: string; readiness: Readiness }) {
  const [state, action, pending] = useActionState<SubmissionFormState, FormData>(submitSubmission, undefined);
  const ready = ITEMS.every((i) => readiness[i.key]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="creativeId" value={creativeId} />
      <ul className="flex flex-col gap-2">
        {ITEMS.map(({ key, label }) => {
          const done = readiness[key];
          return (
            <li key={key} className="flex items-center justify-between gap-2.5 text-small">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full ring-1 ring-inset [&_svg]:size-3",
                    done ? "bg-positive-soft text-positive-ink ring-positive-line" : "bg-surface text-transparent ring-line-strong",
                  )}
                >
                  <CheckIcon />
                </span>
                <span className={done ? "text-ink" : "text-muted"}>{label}</span>
                <span className="sr-only">{done ? "(done)" : "(missing)"}</span>
              </div>
              {!done && (
                key === "file" ? (
                  <a href="#upload" className="text-caption font-medium text-brand-700 hover:underline shrink-0">
                    Upload &rarr;
                  </a>
                ) : (
                  <a href="#details" className="text-caption font-medium text-brand-700 hover:underline shrink-0">
                    Edit &rarr;
                  </a>
                )
              )}
            </li>
          );
        })}
      </ul>
      <div className="rounded-lg border border-line bg-subtle/50 p-3">
        <span className="block text-caption font-semibold text-ink mb-1.5">
          Review Preference:
        </span>
        <div className="grid grid-cols-1 gap-2">
          <label className="flex items-start gap-2.5 rounded-md border border-line bg-surface p-2.5 text-left cursor-pointer hover:border-brand-500 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50/50">
            <input
              type="radio"
              name="reviewTier"
              value="HUMAN_REVIEW"
              defaultChecked
              className="mt-0.5 size-4 accent-brand-600"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-small font-bold text-ink">Human Review (Add-on)</span>
                <span className="rounded bg-brand-100 text-brand-800 px-1.5 py-0.2 text-[10px] font-semibold">Recommended</span>
              </div>
              <p className="text-micro text-ink-soft mt-0.5">
                Dual-check by Senior Regulatory Specialist (Pilot quota · Illustrative option).
              </p>
            </div>
          </label>

          <label className="flex items-start gap-2.5 rounded-md border border-line bg-surface p-2.5 text-left cursor-pointer hover:border-brand-500 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50/50">
            <input
              type="radio"
              name="reviewTier"
              value="AI_ONLY"
              className="mt-0.5 size-4 accent-brand-600"
            />
            <div>
              <span className="text-small font-bold text-ink">AI-Only Review</span>
              <p className="text-micro text-ink-soft mt-0.5">
                Automated screening against verified platform policies. Standard plan quota.
              </p>
            </div>
          </label>
        </div>
        <p className="mt-2 text-micro text-muted">
          Human review is an optional add-on for high-stakes ads. Included in active pilot quota (no payments or purchases enabled).
        </p>
      </div>

      <FormError message={state?.error} />
      {state?.ok && (
        <p role="status" className="rounded-md bg-positive-soft px-3 py-2 text-small text-positive-ink">
          {state.ok}
        </p>
      )}
      <Button type="submit" disabled={!ready || pending} className="w-full">
        {pending ? "Submitting…" : "Submit for review"}
      </Button>
      <p className="text-meta">
        Once submitted, the file and targeting are locked while the Clyntique team reviews it.
      </p>
    </form>
  );
}
