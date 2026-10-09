"use client";

import { useActionState } from "react";
import { submitSubmission, type SubmissionFormState } from "@/app/dashboard/submissions/actions";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import { FormError } from "@/components/forms/form-error";

// Readiness checklist and the Submit button. The checklist only guides the
// client; submitForReview re-checks every requirement on the server.

export type Readiness = { file: boolean; market: boolean; platform: boolean };

const ITEMS: { key: keyof Readiness; label: string }[] = [
  { key: "file", label: "Creative file uploaded" },
  { key: "market", label: "At least one target market" },
  { key: "platform", label: "At least one advertising platform" },
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
            <li key={key} className="flex items-center gap-2.5 text-[13px]">
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full ring-1 ring-inset [&_svg]:size-3",
                  done ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-surface text-transparent ring-line-strong",
                )}
              >
                <CheckIcon />
              </span>
              <span className={done ? "text-ink" : "text-muted"}>{label}</span>
              <span className="sr-only">{done ? "(done)" : "(missing)"}</span>
            </li>
          );
        })}
      </ul>
      <FormError message={state?.error} />
      {state?.ok && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
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
