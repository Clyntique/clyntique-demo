import "server-only";
import type { EvidenceRecordCheckResult, EvidenceType } from "@/generated/prisma/enums";
import { EvidenceType as EvidenceTypes } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { Conflict, LIMITS, clean, currentRound, fail, guard, latestVersion, lockSubmission, run, validLink, type CommandResult } from "./commands";
import { EVIDENCE_RECORD_CHECK_RESULTS, parseValidUntil, recordOwnedBy, statusAfterCheck, teamMaySeeRecord } from "./evidence-records";
import { DENIAL_MESSAGE } from "./policy";

/*
 * Server-side commands for the Evidence Dictionary (Nov 2). Same contract as
 * the submission commands: the caller re-loads the user through the DAL,
 * every command authorizes before it writes, writes happen in one
 * transaction with the same row lock the evidence commands use, and the
 * acting user is recorded on every row.
 *
 * - CLIENT: creates records in their own dictionary and attaches them to
 *   their own submissions while those accept evidence (MANAGE_EVIDENCE).
 * - TEAM: creates Clyntique records, attaches them to a submission under
 *   review (ADD_REVIEWER_EVIDENCE), and checks records it can see.
 * Nothing here edits or deletes a record, an attachment or a check.
 */

const RECORD_NOT_FOUND = "This evidence record is no longer available.";

export type EvidenceRecordInput = {
  title: string;
  type: string;
  description?: string;
  source?: string;
  url?: string;
  claimText?: string;
  /** YYYY-MM-DD, or empty. */
  validUntil?: string;
};

function validateRecord(user: CurrentUser, input: EvidenceRecordInput) {
  const title = clean(input.title, LIMITS.name);
  const description = clean(input.description, LIMITS.text);
  const source = clean(input.source, LIMITS.name);
  const claimText = clean(input.claimText, LIMITS.finding);
  const type = Object.values(EvidenceTypes).find((t) => t === input.type) as EvidenceType | undefined;
  if (!title || title.length < 2) return fail("Give the record a title (2–120 characters).");
  if (!type) return fail("Choose the type of evidence.");
  // Policy references are Clyntique's own evidence type, never a client's.
  if (type === "POLICY_REFERENCE" && user.role !== "TEAM") return fail("Choose the type of evidence.");
  if (description === null) return fail(`Keep the description under ${LIMITS.text} characters.`);
  if (source === null) return fail(`Keep the source under ${LIMITS.name} characters.`);
  if (claimText === null) return fail(`Keep the claim under ${LIMITS.finding} characters.`);
  const link = validLink(String(input.url ?? "").trim());
  if (!link.ok) return fail("Enter a full web address starting with https://, or leave the link empty.");
  if (!description && !link.url && !source) return fail("Describe the evidence, name its source, or add a link.");
  const validUntil = parseValidUntil(input.validUntil);
  if (!validUntil.ok) return fail("Enter the validity date as YYYY-MM-DD, or leave it empty.");
  return { ok: true as const, data: { title, type, description: description || null, source: source || null, url: link.url, claimText: claimText || null, validUntil: validUntil.date } };
}

/**
 * Creates a reusable record. A client's record belongs to their own
 * workspace, whatever the browser sends; a team record is Clyntique's.
 */
export async function createEvidenceRecord(user: CurrentUser, input: EvidenceRecordInput): Promise<CommandResult<{ recordId: string }>> {
  const v = validateRecord(user, input);
  if (!v.ok) return v;
  return run("createEvidenceRecord", async () => {
    const record = await prisma.evidenceRecord.create({
      data: { ...v.data, ownerClientId: user.role === "CLIENT" ? user.id : null, createdById: user.id },
      select: { id: true },
    });
    return { ok: true as const, recordId: record.id };
  });
}

const RECORD_SELECT = {
  id: true,
  ownerClientId: true,
  title: true,
  type: true,
  description: true,
  source: true,
  url: true,
  claimText: true,
  status: true,
} as const;

export type AttachRecordInput = {
  recordId: string;
  creativeId: string;
  /** Findings in the open cycle the attachment supports (checked like addEvidence / addReviewerEvidence). */
  findingIds?: string[];
  /** TEAM only: SHARED or INTERNAL. */
  visibility?: string;
  /** Where the claim appears in this creative (optional, per attachment). */
  claimLocation?: string;
};

/**
 * Attaches a record to a creative as a new evidence item that copies the
 * record's text. A client attaches their own records to their own submission
 * while it accepts evidence; the team attaches Clyntique records to a
 * submission under review. The same record is never attached twice to the
 * same creative while an earlier attachment is active.
 */
