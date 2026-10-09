"use client";

import { useActionState, useState } from "react";
import type { CreativeFormat, EvidenceType } from "@/generated/prisma/enums";
import {
  addComment,
  deleteEvidence,
  saveEvidence,
  shareForReview,
  submitDecision,
  updateCreativeDetails,
  type ReviewFormState,
} from "@/lib/review/actions";
import { cn } from "@/lib/cn";
import { FORMATS, FORMAT_ORDER } from "@/lib/creative-format";
import { Button } from "@/components/ui/button";
import { CheckIcon } from "@/components/ui/icons";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormError } from "@/components/forms/form-error";
import { EVIDENCE_TYPES } from "./evidence-types";

// Client forms for the review page. Each one posts to a server action that
// re-checks the user, role and creative; these only manage pending state and
// show the action's messages.

function Success({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
      {message}
    </p>
  );
}

function FieldErrorText({ message }: { message?: string }) {
  return message ? <span className="text-[12px] text-red-600">{message}</span> : null;
}

// ---------------------------------------------------------------------------

export function ShareForm({ creativeId, versionNumber }: { creativeId: string; versionNumber: number }) {
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(shareForReview, undefined);
  return (
    <form action={action} className="flex flex-col items-start gap-2 sm:items-end">
      <input type="hidden" name="creativeId" value={creativeId} />
      <Button type="submit" disabled={pending}>
        {pending ? "Sharing…" : `Share V${versionNumber} for review`}
      </Button>
      <FormError message={state?.error} />
    </form>
  );
}

// ---------------------------------------------------------------------------

