"use client";

import { useActionState, useState } from "react";
import { assessEvidenceAction, type ReviewActionState } from "@/app/admin/review/actions";
import { EVIDENCE_ASSESSMENT_LABEL, type EvidenceAssessmentResultKey } from "@/lib/workflow/labels";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/input";
import { FormError } from "@/components/forms/form-error";

// TEAM records how a piece of submitted client evidence was assessed in this
// review cycle. The server re-checks everything (assessEvidence); the client
// sees the assessment only with the next published decision.

const RESULTS = Object.keys(EVIDENCE_ASSESSMENT_LABEL) as EvidenceAssessmentResultKey[];

export function AssessEvidenceForm({ evidenceId }: { evidenceId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(assessEvidenceAction, undefined);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Assess evidence
        </Button>
        {state?.ok && (
          <p role="status" className="text-meta text-positive-ink">
            {state.ok}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-lg border border-line bg-subtle/40 p-3"
      noValidate
    >
      <input type="hidden" name="evidenceId" value={evidenceId} />
      <FormError message={state?.error} />
      {state?.ok && (
        <p role="status" className="rounded-md bg-positive-soft px-3 py-2 text-small text-positive-ink">
          {state.ok}
        </p>
      )}
      <Field label="Assessment">
        <Select name="result" required defaultValue={(state?.values?.result as string) ?? ""}>
          <option value="" disabled>
            Choose…
          </option>
          {RESULTS.map((r) => (
            <option key={r} value={r}>
              {EVIDENCE_ASSESSMENT_LABEL[r]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note to the client" hint="Required unless accepted: say what is missing or unclear. Shown as “Clyntique reviewer”.">
        <Textarea name="note" maxLength={2000} defaultValue={(state?.values?.note as string) ?? ""} className="min-h-16" />
      </Field>
      <p className="text-caption text-muted">An internal review assessment only, never a scientific, legal or platform validation.</p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button size="sm" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Record assessment"}
        </Button>
      </div>
    </form>
  );
}