export async function attachEvidenceRecord(user: CurrentUser, input: AttachRecordInput): Promise<CommandResult<{ evidenceId: string }>> {
  const recordId = String(input.recordId ?? "");
  const record = recordId ? await prisma.evidenceRecord.findUnique({ where: { id: recordId }, select: RECORD_SELECT }) : null;
  if (!record || !recordOwnedBy(user, record)) return fail(RECORD_NOT_FOUND);

  const claimLocation = clean(input.claimLocation, LIMITS.name);
  if (claimLocation === null) return fail(`Keep the claim location under ${LIMITS.name} characters.`);
  const findingIds = [...new Set((Array.isArray(input.findingIds) ? input.findingIds : []).map(String))];

  const g = await guard(user, user.role === "CLIENT" ? "MANAGE_EVIDENCE" : "ADD_REVIEWER_EVIDENCE", String(input.creativeId ?? ""));
  if (!g.ok) return g;

  const active = await prisma.evidence.count({ where: { creativeId: g.s.id, recordId: record.id, withdrawnAt: null } });
  if (active) return fail("This record is already attached to this submission.");

  const copy = { title: record.title, type: record.type, description: record.description, source: record.source, url: record.url, claimText: record.claimText, claimLocation: claimLocation || null, recordId: record.id };

  if (user.role === "CLIENT") {
    if (findingIds.length) {
      const current = await currentRound(g.s.id);
      const usable =
        current && !current.cycle.closedAt
          ? await prisma.finding.count({ where: { id: { in: findingIds }, creativeId: g.s.id, cycleId: current.cycle.id, status: { in: ["OPEN", "RESPONDED"] }, publishedAt: { not: null } } })
          : 0;
      if (usable !== findingIds.length) return fail("Some of those findings aren't open for responses.");
    }
    const version = await latestVersion(g.s.id);
    return run("attachEvidenceRecord", async () =>
      prisma.$transaction(async (tx) => {
        // The same guarded no-op as addEvidence: re-checks the status under the row lock without moving "updated".
        const { count } = await tx.creative.updateMany({
          where: { id: g.s.id, workflow: "SUBMISSION_REVIEW", status: g.s.status, project: { clientId: user.id } },
          data: { updatedAt: g.s.updatedAt },
        });
        if (!count) throw new Conflict(DENIAL_MESSAGE.INVALID_STATE);
        const evidence = await tx.evidence.create({
          data: { creativeId: g.s.id, ...copy, origin: "CLIENT_SUBMITTED", visibility: "SHARED", addedById: user.id, versionId: version?.id ?? null },
          select: { id: true },
        });
        if (findingIds.length) {
          await tx.findingEvidence.createMany({ data: findingIds.map((findingId) => ({ findingId, evidenceId: evidence.id, linkedById: user.id })) });
        }
        // No activity: like any client evidence, it reaches the team when the client (re)submits.
        return { ok: true as const, evidenceId: evidence.id };
      }),
    );
  }

  // TEAM: a Clyntique record on the version under review.
  const visibility = input.visibility === "SHARED" || input.visibility === "INTERNAL" ? input.visibility : null;
  if (!visibility) return fail("Choose whether the client will see it.");
  const current = await currentRound(g.s.id);
  if (!current?.round || current.cycle.closedAt) return fail(DENIAL_MESSAGE.INVALID_STATE);
  if (findingIds.length) {
    const usable = await prisma.finding.count({ where: { id: { in: findingIds }, creativeId: g.s.id, cycleId: current.cycle.id, status: { not: "DISMISSED" } } });
    if (usable !== findingIds.length) return fail("Some of those findings aren't part of this review.");
  }
  return run("attachEvidenceRecord", async () =>
    prisma.$transaction(async (tx) => {
      await lockSubmission(tx, g.s, "IN_REVIEW");
      const evidence = await tx.evidence.create({
        data: { creativeId: g.s.id, ...copy, origin: "REVIEWER_ADDED", visibility, addedById: user.id, versionId: current.round!.versionId },
        select: { id: true },
      });
      if (findingIds.length) {
        await tx.findingEvidence.createMany({ data: findingIds.map((findingId) => ({ findingId, evidenceId: evidence.id, linkedById: user.id })) });
      }
      // No activity: like draft findings, it reaches the client with the next decision.
      return { ok: true as const, evidenceId: evidence.id };
    }),
  );
}

/** The record with what the team-visibility rule needs. */
export async function loadRecordForTeam(recordId: string) {
  if (!recordId) return null;
  const record = await prisma.evidenceRecord.findUnique({
    where: { id: recordId },
    select: {
      id: true,
      ownerClientId: true,
      status: true,
      attachments: {
        select: {
          createdAt: true,
          withdrawnAt: true,
          creative: { select: { workflow: true, status: true, rounds: { orderBy: { submittedAt: "desc" }, take: 1, select: { submittedAt: true } } } },
        },
      },
    },
  });
  if (!record) return null;
  return {
    ...record,
    attachments: record.attachments.map((a) => ({
      createdAt: a.createdAt,
      withdrawnAt: a.withdrawnAt,
      creative: { workflow: a.creative.workflow, status: a.creative.status, lastSubmittedAt: a.creative.rounds[0]?.submittedAt ?? null },
    })),
  };
}

/**
 * TEAM records a check of a record it can see. Append-only: a new check
 * supersedes the previous one as the record's status; nothing is edited.
 * Anything short of accepted needs a note saying what is missing. The
 * client sees the check as "Clyntique reviewer" (decision D4).
 */
export async function checkEvidenceRecord(
  user: CurrentUser,
  input: { recordId: string; result: string; note?: string },
): Promise<CommandResult<{ checkId: string }>> {
  if (user.role !== "TEAM") return fail(DENIAL_MESSAGE.FORBIDDEN);
  const result = EVIDENCE_RECORD_CHECK_RESULTS.find((r) => r === input.result) as EvidenceRecordCheckResult | undefined;
  if (!result) return fail("Choose a check result.");
  const note = clean(input.note, LIMITS.note);
  if (note === null) return fail(`Keep the note under ${LIMITS.note} characters.`);
  if (result !== "ACCEPTED" && !note) return fail("Explain what is missing or why it isn't accepted, so the client knows what to provide.");

  const record = await loadRecordForTeam(String(input.recordId ?? ""));
  // A client's record the team hasn't received through a submission doesn't exist for the team.
  if (!record || !teamMaySeeRecord(record)) return fail(RECORD_NOT_FOUND);

  return run("checkEvidenceRecord", async () =>
    prisma.$transaction(async (tx) => {
      const check = await tx.evidenceRecordCheck.create({
        data: { recordId: record.id, reviewerId: user.id, result, note: note || null },
        select: { id: true },
      });
      await tx.evidenceRecord.update({ where: { id: record.id }, data: { status: statusAfterCheck(result) } });
      return { ok: true as const, checkId: check.id };
    }),
  );
}