export function DetailsForm({
  creative,
}: {
  creative: { id: string; name: string; format: CreativeFormat; description: string | null; context: string | null };
}) {
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(updateCreativeDetails, undefined);
  const v = state?.values;
  const e = state?.fieldErrors;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="creativeId" value={creative.id} />
      <FormError message={state?.error} />
      <Field label="Title" error={e?.name}>
        <Input name="name" defaultValue={v?.name ?? creative.name} maxLength={120} required aria-invalid={e?.name ? true : undefined} />
      </Field>
      <Field label="Format" error={e?.format}>
        <Select name="format" defaultValue={v?.format ?? creative.format}>
          {FORMAT_ORDER.map((f) => (
            <option key={f} value={f}>
              {FORMATS[f].label} ({FORMATS[f].ratio})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Description" hint="What this creative is." error={e?.description}>
        <Textarea name="description" defaultValue={v?.description ?? creative.description ?? ""} maxLength={1000} className="min-h-20" />
      </Field>
      <Field label="Campaign context" hint="Objective, audience and key message the client should keep in mind." error={e?.context}>
        <Textarea name="context" defaultValue={v?.context ?? creative.context ?? ""} maxLength={2000} />
      </Field>
      <Success message={state?.ok} />
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save details"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

type EvidenceValues = {
  id?: string;
  title?: string;
  type?: EvidenceType;
  description?: string | null;
  source?: string | null;
  url?: string | null;
  date?: string | null;
};

export function EvidenceForm({
  creativeId,
  evidence,
  onDone,
}: {
  creativeId: string;
  evidence?: EvidenceValues;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(async (prev, formData) => {
    const result = await saveEvidence(prev, formData);
    if (result?.ok) onDone?.();
    return result;
  }, undefined);
  const v = state?.values;
  const e = state?.fieldErrors;
  const editing = Boolean(evidence?.id);

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="creativeId" value={creativeId} />
      {evidence?.id && <input type="hidden" name="evidenceId" value={evidence.id} />}
      <FormError message={state?.error} />
      <Field label="Title" error={e?.title}>
        <Input name="title" defaultValue={v?.title ?? evidence?.title ?? ""} maxLength={160} required aria-invalid={e?.title ? true : undefined} />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Type" error={e?.type}>
          <Select name="type" defaultValue={v?.type ?? evidence?.type ?? "RESEARCH"}>
            {Object.entries(EVIDENCE_TYPES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date (optional)" error={e?.date}>
          <Input type="date" name="date" defaultValue={v?.date ?? evidence?.date ?? ""} />
        </Field>
      </div>
      <Field label="Why it matters" hint="The finding, and how it supports this creative." error={e?.description}>
        <Textarea name="description" defaultValue={v?.description ?? evidence?.description ?? ""} maxLength={2000} className="min-h-20" />
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Source (optional)" hint="For example: Nielsen, 2025" error={e?.source}>
          <Input name="source" defaultValue={v?.source ?? evidence?.source ?? ""} maxLength={200} />
        </Field>
        <Field label="Reference link (optional)" error={e?.url}>
          <Input
            type="url"
            name="url"
            inputMode="url"
            placeholder="https://"
            defaultValue={v?.url ?? evidence?.url ?? ""}
            maxLength={2000}
            aria-invalid={e?.url ? true : undefined}
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        {onDone && (
          <Button variant="ghost" size="sm" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save evidence" : "Add evidence"}
        </Button>
      </div>
    </form>
  );
}

export function AddEvidence({ creativeId, hasEvidence }: { creativeId: string; hasEvidence: boolean }) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);
  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        {added && <Success message="Evidence added." />}
        <Button variant="secondary" size="sm" className="self-start" onClick={() => { setOpen(true); setAdded(false); }}>
          {hasEvidence ? "Add more evidence" : "Add evidence"}
        </Button>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-line bg-canvas p-4">
      <EvidenceForm creativeId={creativeId} onDone={() => { setOpen(false); setAdded(true); }} />
    </div>
  );
}

export function EditEvidence({ creativeId, evidence }: { creativeId: string; evidence: EvidenceValues & { id: string } }) {
  const [open, setOpen] = useState(false);
  const [state, removeAction, removing] = useActionState<ReviewFormState, FormData>(deleteEvidence, undefined);

  if (open) {
    return (
      <div className="mt-3 rounded-md border border-line bg-canvas p-4">
        <EvidenceForm creativeId={creativeId} evidence={evidence} onDone={() => setOpen(false)} />
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <form
        action={removeAction}
        onSubmit={(event) => {
          if (!window.confirm(`Remove “${evidence.title}”? This can't be undone.`)) event.preventDefault();
        }}
      >
        <input type="hidden" name="creativeId" value={creativeId} />
        <input type="hidden" name="evidenceId" value={evidence.id} />
        <Button type="submit" variant="ghost" size="sm" disabled={removing} className="text-red-700 hover:bg-red-50 hover:text-red-800">
          {removing ? "Removing…" : "Remove"}
        </Button>
      </form>
      <FormError message={state?.error} />
    </div>
  );
}

// ---------------------------------------------------------------------------

export function CommentForm({
  creativeId,
  versionId,
  versionNumber,
  placeholder,
}: {
  creativeId: string;
  versionId: string;
  versionNumber: number;
  placeholder: string;
}) {
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(addComment, undefined);
  const e = state?.fieldErrors;
  return (
    <form action={action} className="flex flex-col gap-2" noValidate>
      <input type="hidden" name="creativeId" value={creativeId} />
      <input type="hidden" name="versionId" value={versionId} />
      <label className="flex flex-col gap-1.5">
        <span className="sr-only">Comment on V{versionNumber}</span>
        <Textarea
          name="content"
          // React resets the form after each submit: keep the text if posting
          // failed, clear it after success.
          defaultValue={state?.ok ? "" : state?.values?.content}
          required
          maxLength={4000}
          placeholder={placeholder}
          aria-invalid={e?.content ? true : undefined}
          className="min-h-20"
        />
        <FieldErrorText message={e?.content} />
      </label>
      <FormError message={state?.error} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-meta">Comments are attached to V{versionNumber}.</span>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Posting…" : "Post comment"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

export function DecisionPanel({
  creativeId,
  versionId,
  versionNumber,
}: {
  creativeId: string;
  versionId: string;
  versionNumber: number;
}) {
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(submitDecision, undefined);
  const [mode, setMode] = useState<"choose" | "changes">(state?.values?.decision === "CHANGES_REQUESTED" ? "changes" : "choose");
  const e = state?.fieldErrors;

  if (state?.ok) return <Success message={state.ok} />;

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="creativeId" value={creativeId} />
      <input type="hidden" name="versionId" value={versionId} />
      <FormError message={state?.error} />

      {mode === "changes" ? (
        <>
          <input type="hidden" name="decision" value="CHANGES_REQUESTED" />
          <Field label={`What should change in V${versionNumber}?`} error={e?.reason}>
            <Textarea
              name="reason"
              defaultValue={state?.values?.reason}
              required
              minLength={10}
              maxLength={2000}
              autoFocus
              placeholder="Be specific so the next version is the right one. For example: Make the logo bigger and use the spring offer copy."
              aria-invalid={e?.reason ? true : undefined}
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setMode("choose")} disabled={pending}>
              Back
            </Button>
            <Button type="submit" disabled={pending} className="bg-amber-600 hover:bg-amber-700 active:bg-amber-800">
              {pending ? "Sending…" : "Send change request"}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="submit"
            name="decision"
            value="APPROVED"
            disabled={pending}
            className={cn("sm:flex-1", "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800")}
          >
            <CheckIcon /> {pending ? "Approving…" : `Approve V${versionNumber}`}
          </Button>
          <Button variant="secondary" className="sm:flex-1" onClick={() => setMode("changes")} disabled={pending}>
            Request changes
          </Button>
        </div>
      )}
    </form>
  );
}
