"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { EvidenceType, Role } from "@/generated/prisma/enums";
import { createLibraryDocumentAction } from "@/lib/knowledge/actions";
import { LIBRARY_ACCEPT, LIBRARY_FILE_HINT, checkLibraryFile, libraryKindFor, libraryPathFor, libraryWorkspaceKey } from "@/lib/library-files";
import { UploadStalledError, withStallGuard } from "@/lib/upload-stall";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { UploadIcon } from "@/components/ui/icons";
import { FormError } from "@/components/forms/form-error";
import { EVIDENCE_TYPES } from "@/components/review/evidence-types";

/*
 * Upload a document to the Content Library. The browser uploads straight to
 * the private Blob store with a token from /api/library/upload (issued for one
 * path in the uploader's own workspace folder), then asks the server to
 * record and index it. The server re-verifies everything; this component
 * only manages the form.
 */

const ALL_TYPES = Object.keys(EVIDENCE_TYPES) as EvidenceType[];
const CLIENT_TYPES = ALL_TYPES.filter((t) => t !== "POLICY_REFERENCE");

type Phase = { name: "idle" } | { name: "uploading"; percent: number } | { name: "saving" } | { name: "done"; message: string };

export function LibraryUploadForm({ role, workspaceId, configured }: { role: Role; workspaceId: string | null; configured: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [, startTransition] = useTransition();
  const busy = phase.name === "uploading" || phase.name === "saving";
  const TYPES = role === "TEAM" ? ALL_TYPES : CLIENT_TYPES;

  function chooseFile(next: File | null) {
    setFile(next);
    setError(null);
    setFileError(next ? checkLibraryFile(next) : null);
  }

  async function submit(formData: FormData) {
    if (busy) return;
    setError(null);
    if (!file) return setError("Choose a file to upload.");
    const problem = checkLibraryFile(file);
    const kind = libraryKindFor(file.name);
    if (problem || !kind) return setFileError(problem ?? "Unsupported file type.");
    if (!formData.get("type")) return setError("Choose the type of document.");

    const uploadKey = crypto.randomUUID();
    setPhase({ name: "uploading", percent: 0 });
    let url: string;
    try {
      const controller = new AbortController();
      const blob = await withStallGuard(controller, (progress) =>
        upload(libraryPathFor(libraryWorkspaceKey(workspaceId), uploadKey, kind.extension), file, {
          access: "private",
          handleUploadUrl: "/api/library/upload",
          clientPayload: JSON.stringify({ uploadKey, fileName: file.name }),
          contentType: kind.mimeType,
          abortSignal: controller.signal,
          onUploadProgress: ({ percentage }) => {
            progress();
            setPhase({ name: "uploading", percent: Math.round(percentage) });
          },
        }),
      );
      url = blob.url;
    } catch (e) {
      setPhase({ name: "idle" });
      if (e instanceof UploadStalledError) return setError(e.message);
      const message = e instanceof Error ? e.message.replace(/^Vercel Blob:\s*/i, "") : "";
      return setError(/unsupported|sign in|holds up to|isn't|can't/i.test(message) ? message : "The upload didn't finish. Check your connection and try again.");
    }

    setPhase({ name: "saving" });
    let result: Awaited<ReturnType<typeof createLibraryDocumentAction>>;
    try {
      result = await createLibraryDocumentAction({
        uploadKey,
        url,
        fileName: file.name,
        title: String(formData.get("title") ?? ""),
        type: String(formData.get("type") ?? ""),
        source: String(formData.get("source") ?? ""),
        visibility: String(formData.get("visibility") ?? ""),
      });
    } catch {
      result = { error: "Couldn't reach the server. Check your connection." };
    }
    if (!result || result.error) {
      setPhase({ name: "idle" });
      return setError(result?.error ?? "Something went wrong.");
    }
    setPhase({ name: "done", message: result.ok ?? "Document added." });
    setFile(null);
    formRef.current?.reset();
    setOpen(false);
    startTransition(() => router.refresh());
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => { setPhase({ name: "idle" }); setOpen(true); }} disabled={!configured}>
          <UploadIcon /> Upload a document
        </Button>
        {!configured && <span className="text-meta">File uploads are not configured on this deployment.</span>}
        {phase.name === "done" && (
          <p role="status" className="rounded-md bg-positive-soft px-3 py-2 text-small text-positive-ink">
            {phase.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <form ref={formRef} action={submit} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 shadow-card" noValidate>
      <div>
        <h3 className="text-card-title">Upload to your Content Library</h3>
        <p className="text-meta">{LIBRARY_FILE_HINT}</p>
      </div>
      <FormError message={error ?? undefined} />
      <Field label="File" error={fileError ?? undefined}>
        <input
          type="file"
          name="file"
          accept={LIBRARY_ACCEPT}
          required
          disabled={busy}
          onChange={(e) => chooseFile(e.currentTarget.files?.[0] ?? null)}
          className="text-small text-ink-soft file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-small file:font-medium file:text-ink"
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Title" hint="Leave empty to use the file name.">
          <Input name="title" maxLength={120} placeholder="e.g. Clinical study, treatment X, 2025" disabled={busy} />
        </Field>
        <Field label="Type">
          <Select name="type" required defaultValue="" disabled={busy}>
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
        <Field label="Source" hint="Who produced it, e.g. the journal, the regulator or your own team.">
          <Input name="source" maxLength={120} disabled={busy} />
        </Field>
        {role === "CLIENT" && (
          <Field label="Visibility" hint="Private documents never reach Clyntique. Shared ones appear in your reviewer's knowledge search.">
            <Select name="visibility" defaultValue="PRIVATE" disabled={busy}>
              <option value="PRIVATE">Private to my workspace</option>
              <option value="TEAM">Share with Clyntique reviewers</option>
            </Select>
          </Field>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={busy || Boolean(fileError)}>
          {phase.name === "uploading" ? `Uploading ${phase.percent}%` : phase.name === "saving" ? "Indexing…" : "Upload and index"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
