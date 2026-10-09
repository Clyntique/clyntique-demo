"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { CreativeFormat } from "@/generated/prisma/enums";
import { createSubmission, updateSubmission, type SubmissionFormState } from "@/app/dashboard/submissions/actions";
import { FORMATS, FORMAT_ORDER } from "@/lib/creative-format";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormError } from "@/components/forms/form-error";

// Create or edit a client submission. Drafts may be incomplete; the submit
// step (SubmitPanel) checks for a file, a market and a platform, and the
// server re-checks everything.

type Option = { code: string; name: string };

export type SubmissionFormValues = {
  name: string;
  description: string;
  context: string;
  format: CreativeFormat;
  markets: string[];
  platforms: string[];
};

const optionClasses =
  "flex cursor-pointer flex-col gap-0.5 rounded-md border border-line bg-surface px-3 py-2.5 shadow-card transition-colors hover:border-line-strong has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-brand-100";

const chipClasses =
  "inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-soft shadow-card transition-colors hover:border-line-strong has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-900 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-brand-100";

function Choices({ name, legend, hint, options, selected }: { name: string; legend: string; hint: string; options: Option[]; selected: string[] }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-0.5 text-[13px] font-medium text-ink-soft">{legend}</legend>
      <p className="text-meta mb-1.5">{hint}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.code} className={chipClasses}>
            <input type="checkbox" name={name} value={o.code} defaultChecked={selected.includes(o.code)} className="size-3.5 accent-brand-600" />
            {o.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SubmissionForm(
  props:
    | { mode: "create"; projects: { id: string; name: string }[]; projectId?: string; markets: Option[]; platforms: Option[] }
    | {
        mode: "edit";
        creativeId: string;
        initial: SubmissionFormValues;
        /** Markets and platforms can only change while the submission is a draft. */
        targetingEditable: boolean;
        markets: Option[];
        platforms: Option[];
      },
) {
  const create = props.mode === "create";
  const [state, action, pending] = useActionState<SubmissionFormState, FormData>(create ? createSubmission : updateSubmission, undefined);
  const v = state?.values;
  const initial: SubmissionFormValues = create
    ? { name: "", description: "", context: "", format: "FEED", markets: [], platforms: [] }
    : props.initial;
  const str = (key: keyof SubmissionFormValues) => (typeof v?.[key] === "string" ? (v[key] as string) : (initial[key] as string));
  const arr = (key: "markets" | "platforms") => (Array.isArray(v?.[key]) ? (v[key] as string[]) : initial[key]);
  const showTargeting = create || props.targetingEditable;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {!create && <input type="hidden" name="creativeId" value={props.creativeId} />}
      {showTargeting && <input type="hidden" name="targeting" value="1" />}
      <FormError message={state?.error} />
      {state?.ok && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
          {state.ok}
        </p>
      )}

      {create && (
        <Field label="Project" hint={props.projects.length > 1 ? "The campaign this creative belongs to." : undefined}>
          <Select name="projectId" defaultValue={(v?.projectId as string) ?? props.projectId ?? props.projects[0]?.id} required>
            {props.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Creative title" hint="For example: Spring sale — Instagram Story">
        <Input name="name" defaultValue={str("name")} required maxLength={120} />
      </Field>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-[13px] font-medium text-ink-soft">Creative type</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FORMAT_ORDER.map((f) => (
            <label key={f} className={optionClasses}>
              <input type="radio" name="format" value={f} defaultChecked={str("format") === f} className="sr-only" />
              <span className="text-[13px] font-medium text-ink">{FORMATS[f].label}</span>
              <span className="text-meta">{FORMATS[f].ratio}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {showTargeting ? (
        <>
          <Choices
            name="markets"
            legend="Target markets"
            hint="Where you plan to run this ad. Choose at least one before submitting."
            options={props.markets}
            selected={arr("markets")}
          />
          <Choices
            name="platforms"
            legend="Advertising platforms"
            hint="Where it will appear. Choose at least one before submitting."
            options={props.platforms}
            selected={arr("platforms")}
          />
        </>
      ) : (
        <p className="text-meta rounded-md bg-subtle px-3 py-2">Markets and platforms are fixed once a creative has been submitted.</p>
      )}

      <Field label="Description (optional)" hint="What the creative shows and says.">
        <Textarea name="description" defaultValue={str("description")} maxLength={1000} className="min-h-20" />
      </Field>

      <Field label="Campaign context (optional)" hint="Objective, audience and key message, so the reviewer understands the intent.">
        <Textarea name="context" defaultValue={str("context")} maxLength={2000} />
      </Field>

      {create && (
        <p className="text-meta rounded-md bg-subtle px-3 py-2">
          This saves a private draft. Only you can see it until you submit it. Next you&apos;ll upload the creative file.
        </p>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
        {create && (
          <Link href="/dashboard/creatives" className={buttonClasses({ variant: "ghost" })}>
            Cancel
          </Link>
        )}
        <Button type="submit" variant={create ? "primary" : "secondary"} disabled={pending}>
          {pending ? "Saving…" : create ? "Create draft" : "Save draft"}
        </Button>
      </div>
    </form>
  );
}
