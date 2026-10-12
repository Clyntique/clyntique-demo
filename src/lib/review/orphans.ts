// Pure selection rule for abandoned uploads (used by prisma/blob-orphans.ts).
//
// A stored file is an orphan only when ALL of these hold:
// - it lives under a prefix this app writes to (creatives/ or evidence/),
// - no creative version AND no evidence row references its URL (withdrawn
//   evidence still references its file, so history is never touched),
// - it is older than the minimum age, so an upload that is still being saved
//   (or retried after a form error) is never picked.

export const ORPHAN_PREFIXES = ["creatives/", "evidence/"] as const;
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

export type StoredBlob = { url: string; pathname: string; size: number; uploadedAt: Date };

export function selectOrphans(blobs: StoredBlob[], referencedUrls: ReadonlySet<string>, nowMs: number, minAgeMs = ORPHAN_MIN_AGE_MS): StoredBlob[] {
  const cutoff = nowMs - minAgeMs;
  return blobs.filter(
    (b) =>
      ORPHAN_PREFIXES.some((p) => b.pathname.startsWith(p)) &&
      !referencedUrls.has(b.url) &&
      b.uploadedAt.getTime() < cutoff,
  );
}
