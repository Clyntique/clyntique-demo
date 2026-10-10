"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, useTransition } from "react";
import type { EvidenceType } from "@/generated/prisma/enums";
import {
  addEvidenceAction,
  respondToFindingAction,
  resubmitSubmission,
  withdrawEvidenceAction,
  type SubmissionFormState,
} from "@/app/dashboard/submissions/actions";
import { cn } from "@/lib/cn";
import { EVIDENCE_ACCEPT, EVIDENCE_FILE_HINT, checkEvidenceFile, evidenceKindFor, evidencePathFor } from "@/lib/evidence-files";
import { formatBytes } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { CheckIcon, UploadIcon } from "@/components/ui/icons";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormError } from "@/components/forms/form-error";
import { EVIDENCE_TYPES } from "@/components/review/evidence-types";

// CLIENT remediation controls while changes are requested: respond to a
// finding, add or withdraw supporting evidence, and resubmit. Every action is
// a server action that re-checks the user, ownership, status and finding
// (src/lib/workflow/commands.ts); these components only manage form state.

function Ok({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
      {message}
    </p>
  );
}

const chip =
  "inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-soft has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-900";

export type Choice = { id: string; label: string };

// ---------------------------------------------------------------------------

export function RespondForm({ findingId, evidence, hint }: { findingId: string; evidence: Choice[]; hint: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<SubmissionFormState, FormData>(async (prev, fd) => {
    const result = await respondToFindingAction(prev, fd);
    if (result?.ok) setOpen(false);
    return result;
  }, undefined);

  if (!open) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Button size="sm" onClick={() => setOpen(true)}>
          Respond
        </Button>
        <Ok message={state?.ok} />
      </div>
    );
  }
  const linked = Array.isArray(state?.values?.evidence) ? (state.values.evidence as string[]) : [];
  return (
    <form action={action} className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
      <input type="hidden" name="findingId" value={findingId} />
      <FormError message={state?.error} />
      <Field label="Your response" hint={hint}>
        <Textarea
          name="message"
          required
          maxLength={4000}
          className="min-h-24"
          defaultValue={(state?.values?.message as string) ?? ""}
          placeholder="Explain what you changed, or why. Responses can't be edited once sent."
        />
      </Field>
      {evidence.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-[13px] font-medium text-ink-soft">Link evidence (optional)</legend>
          <div className="flex flex-wrap gap-1.5">
            {evidence.map((e) => (
              <label key={e.id} className={chip}>
                <input type="checkbox" name="evidence" value={e.id} defaultChecked={linked.includes(e.id)} className="size-3 accent-brand-600" />
                {e.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send response"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

const TYPES = Object.keys(EVIDENCE_TYPES) as EvidenceType[];

type Phase = { name: "idle" } | { name: "uploading"; percent: number } | { name: "saving" } | { name: "done" };

export function EvidenceForm({ creativeId, findings, configured }: { creativeId: string; findings: Choice[]; configured: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [, startTransition] = useTransition();
  const busy = phase.name === "uploading" || phase.name === "saving";

  function chooseFile(next: File | null) {
    setFile(next);
    setFileError(next ? checkEvidenceFile(next) : null);
  }

  async function submit(formData: FormData) {
    if (busy) return;
    setError(null);
    let uploaded: { uploadKey: string; url: string; fileName: string } | null = null;
    if (file) {
      const problem = checkEvidenceFile(file);
      const kind = evidenceKindFor(file.name);
      if (problem || !kind) return setFileError(problem ?? "Unsupported file type.");
      const uploadKey = crypto.randomUUID();
      setPhase({ name: "uploading", percent: 0 });
      try {
        const blob = await upload(evidencePathFor(creativeId, uploadKey, kind.extension), file, {
          access: "private",
          handleUploadUrl: "/api/evidence/upload",
          clientPayload: JSON.stringify({ creativeId, uploadKey, fileName: file.name }),
          contentType: kind.mimeType,
          onUploadProgress: ({ percentage }) => setPhase({ name: "uploading", percent: Math.round(percentage) }),
        });
        uploaded = { uploadKey, url: blob.url, fileName: file.name };
      } catch (e) {
        setPhase({ name: "idle" });
        const message = e instanceof Error ? e.message.replace(/^Vercel Blob:\s*/i, "") : "";
        return setError(/unsupported|sign in|no longer exists|isn't|can't/i.test(message) ? message : "The upload didn't finish. Check your connection and try again.");
      }
    }

    setPhase({ name: "saving" });
    let result: { ok: true } | { ok: false; error: string };
    try {
      result = await addEvidenceAction({
        creativeId,
        title: String(formData.get("title") ?? ""),
        type: String(formData.get("type") ?? ""),
        description: String(formData.get("description") ?? ""),
        source: String(formData.get("source") ?? ""),
        url: String(formData.get("url") ?? ""),
        file: uploaded,
        findingIds: formData.getAll("findings").map(String),
      });
    } catch {
      result = { ok: false, error: "Couldn't reach the server. Check your connection." };
    }
    if (!result.ok) {
      setPhase({ name: "idle" });
      return setError(result.error);
    }
    setPhase({ name: "done" });
    setFile(null);
    formRef.current?.reset();
    setOpen(false);
    startTransition(() => router.refresh());
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => { setPhase({ name: "idle" }); setOpen(true); }}>
          + Add evidence
        </Button>
        {phase.name === "done" && <Ok message="Evidence added." />}
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={submit}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 shadow-card"
      noValidate
    >
      <div>
        <h3 className="text-card-title">Add supporting evidence</h3>
        <p className="text-meta">Shared with the Clyntique reviewer. Once you resubmit, it becomes part of the review record.</p>
      </div>
      <FormError message={error ?? undefined} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Title">
          <Input name="title" required maxLength={120} placeholder="e.g. Price history, March–May" />
        </Field>
        <Field label="Type">
          <Select name="type" required defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {EVIDENCE_TYPES[t]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="What does it show?" hint="Briefly, how it supports the claim or answers the finding.">
        <Textarea name="description" maxLength={4000} className="min-h-20" />
      </Field>

      {configured ? (
        <div>
          <input
            id={`evidence-file-${creativeId}`}
            type="file"
            accept={EVIDENCE_ACCEPT}
            className="peer sr-only"
            disabled={busy}
            onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
          />
          <label
            htmlFor={`evidence-file-${creativeId}`}
            className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line-strong bg-surface px-4 py-3 transition-colors peer-focus-visible:ring-3 peer-focus-visible:ring-brand-100 hover:border-brand-500 hover:bg-brand-50/40"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700 [&_svg]:size-4">
              <UploadIcon />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-medium text-ink">{file ? file.name : "Attach a file (optional)"}</span>
              <span className="text-meta">{file ? formatBytes(file.size) : EVIDENCE_FILE_HINT}</span>
            </span>
          </label>
          {fileError && (
            <p role="alert" className="mt-1.5 text-[12px] text-red-600">
              {fileError}
            </p>
          )}
        </div>
      ) : (
        <p className="text-meta rounded-md bg-subtle px-3 py-2">File uploads aren&apos;t set up in this environment. You can still add a link or a description.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Link (optional)">
          <Input name="url" type="url" inputMode="url" maxLength={2000} placeholder="https://" />
        </Field>
        <Field label="Source (optional)">
          <Input name="source" maxLength={120} placeholder="e.g. Internal sales data" />
        </Field>
      </div>

      {findings.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-[13px] font-medium text-ink-soft">Supports finding</legend>
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

      {phase.name === "uploading" && (
        <p role="status" className="text-meta tabular-nums">
          Uploading… {phase.percent}%
        </p>
      )}
      {phase.name === "saving" && (
        <p role="status" className="text-meta">
          Checking and saving…
        </p>
      )}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !!fileError}>
          {busy ? "Saving…" : "Add evidence"}
        </Button>
      </div>
    </form>
  );
}

export function WithdrawEvidenceForm({ evidenceId }: { evidenceId: string }) {
  const [confirm, setConfirm] = useState(false);
  const [state, action, pending] = useActionState<SubmissionFormState, FormData>(withdrawEvidenceAction, undefined);
  if (!confirm) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
        Withdraw
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="evidenceId" value={evidenceId} />
      <span className="text-meta">It stays in the history, marked as withdrawn.</span>
      <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
        Keep
      </Button>
      <Button size="sm" variant="secondary" type="submit" disabled={pending}>
        {pending ? "Withdrawing…" : "Withdraw evidence"}
      </Button>
      <FormError message={state?.error} />
    </form>
  );
}

// ---------------------------------------------------------------------------

export type ChecklistItem = { key: string; label: string; done: boolean };

export function ResubmitPanel({ creativeId, items, nextRound }: { creativeId: string; items: ChecklistItem[]; nextRound: number }) {
  const [state, action, pending] = useActionState<SubmissionFormState, FormData>(resubmitSubmission, undefined);
  const ready = items.every((i) => i.done);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="creativeId" value={creativeId} />
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2.5 text-[13px]">
            <span
              aria-hidden
              className={cn(
                "mt-px flex size-5 shrink-0 items-center justify-center rounded-full ring-1 ring-inset [&_svg]:size-3",
                item.done ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-surface text-transparent ring-line-strong",
              )}
            >
              <CheckIcon />
            </span>
            <span className={item.done ? "text-ink" : "text-muted"}>{item.label}</span>
            <span className="sr-only">{item.done ? "(done)" : "(to do)"}</span>
          </li>
        ))}
      </ul>
      <Field label="Note to the reviewer (optional)">
        <Textarea name="note" maxLength={2000} className="min-h-16" defaultValue={(state?.values?.note as string) ?? ""} placeholder="A short summary of what changed." />
      </Field>
      <FormError message={state?.error} />
      <Ok message={state?.ok} />
      <Button type="submit" disabled={!ready || pending} className="w-full">
        {pending ? "Resubmitting…" : `Resubmit for review (round ${nextRound})`}
      </Button>
      <p className="text-meta">The reviewer decides whether each finding is resolved. Resubmitting doesn&apos;t close any finding by itself.</p>
    </form>
  );
}
