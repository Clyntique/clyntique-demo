"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createProject, type FormState } from "@/app/admin/projects/actions";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { ClientOption } from "@/lib/data/workspace";
import { FormError } from "./form-error";

export function ProjectForm({ clients }: { clients: ClientOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createProject, undefined);
  const v = state?.values;
  const e = state?.fieldErrors;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormError message={state?.error} />
      <Field label="Project name" hint="For example: Q4 Campaign" error={e?.name}>
        <Input name="name" defaultValue={v?.name} required maxLength={120} aria-invalid={e?.name ? true : undefined} />
      </Field>
      <Field label="Client" hint="The client who will review and approve this project." error={e?.clientId}>
        <Select
          name="clientId"
          defaultValue={v?.clientId ?? ""}
          required
          aria-invalid={e?.clientId ? true : undefined}
        >
          <option value="" disabled>
            Choose a client
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.email})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Description (optional)" hint="Goals, audience, or anything the client should know." error={e?.description}>
        <Textarea name="description" defaultValue={v?.description} maxLength={1000} />
      </Field>
      <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
        <Link href="/admin/projects" className={buttonClasses({ variant: "ghost" })}>
          Cancel
        </Link>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create project"}
        </Button>
      </div>
    </form>
  );
}
