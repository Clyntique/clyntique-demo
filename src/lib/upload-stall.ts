// Browser uploads to Vercel Blob retry network errors for many minutes before
// failing, so a dropped connection looked like an upload stuck at "Uploading…".
// This guard gives up when no progress arrives for a while: it aborts the
// upload and rejects at once, so the form can say what happened.

export const UPLOAD_STALL_MS = 45_000;
export const UPLOAD_STALLED_MESSAGE = "The upload stopped making progress. Check your connection and try again.";

export class UploadStalledError extends Error {
  constructor() {
    super(UPLOAD_STALLED_MESSAGE);
    this.name = "UploadStalledError";
  }
}

/**
 * Runs `start` with an AbortSignal that also fires after `stallMs` without a
 * call to `progress()`. Resolves or rejects with the upload, or rejects with
 * UploadStalledError as soon as the upload stalls.
 */
export function withStallGuard<T>(
  controller: AbortController,
  start: (progress: () => void) => Promise<T>,
  stallMs = UPLOAD_STALL_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectStall: (error: Error) => void = () => {};
  const stalled = new Promise<never>((_, reject) => {
    rejectStall = reject;
  });
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      rejectStall(new UploadStalledError());
      controller.abort();
    }, stallMs);
  };
  arm();
  const upload = start(arm);
  // The upload's own rejection after a stall abort is expected; don't report it.
  upload.catch(() => {});
  return Promise.race([upload, stalled]).finally(() => clearTimeout(timer));
}
