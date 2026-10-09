"use client";

import { upload } from "@vercel/blob/client";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { finalizeVersion } from "@/lib/review/actions";
import { ACCEPT_ATTRIBUTE, checkFile, formatBytes, mediaKindFor, uploadPathFor, type UploadLimits } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { UploadIcon } from "@/components/ui/icons";
import { FormError } from "@/components/forms/form-error";

type Phase =
  | { name: "idle" }
  | { name: "uploading"; percent: number }
  | { name: "saving" }
  // The file is in storage but the version wasn't recorded yet: retry only the save.
  | { name: "save-failed"; error: string; blobUrl: string; uploadKey: string }
  | { name: "failed"; error: string }
  | { name: "done"; versionNumber: number };

const MULTIPART_FROM_BYTES = 50 * 1024 * 1024;

export function VersionUploader({
  creativeId,
  nextVersion,
  limits,
  configured,
  isDraft,
  doneHint,
  notesHint,
}: {
  creativeId: string;
  nextVersion: number;
  limits: UploadLimits;
  configured: boolean;
  isDraft: boolean;
  /** Overrides the message after a successful upload (client submissions). */
  doneHint?: string;
  /** Overrides who sees the change notes (client submissions: the reviewer). */
  notesHint?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState<Phase>({ name: "idle" });

  const busy = phase.name === "uploading" || phase.name === "saving";
  const first = nextVersion === 1;

  function chooseFile(next: File | null) {
    setPhase({ name: "idle" });
    setFile(next);
    setFileError(next ? checkFile(next, limits) : null);
  }

  async function save(blobUrl: string, uploadKey: string, picked: File) {
    setPhase({ name: "saving" });
    let result;
    try {
      result = await finalizeVersion({ creativeId, uploadKey, url: blobUrl, fileName: picked.name, changeNotes: notes });
    } catch {
      result = { ok: false as const, error: "Couldn't reach the server. Check your connection.", retryable: true };
    }
    if (result.ok) {
      setPhase({ name: "done", versionNumber: result.versionNumber });
      setFile(null);
      setNotes("");
      if (inputRef.current) inputRef.current.value = "";
      // Show the new current version.
      router.replace(pathname, { scroll: false });
      router.refresh();
    } else if (result.retryable) {
      setPhase({ name: "save-failed", error: result.error, blobUrl, uploadKey });
    } else {
      setPhase({ name: "failed", error: result.error });
    }
  }

  async function start() {
    if (!file || busyRef.current) return;
    const problem = checkFile(file, limits);
    const kind = mediaKindFor(file.name);
    if (problem || !kind) {
      setFileError(problem ?? "Unsupported file type.");
      return;
    }

    busyRef.current = true;
    const uploadKey = crypto.randomUUID();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ name: "uploading", percent: 0 });

    try {
      const blob = await upload(uploadPathFor(creativeId, uploadKey, kind.extension), file, {
        access: "private",
        handleUploadUrl: "/api/creatives/upload",
        clientPayload: JSON.stringify({ creativeId, uploadKey, fileName: file.name }),
        contentType: kind.mimeType,
        multipart: file.size >= MULTIPART_FROM_BYTES,
        abortSignal: controller.signal,
        onUploadProgress: ({ percentage }) => setPhase({ name: "uploading", percent: Math.round(percentage) }),
      });
      await save(blob.url, uploadKey, file);
    } catch (error) {
      if (controller.signal.aborted) {
        setPhase({ name: "idle" });
      } else {
        setPhase({ name: "failed", error: uploadErrorMessage(error) });
      }
    } finally {
      busyRef.current = false;
      abortRef.current = null;
    }
  }

  async function retrySave() {
    if (phase.name !== "save-failed" || !file || busyRef.current) return;
    busyRef.current = true;
    try {
      await save(phase.blobUrl, phase.uploadKey, file);
    } finally {
      busyRef.current = false;
    }
  }

  if (!configured) {
    return (
      <p className="text-meta rounded-md bg-subtle px-3 py-2.5">
        File uploads aren&apos;t set up in this environment yet. Connect a private Vercel Blob store and set
        <code className="mx-1 font-mono text-[11px]">BLOB_READ_WRITE_TOKEN</code>
        (see the README), then reload.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <input
          ref={inputRef}
          id={`file-${creativeId}`}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="peer sr-only"
          disabled={busy}
          onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
        />
        <label
          htmlFor={`file-${creativeId}`}
          className="flex cursor-pointer flex-col items-center gap-1.5 rounded-md border border-dashed border-line-strong bg-surface px-4 py-6 text-center transition-colors peer-focus-visible:ring-3 peer-focus-visible:ring-brand-100 peer-disabled:cursor-not-allowed peer-disabled:opacity-60 hover:border-brand-500 hover:bg-brand-50/40"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-brand-50 text-brand-700 [&_svg]:size-4">
            <UploadIcon />
          </span>
          <span className="text-card-title">
            {file ? file.name : first ? "Choose the creative file" : `Choose the file for V${nextVersion}`}
          </span>
          <span className="text-meta">
            {file
              ? formatBytes(file.size)
              : `Images: JPEG, PNG, WebP up to ${formatBytes(limits.imageBytes)} · Videos: MP4, WebM up to ${formatBytes(limits.videoBytes)}`}
          </span>
        </label>
        {fileError && (
          <p role="alert" className="mt-1.5 text-[12px] text-red-600">
            {fileError}
          </p>
        )}
      </div>

      <Field
        label={first ? "Notes for this version (optional)" : "What changed? (optional)"}
        hint={first ? undefined : (notesHint ?? "Shown to the client next to this version.")}
      >
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
          disabled={busy}
          className="min-h-20"
          placeholder={first ? "" : "For example: Brighter headline, updated price, shorter end card."}
        />
      </Field>

      {phase.name === "uploading" && (
        <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
          <div className="flex justify-between text-meta">
            <span>Uploading…</span>
            <span className="tabular-nums">{phase.percent}%</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-subtle"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={phase.percent}
            aria-label="Upload progress"
          >
            <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${phase.percent}%` }} />
          </div>
        </div>
      )}
      {phase.name === "saving" && (
        <p role="status" className="text-meta">
          Checking the file and saving V{nextVersion}…
        </p>
      )}
      {(phase.name === "failed" || phase.name === "save-failed") && <FormError message={phase.error} />}
      {phase.name === "done" && (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
          V{phase.versionNumber} uploaded.{" "}
          {doneHint ?? (isDraft ? "Share it when you're ready for the client to review." : "The client can review it now.")}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {phase.name === "uploading" && (
          <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
            Cancel
          </Button>
        )}
        {phase.name === "save-failed" ? (
          <Button onClick={retrySave}>Retry saving</Button>
        ) : (
          <Button onClick={start} disabled={!file || !!fileError || busy}>
            <UploadIcon />
            {busy ? "Uploading…" : phase.name === "failed" ? "Try again" : first ? "Upload file" : `Upload V${nextVersion}`}
          </Button>
        )}
      </div>
    </div>
  );
}

function uploadErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  // Server-side rejections come back with the message our route returned.
  if (/not configured|only the team|sign in|no longer exists|archived|unsupported/i.test(message)) {
    return message.replace(/^Vercel Blob:\s*/i, "");
  }
  if (/too large|file size|maximumSizeInBytes/i.test(message)) return "The file is larger than the allowed size.";
  if (/content type/i.test(message)) return "This file type isn't allowed.";
  return "The upload didn't finish. Check your connection and try again.";
}
