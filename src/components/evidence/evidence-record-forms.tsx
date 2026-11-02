"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import type { CreativeStatus, EvidenceType, Role } from "@/generated/prisma/enums";
import { attachTeamRecordAction, checkRecordAction, createTeamRecordAction } from "@/app/admin/evidence/actions";
import { attachClientRecordAction, createClientRecordAction, type EvidenceRecordFormState } from "@/app/dashboard/evidence/actions";
import type { AttachableRecord } from "@/lib/data/evidence-records";
import { EVIDENCE_RECORD_CHECK_LABEL, EVIDENCE_RECORD_NOTICE, EVIDENCE_RECORD_STATUS_LABEL, type EvidenceRecordCheckResultKey } from "@/lib/workflow/labels";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { STATUS_STYLES } from "@/components/ui/status-badge";
import { FormError } from "@/components/forms/form-error";
import { EVIDENCE_TYPES } from "@/components/review/evidence-types";

/*
 * Forms of the Evidence Dictionary. Each posts to a server action that
 * re-checks the user, the record's workspace, the submission and its status
 * (src/lib/workflow/evidence-record-commands.ts); these components only
 * manage form state. The same form serves both roles and picks the action
 * for the role it is rendered for; the server decides regardless.
 */

const ALL_TYPES = Object.keys(EVIDENCE_TYPES) as EvidenceType[];
const CLIENT_TYPES = ALL_TYPES.filter((t) => t !== "POLICY_REFERENCE");
const CHECK_RESULTS = Object.keys(EVIDENCE_RECORD_CHECK_LABEL) as EvidenceRecordCheckResultKey[];

function Ok({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-md bg-positive-soft px-3 py-2 text-small text-positive-ink">
      {message}
    </p>
  );
}

const chip =
  "inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1 text-caption font-medium text-ink-soft has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-900";

// ---------------------------------------------------------------------------

