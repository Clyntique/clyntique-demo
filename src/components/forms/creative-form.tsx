"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createCreative, type FormState } from "@/app/admin/projects/actions";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { FORMATS, FORMAT_ORDER } from "@/lib/creative-format";
import { FormError } from "./form-error";

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Save as draft", hint: "Only your team can see it." },
  { value: "IN_REVIEW", label: "Share for review", hint: "The client sees it right away." },
];

const optionClasses =
  "flex cursor-pointer flex-col gap-0.5 rounded-md border border-line bg-surface px-3 py-2.5 shadow-card transition-colors hover:border-line-strong has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-brand-100";

export function CreativeForm({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createCreative, undefined);
  const v = state?.values;
  const e = state?.fieldErrors;
  const cancelHref = `/admin/projects/${projectId}`;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="projectId" value={projectId} />
      <FormError message={state?.error} />

      <Field label="Creative name" hint="For example: Instagram Story — Product Launch" error={e?.name}>
        <Input name="name" defaultValue={v?.name} required maxLength={120} aria-invalid={e?.name ? true : undefined} />
      </Field>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[13px] font-medium text-ink-soft">Format</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FORMAT_ORDER.map((f) => (
            <label key={f} className={optionClasses}>
              <input
                type="radio"
                name="format"
                value={f}
                defaultChecked={(v?.format ?? "FEED") === f}
                className="sr-only"
              />
              <span className="text-[13px] font-medium text-ink">{FORMATS[f].label}</span>
              <span className="text-meta">{FORMATS[f].ratio}</span>
            </label>
          ))}
        </div>
        {e?.format && <span className="text-[12px] text-red-600">{e.format}</span>}
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[13px] font-medium text-ink-soft">Status</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STATUS_OPTIONS.map((s) => (
            <label key={s.value} className={cn(optionClasses, "py-3")}>
              <input
                type="radio"
                name="status"
                value={s.value}
                defaultChecked={(v?.status ?? "DRAFT") === s.value}
                className="sr-only"
              />
              <span className="text-[13px] font-medium text-ink">{s.label}</span>
              <span className="text-meta">{s.hint}</span>
            </label>
          ))}
        </div>
        {e?.status && <span className="text-[12px] text-red-600">{e.status}</span>}
      </fieldset>

      <Field label="Notes (optional)" hint="Context for reviewers: objective, audience, key message." error={e?.description}>
        <Textarea name="description" defaultValue={v?.description} maxLength={1000} />
      </Field>

      <p className="text-meta rounded-md bg-subtle px-3 py-2">
        File upload and versions come with the review screen. For now this creates the creative record.
      </p>

      <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
        <Link href={cancelHref} className={buttonClasses({ variant: "ghost" })}>
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add creative"}
        </Button>
      </div>
    </form>
  );
}
