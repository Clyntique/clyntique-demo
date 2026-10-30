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