/** Add a record to the dictionary (a client's own, or Clyntique's for the team). */
export function NewRecordForm({ role, startOpen = false }: { role: Role; startOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(startOpen);
  const [state, action, pending] = useActionState<EvidenceRecordFormState, FormData>(role === "TEAM" ? createTeamRecordAction : createClientRecordAction, undefined);
  const types = role === "TEAM" ? ALL_TYPES : CLIENT_TYPES;
  const v = (key: string) => (state?.values?.[key] as string | undefined) ?? "";

  // Once saved, open the new record so its attachments and checks are at hand.
  useEffect(() => {
    if (state?.ok && state.recordId) router.push(`${role === "TEAM" ? "/admin" : "/dashboard"}/evidence/${state.recordId}`);
  }, [state, role, router]);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setOpen(true)}>{role === "TEAM" ? "+ Add Clyntique record" : "+ Add evidence record"}</Button>
        <Ok message={state?.ok} />
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 shadow-card" noValidate>
      <div>
        <h3 className="text-card-title">{role === "TEAM" ? "Add a Clyntique reference record" : "Add an evidence record"}</h3>
        <p className="text-meta">
          {role === "TEAM"
            ? "A reusable Clyntique reference (an official source, a policy summary, a standard). Attach it to submissions under review as Clyntique evidence."
            : "A reusable reference for your claims: a licence, a study, a certification, a document. Describe it, name its source or link to it; files stay with the submission you upload them to."}
        </p>
      </div>
      <FormError message={state?.error} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Title">
          <Input name="title" required maxLength={120} defaultValue={v("title")} placeholder="e.g. Medical practice licence 2026" />
        </Field>
        <Field label="Type">
          <Select name="type" required defaultValue={v("type")}>
            <option value="" disabled>
              Choose…
            </option>
            {types.map((t) => (
              <option key={t} value={t}>
                {EVIDENCE_TYPES[t]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Claim it supports (optional)" hint="The words an ad would use, e.g. “Board-certified dermatologists”.">
        <Input name="claimText" maxLength={300} defaultValue={v("claimText")} />
      </Field>
      <Field label="What does it show?" hint="Briefly, what the document or study establishes and for whom.">
        <Textarea name="description" maxLength={4000} className="min-h-20" defaultValue={v("description")} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Source (optional)">
          <Input name="source" maxLength={120} defaultValue={v("source")} placeholder="e.g. State medical board" />
        </Field>
        <Field label="Link (optional)">
          <Input name="url" type="url" inputMode="url" maxLength={2000} defaultValue={v("url")} placeholder="https://" />
        </Field>
        <Field label="Valid until (optional)" hint="YYYY-MM-DD, e.g. a licence expiry.">
          <Input name="validUntil" type="date" defaultValue={v("validUntil")} />
        </Field>
      </div>
      <p className="text-caption text-muted">{EVIDENCE_RECORD_NOTICE}</p>
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Add record"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

/** From a record's page: attach it to one of the submissions the viewer may add evidence to. */
export function AttachRecordForm({ role, recordId, targets }: { role: Role; recordId: string; targets: { id: string; name: string; status: CreativeStatus }[] }) {
  const [state, action, pending] = useActionState<EvidenceRecordFormState, FormData>(role === "TEAM" ? attachTeamRecordAction : attachClientRecordAction, undefined);
  if (!targets.length) {
    return (
      <p className="text-meta">
        {role === "TEAM" ? "No submission is under review right now, or this record is attached to every one that is." : "No draft or changes-requested submission is open for evidence right now, or this record is already attached to each of them."}
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="recordId" value={recordId} />
      <FormError message={state?.error} />
      <Ok message={state?.ok} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Submission">
          <Select name="creativeId" required defaultValue={(state?.values?.creativeId as string) ?? ""}>
            <option value="" disabled>
              Choose…
            </option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {STATUS_STYLES[t.status].label}
              </option>
            ))}
          </Select>
        </Field>
        {role === "TEAM" ? (
          <Field label="Who sees it">
            <Select name="visibility" required defaultValue={(state?.values?.visibility as string) ?? ""}>
              <option value="" disabled>
                Choose…
              </option>
              <option value="SHARED">Client and team (with the next decision)</option>
              <option value="INTERNAL">Team only</option>
            </Select>
          </Field>
        ) : (
          <Field label="Where the claim appears (optional)" hint="e.g. Headline, caption, 0:05 voice-over.">
            <Input name="claimLocation" maxLength={120} defaultValue={(state?.values?.claimLocation as string) ?? ""} />
          </Field>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Attaching…" : "Attach to submission"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

/** On a submission's Evidence tab: attach a dictionary record to this submission. */
export function AttachFromDictionaryForm({
  role,
  creativeId,
  records,
  findings,
}: {
  role: Role;
  creativeId: string;
  records: AttachableRecord[];
  /** Findings in the open cycle the attachment may support. */
  findings: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<EvidenceRecordFormState, FormData>(async (prev, fd) => {
    const result = await (role === "TEAM" ? attachTeamRecordAction : attachClientRecordAction)(prev, fd);
    if (result?.ok) {
      setOpen(false);
      router.refresh();
    }
    return result;
  }, undefined);
  const base = role === "TEAM" ? "/admin" : "/dashboard";

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setOpen(true)} disabled={!records.length}>
          {role === "TEAM" ? "Attach a Clyntique record" : "Attach from my Evidence Dictionary"}
        </Button>
        {!records.length && (
          <span className="text-meta">
            {role === "TEAM" ? "No Clyntique record left to attach." : "No record left to attach."}{" "}
            <a href={`${base}/evidence`} className="font-medium text-brand-700 hover:underline">
              Open the dictionary
            </a>
          </span>
        )}
        <Ok message={state?.ok} />
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 shadow-card" noValidate>
      <input type="hidden" name="creativeId" value={creativeId} />
      <div>
        <h3 className="text-card-title">{role === "TEAM" ? "Attach a Clyntique record" : "Attach from your Evidence Dictionary"}</h3>
        <p className="text-meta">A copy of the record&apos;s text is added to this submission&apos;s evidence; the record itself stays reusable.</p>
      </div>
      <FormError message={state?.error} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Record">
          <Select name="recordId" required defaultValue={(state?.values?.recordId as string) ?? ""}>
            <option value="" disabled>
              Choose…
            </option>
            {records.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} · {EVIDENCE_TYPES[r.type]} · {EVIDENCE_RECORD_STATUS_LABEL[r.status]}
                {r.expired ? " · validity date passed" : ""}
              </option>
            ))}
          </Select>
        </Field>
        {role === "TEAM" ? (
          <Field label="Who sees it">
            <Select name="visibility" required defaultValue={(state?.values?.visibility as string) ?? ""}>
              <option value="" disabled>
                Choose…
              </option>
              <option value="SHARED">Client and team (with the next decision)</option>
              <option value="INTERNAL">Team only</option>
            </Select>
          </Field>
        ) : (
          <Field label="Where the claim appears (optional)" hint="e.g. Headline, caption, 0:05 voice-over.">
            <Input name="claimLocation" maxLength={120} defaultValue={(state?.values?.claimLocation as string) ?? ""} />
          </Field>
        )}
      </div>
      {findings.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-small font-medium text-ink-soft">Supports finding</legend>
          <div className="flex flex-wrap gap-1.5">
            {findings.map((f) => (
              <label key={f.id} className={chip}>
                <input type="checkbox" name="findings" value={f.id} className="size-3 accent-brand-600" />
                {f.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Attaching…" : "Attach"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

/** TEAM records a check of a record. Append-only; the client sees it as "Clyntique reviewer". */
export function CheckRecordForm({ recordId }: { recordId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<EvidenceRecordFormState, FormData>(async (prev, fd) => {
    const result = await checkRecordAction(prev, fd);
    if (result?.ok) setOpen(false);
    return result;
  }, undefined);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Record a check
        </Button>
        <Ok message={state?.ok} />
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-line bg-subtle/40 p-3" noValidate>
      <input type="hidden" name="recordId" value={recordId} />
      <FormError message={state?.error} />
      <Field label="Check result">
        <Select name="result" required defaultValue={(state?.values?.result as string) ?? ""}>
          <option value="" disabled>
            Choose…
          </option>
          {CHECK_RESULTS.map((r) => (
            <option key={r} value={r}>
              {EVIDENCE_RECORD_CHECK_LABEL[r]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note to the client" hint="Required unless accepted: say what is missing or why it isn't accepted. Shown as “Clyntique reviewer”.">
        <Textarea name="note" maxLength={2000} defaultValue={(state?.values?.note as string) ?? ""} className="min-h-16" />
      </Field>
      <p className="text-caption text-muted">{EVIDENCE_RECORD_NOTICE}</p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        <Button size="sm" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Record check"}
        </Button>
      </div>
    </form>
  );
}
