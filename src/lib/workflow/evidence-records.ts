import type { EvidenceRecordCheckResult, EvidenceRecordStatus, Role } from "@/generated/prisma/enums";
import { submittedToTeam } from "./findings";

/*
 * Rules for the Evidence Dictionary (Nov 2). Pure functions, shared by the
 * commands, the loaders and the tests.
 *
 * A record belongs to one workspace: a client's (ownerClientId = that client)
 * or Clyntique's (ownerClientId null). Attaching a record to a creative creates
 * an ordinary Evidence row that copies the record's text and points back to
 * it, so every existing rule about evidence (submission, visibility,
 * withdrawal, assessment, finding links) applies to the attachment unchanged.
 */

export type RecordOwnership = { ownerClientId: string | null };

export type RecordAttachmentFact = {
  createdAt: Date;
  withdrawnAt: Date | null;
  creative: { workflow: string; status: string; lastSubmittedAt: Date | null };
};

/** A client sees only records of their own workspace; the team never acts as a client. */
export function recordOwnedBy(actor: { id: string; role: Role }, record: RecordOwnership): boolean {
  return actor.role === "CLIENT" ? record.ownerClientId === actor.id : record.ownerClientId === null;
}

/**
 * The team sees Clyntique's own records, and a client's record only once an
 * attachment of it reached the team through a submission: the attachment is
 * active (not withdrawn), on a submitted creative, and was added at or before
 * that creative's latest submission (the same rule as every other client work).
 */
export function teamMaySeeRecord(record: RecordOwnership & { attachments: RecordAttachmentFact[] }): boolean {
  if (record.ownerClientId === null) return true;
  return record.attachments.some(
    (a) =>
      a.withdrawnAt === null &&
      a.creative.workflow === "SUBMISSION_REVIEW" &&
      a.creative.status !== "DRAFT" &&
      submittedToTeam(a.createdAt, a.creative.lastSubmittedAt),
  );
}

/** Whether an attachment is one the team has received (see teamMaySeeRecord). */
export function attachmentReachedTeam(a: RecordAttachmentFact): boolean {
  return a.withdrawnAt === null && a.creative.workflow === "SUBMISSION_REVIEW" && a.creative.status !== "DRAFT" && submittedToTeam(a.createdAt, a.creative.lastSubmittedAt);
}

/** The record's status after a reviewer check: the latest check decides. */
export function statusAfterCheck(result: EvidenceRecordCheckResult): EvidenceRecordStatus {
  return result;
}

/** A record with a validity date in the past no longer supports a claim on its own. */
export function recordExpired(validUntil: Date | null, now = new Date()): boolean {
  return validUntil !== null && validUntil.getTime() < now.getTime();
}

export const EVIDENCE_RECORD_CHECK_RESULTS = ["ACCEPTED", "NEEDS_MORE_INFO", "NOT_ACCEPTED"] as const;

/**
 * Parses a validity date entered as YYYY-MM-DD (end of that day, UTC). Empty
 * means "not stated"; anything else must be a real calendar date.
 */
export function parseValidUntil(value: unknown): { ok: true; date: Date | null } | { ok: false } {
  const text = String(value ?? "").trim();
  if (!text) return { ok: true, date: null };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return { ok: false };
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999));
  if (Number.isNaN(date.getTime()) || date.getUTCMonth() !== Number(m[2]) - 1 || date.getUTCDate() !== Number(m[3])) return { ok: false };
  return { ok: true, date };
}

/** Wording that must never describe an internal check (guarded by tests). */
export const EVIDENCE_RECORD_FORBIDDEN_WORDS = ["legally compliant", "government approved", "certified compliant", "platform approved", "verified by law", "legal certification"];
