"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { deleteLibraryDocumentAction, processLibraryDocumentAction, saveChunkAsRecordAction, setLibraryVisibilityAction, type LibraryActionState } from "@/lib/knowledge/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormError } from "@/components/forms/form-error";

/*
 * Small forms of the Content Library and knowledge search. Each posts to a
 * server action that re-checks the user and ownership; these components only
 * hold form state and refresh the page afterwards.
 */

function Ok({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-md bg-positive-soft px-3 py-2 text-small text-positive-ink">
      {message}
    </p>
  );
}

function useRefreshOn(state: LibraryActionState) {
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);
}

/** Retry indexing a document that failed (owner only). */
export function ProcessDocumentForm({ documentId }: { documentId: string }) {
  const [state, action, pending] = useActionState<LibraryActionState, FormData>(processLibraryDocumentAction, undefined);
  useRefreshOn(state);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="documentId" value={documentId} />
      <FormError message={state?.error} />
      <Ok message={state?.ok} />
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Indexing…" : "Try indexing again"}
        </Button>
      </div>
    </form>
  );
}

/** CLIENT: share with, or hide from, Clyntique reviewers. */
export function VisibilityForm({ documentId, visibility }: { documentId: string; visibility: "PRIVATE" | "TEAM" }) {
  const [state, action, pending] = useActionState<LibraryActionState, FormData>(setLibraryVisibilityAction, undefined);
  useRefreshOn(state);
  const next = visibility === "TEAM" ? "PRIVATE" : "TEAM";
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="visibility" value={next} />
      <FormError message={state?.error} />
      <Ok message={state?.ok} />
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {next === "TEAM" ? "Share with Clyntique reviewers" : "Make private again"}
        </Button>
      </div>
    </form>
  );
}

/** Owner only: delete the file and its search passages (the record of the document stays). */
export function DeleteDocumentForm({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [state, action, pending] = useActionState<LibraryActionState, FormData>(deleteLibraryDocumentAction, undefined);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);
  if (!confirm) {
    return (
      <div className="flex flex-col gap-2">
        <Ok message={state?.ok} />
        <div>
          <Button type="button" variant="ghost" onClick={() => setConfirm(true)}>
            Delete document…
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2 rounded-md border border-line p-3">
      <input type="hidden" name="documentId" value={documentId} />
      <p className="text-small text-ink">Delete this document? The file and its search passages are removed for good. Evidence records that quoted it keep their quote and say the document was deleted.</p>
      <FormError message={state?.error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Deleting…" : "Yes, delete"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setConfirm(false)} disabled={pending}>
          Keep it
        </Button>
      </div>
    </form>
  );
}

/** Save one search passage as an Evidence Dictionary record, optionally naming the claim it supports. */
export function SaveChunkForm({ chunkId, recordsHref }: { chunkId: string; recordsHref: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<LibraryActionState, FormData>(saveChunkAsRecordAction, undefined);
  useRefreshOn(state);
  if (state?.ok && state.recordId) {
    return (
      <p role="status" className="text-small text-positive-ink">
        Saved.{" "}
        <a href={`${recordsHref}/${state.recordId}`} className="font-medium underline">
          Open the record
        </a>{" "}
        to attach it to a submission.
      </p>
    );
  }
  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Save as evidence record
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-2 rounded-md border border-line bg-subtle p-3">
      <input type="hidden" name="chunkId" value={chunkId} />
      <label className="flex flex-col gap-1">
        <span className="text-small font-medium text-ink-soft">Claim this passage supports (optional)</span>
        <Input name="claimText" maxLength={300} placeholder="e.g. Results visible within 2 weeks" />
      </label>
      <FormError message={state?.error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save record"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
