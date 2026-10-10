import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { CreativeFormat, EvidenceType, FindingAction, FindingSeverity, ReviewOutcome } from "@/generated/prisma/enums";
import { CreativeFormat as CreativeFormats, EvidenceType as EvidenceTypes, FindingAction as FindingActions, FindingSeverity as Severities, ReviewOutcome as Outcomes } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { EVIDENCE_MAX_BYTES, evidenceKindFor, evidencePathMatches } from "@/lib/evidence-files";
import { UPLOAD_KEY_PATTERN } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { contentMatches, deleteUnreferencedBlob, headBlob, isPrivateBlobUrl } from "@/lib/review/blob";
import { canRequestChanges, checkOutcome, evidenceIsFinal, moveFinding, type FindingMove } from "./findings";
import { loadReadiness } from "./readiness";
import { DENIAL_MESSAGE, authorize, canCreateSubmission, type SubmissionAction, type SubmissionFacts } from "./policy";
import { SUBMIT_GAP_MESSAGE, submitGaps } from "./submission";
import { checkDecisionTarget, transition, type WorkflowAction } from "./transitions";

/*
 * Server-side commands for the submission-review workflow (M2).
 *
 * Every command:
 * 1. takes the signed-in user (re-loaded from the DB by the caller via the DAL),
 * 2. loads the submission and asks policy.ts whether this user may do this,
 * 3. validates the transition (transitions.ts) and its guards (findings.ts),
 * 4. writes in one transaction with a conditional status update, so stale
 *    pages, double submits and concurrent reviewers match zero rows,
 * 5. records the acting user on every row it creates (reviewer identity).
 *
 * Called by the form actions in src/app/dashboard/submissions/actions.ts
 * (client) and src/app/admin/review/actions.ts (team).
 */

export type CommandResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });

class Conflict extends Error {}

const LIMITS = { name: 120, description: 1000, context: 2000, finding: 300, text: 4000, note: 2000 };

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function clean(value: unknown, max: number) {
  const text = String(value ?? "").trim();
  return text.length > max ? null : text;
}

async function loadFacts(creativeId: string) {
  if (!creativeId || typeof creativeId !== "string") return null;
  const row = await prisma.creative.findUnique({
    where: { id: creativeId },
    select: { id: true, name: true, workflow: true, status: true, projectId: true, project: { select: { clientId: true } } },
  });
  if (!row) return null;
  const facts: SubmissionFacts = { id: row.id, workflow: row.workflow, status: row.status, projectClientId: row.project.clientId };
  return { ...facts, name: row.name, projectId: row.projectId };
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadFacts>>>;

/** Loads the submission and authorizes the action. Missing and forbidden look the same to the user. */
async function guard(user: CurrentUser, action: SubmissionAction, creativeId: string): Promise<CommandResult<{ s: Loaded }>> {
  const s = await loadFacts(creativeId);
  if (!s) return fail(DENIAL_MESSAGE.NOT_FOUND);
  const decision = authorize(user, action, s);
  if (!decision.ok) return fail(DENIAL_MESSAGE[decision.reason]);
  return { ok: true, s };
}

function checkTransition(action: WorkflowAction, s: Loaded, user: CurrentUser) {
  const t = transition(action, s.status, user.role);
  return t.ok ? null : t.error;
}

async function validCodes(kind: "market" | "platform", codes: string[]) {
  const unique = [...new Set(codes.map(String))];
  if (!unique.length) return { ok: true as const, codes: [] as string[] };
  const rows =
    kind === "market"
      ? await prisma.market.findMany({ where: { code: { in: unique }, active: true }, select: { code: true } })
      : await prisma.adPlatform.findMany({ where: { code: { in: unique }, active: true }, select: { code: true } });
  return rows.length === unique.length ? { ok: true as const, codes: unique } : { ok: false as const };
}

async function latestVersion(creativeId: string) {
  return prisma.creativeVersion.findFirst({
    where: { creativeId },
    orderBy: { versionNumber: "desc" },
    select: { id: true, versionNumber: true },
  });
}

/** The open cycle and its newest round. */
async function currentRound(creativeId: string) {
  const cycle = await prisma.reviewCycle.findFirst({
    where: { creativeId },
    orderBy: { number: "desc" },
    select: { id: true, number: true, closedAt: true },
  });
  if (!cycle) return null;
  const round = await prisma.submissionRound.findFirst({
    where: { cycleId: cycle.id },
    orderBy: { number: "desc" },
    select: { id: true, number: true, versionId: true, decisions: { select: { id: true } } },
  });
  return { cycle, round };
}

function activity(tx: Prisma.TransactionClient, s: Loaded, user: CurrentUser, type: Prisma.ActivityCreateInput["type"], message: string) {
  return tx.activity.create({ data: { projectId: s.projectId, creativeId: s.id, userId: user.id, type, message } });
}

async function run<T>(label: string, fn: () => Promise<CommandResult<T>>): Promise<CommandResult<T>> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Conflict) return fail(error.message);
    if (isUniqueViolation(error)) return fail("This was already recorded. Refresh to see the latest state.");
    console.error(`${label} failed`, error instanceof Error ? error.name : "unknown error");
    return fail("Something went wrong. Please try again.");
  }
}

// ---------------------------------------------------------------------------
// CLIENT: drafts, submission, responses

export type DraftInput = {
  projectId: string;
  name: string;
  description?: string;
  context?: string;
  format: string;
  marketCodes?: string[];
  platformCodes?: string[];
};

function validateDraft(input: Omit<DraftInput, "projectId">) {
  const name = clean(input.name, LIMITS.name);
  const description = clean(input.description, LIMITS.description);
  const context = clean(input.context, LIMITS.context);
  const format = Object.values(CreativeFormats).find((f) => f === input.format) as CreativeFormat | undefined;
  if (!name || name.length < 2) return fail("Enter a title (2–120 characters).");
  if (description === null) return fail(`Keep the description under ${LIMITS.description} characters.`);
  if (context === null) return fail(`Keep the campaign context under ${LIMITS.context} characters.`);
  if (!format) return fail("Choose the creative type.");
  return { ok: true as const, data: { name, description: description || null, context: context || null, format } };
}

/** CLIENT creates a draft submission in a project assigned to them. */
export async function createDraft(user: CurrentUser, input: DraftInput): Promise<CommandResult<{ creativeId: string }>> {
  const project = input.projectId
    ? await prisma.project.findUnique({ where: { id: String(input.projectId) }, select: { id: true, clientId: true } })
    : null;
  const allowed = project ? canCreateSubmission(user, project) : ({ ok: false, reason: "NOT_FOUND" } as const);
  // Missing and other clients' projects look the same.
  if (!project || !allowed.ok) {
    return fail(!allowed.ok && allowed.reason === "FORBIDDEN" ? "Only the client assigned to a project can create submissions in it." : "This project isn't available.");
  }

  const valid = validateDraft(input);
  if (!valid.ok) return valid;
  const markets = await validCodes("market", input.marketCodes ?? []);
  const platforms = await validCodes("platform", input.platformCodes ?? []);
  if (!markets.ok || !platforms.ok) return fail("Choose markets and platforms from the list.");

  return run("createDraft", async () => {
    const created = await prisma.creative.create({
      data: {
        ...valid.data,
        projectId: project.id,
        status: "DRAFT",
        workflow: "SUBMISSION_REVIEW", // explicit, never left to the default
        createdById: user.id,
        markets: { create: markets.codes.map((marketCode) => ({ marketCode })) },
        platforms: { create: platforms.codes.map((platformCode) => ({ platformCode })) },
      },
      select: { id: true },
    });
    // Drafts are private: no activity entry until the client submits.
    return { ok: true, creativeId: created.id };
  });
}

/**
 * CLIENT edits their draft (or a submission sent back for changes). Markets
 * and platforms can change only while it is a DRAFT, so the review context of
 * an already-submitted round never changes underneath it.
 */
export async function updateDraft(user: CurrentUser, creativeId: string, input: Omit<DraftInput, "projectId">): Promise<CommandResult> {
  const g = await guard(user, "EDIT_DRAFT", creativeId);
  if (!g.ok) return g;
  const valid = validateDraft(input);
  if (!valid.ok) return valid;
  const isDraft = g.s.status === "DRAFT";
  const targeting = input.marketCodes !== undefined || input.platformCodes !== undefined;
  if (targeting && !isDraft) return fail("Markets and platforms can't be changed after submission.");
  const markets = await validCodes("market", input.marketCodes ?? []);
  const platforms = await validCodes("platform", input.platformCodes ?? []);
  if (!markets.ok || !platforms.ok) return fail("Choose markets and platforms from the list.");

  return run("updateDraft", async () =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.creative.updateMany({
        where: { id: g.s.id, workflow: "SUBMISSION_REVIEW", status: g.s.status, project: { clientId: user.id } },
        data: valid.data,
      });
      if (!count) throw new Conflict(DENIAL_MESSAGE.INVALID_STATE);
      if (targeting) {
        // Draft-only selection state (never part of a submitted round).
        await tx.submissionMarket.deleteMany({ where: { creativeId: g.s.id } });
        await tx.submissionPlatform.deleteMany({ where: { creativeId: g.s.id } });
        if (markets.codes.length) await tx.submissionMarket.createMany({ data: markets.codes.map((marketCode) => ({ creativeId: g.s.id, marketCode })) });
        if (platforms.codes.length) await tx.submissionPlatform.createMany({ data: platforms.codes.map((platformCode) => ({ creativeId: g.s.id, platformCode })) });
      }
      return { ok: true as const };
    }),
  );
}

/** CLIENT submits a draft: opens review cycle 1 and round 1 on the newest version. */
export async function submitForReview(user: CurrentUser, creativeId: string): Promise<CommandResult<{ roundId: string }>> {
  const g = await guard(user, "SUBMIT", creativeId);
  if (!g.ok) return g;
  const bad = checkTransition("SUBMIT", g.s, user);
  if (bad) return fail(bad);
  // Drafts may be incomplete; a submission needs a file, a target market and a platform.
  const [version, marketCount, platformCount] = await Promise.all([
    latestVersion(g.s.id),
    prisma.submissionMarket.count({ where: { creativeId: g.s.id, market: { active: true } } }),
    prisma.submissionPlatform.count({ where: { creativeId: g.s.id, platform: { active: true } } }),
  ]);
  const gaps = submitGaps({ versionCount: version ? 1 : 0, marketCount, platformCount });
  if (gaps.length || !version) return fail(`Before submitting: ${gaps.map((gap) => SUBMIT_GAP_MESSAGE[gap]).join(" ")}`);

  return run("submitForReview", async () =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.creative.updateMany({
        where: { id: g.s.id, workflow: "SUBMISSION_REVIEW", status: "DRAFT", project: { clientId: user.id } },
        data: { status: "SUBMITTED", submittedAt: new Date() },
      });
      if (!count) throw new Conflict(DENIAL_MESSAGE.INVALID_STATE);
      const cycle = await tx.reviewCycle.create({ data: { creativeId: g.s.id, number: 1, openedById: user.id }, select: { id: true } });
      const round = await tx.submissionRound.create({
        data: { creativeId: g.s.id, cycleId: cycle.id, number: 1, versionId: version.id, submittedById: user.id },
        select: { id: true },
      });
      await activity(tx, g.s, user, "SUBMISSION_SUBMITTED", `Submitted “${g.s.name}” for review (V${version.versionNumber})`);
      return { ok: true as const, roundId: round.id };
    }),
  );
}

/** CLIENT responds to a published finding, optionally pointing at a revision and linking evidence. */
export async function respondToFinding(
  user: CurrentUser,
  input: { findingId: string; message: string; versionId?: string; evidenceIds?: string[] },
): Promise<CommandResult> {
  const finding = await prisma.finding.findUnique({
    where: { id: String(input.findingId ?? "") },
    select: { id: true, creativeId: true, cycleId: true, status: true, publishedAt: true },
  });
  if (!finding) return fail("This finding is no longer available.");
  const g = await guard(user, "RESPOND_TO_FINDING", finding.creativeId);
  if (!g.ok) return g;
  // Clients can only ever act on findings they can see, in the open review cycle.
  if (finding.status === "DRAFT" || !finding.publishedAt) return fail("This finding is no longer available.");

  const message = clean(input.message, LIMITS.text);
  const move = moveFinding("RESPOND", finding.status, user.role, message);
  if (!move.ok) return fail(move.error);

  const version = input.versionId
    ? await prisma.creativeVersion.findFirst({ where: { id: String(input.versionId), creativeId: g.s.id }, select: { id: true } })
    : null;
  if (input.versionId && !version) return fail("That version doesn't belong to this submission.");

  const evidenceIds = [...new Set((Array.isArray(input.evidenceIds) ? input.evidenceIds : []).map(String))];
  if (evidenceIds.length) {
    const usable = await prisma.evidence.count({
      where: { id: { in: evidenceIds }, creativeId: g.s.id, visibility: "SHARED", withdrawnAt: null },
    });
    if (usable !== evidenceIds.length) return fail("Some of that evidence isn't available for this submission.");
  }

  const current = await currentRound(g.s.id);
  if (current && (current.cycle.id !== finding.cycleId || current.cycle.closedAt)) return fail("This finding belongs to an earlier, closed review.");

  return run("respondToFinding", async () =>
    prisma.$transaction(async (tx) => {
      await tx.findingResponse.create({
        data: { findingId: finding.id, authorId: user.id, message: message!, versionId: version?.id ?? null, roundId: current?.round?.id ?? null },
      });
      for (const evidenceId of evidenceIds) {
        await tx.findingEvidence.upsert({
          where: { findingId_evidenceId: { findingId: finding.id, evidenceId } },
          create: { findingId: finding.id, evidenceId, linkedById: user.id },
          update: {},
        });
      }
      if (finding.status !== "RESPONDED") {
        const { count } = await tx.finding.updateMany({ where: { id: finding.id, status: finding.status }, data: { status: "RESPONDED" } });
        if (!count) throw new Conflict("This finding changed while you were responding. Refresh and try again.");
        await tx.findingEvent.create({ data: { findingId: finding.id, fromStatus: finding.status, toStatus: "RESPONDED", actorId: user.id } });
      }
      return { ok: true as const };
    }),
  );
}

/** CLIENT resubmits after changes were requested: a new round in the same cycle, on the newest version. */
export async function resubmit(user: CurrentUser, creativeId: string, note?: string): Promise<CommandResult<{ roundId: string }>> {
  const g = await guard(user, "RESUBMIT", creativeId);
  if (!g.ok) return g;
  const bad = checkTransition("RESUBMIT", g.s, user);
  if (bad) return fail(bad);
  const cleanNote = clean(note, LIMITS.note);
  if (cleanNote === null) return fail(`Keep the note under ${LIMITS.note} characters.`);

  const [version, current] = await Promise.all([latestVersion(g.s.id), currentRound(g.s.id)]);
  if (!version || !current?.round || current.cycle.closedAt) return fail(DENIAL_MESSAGE.INVALID_STATE);

  const { gaps } = await loadReadiness(g.s.id, current.cycle.id);
  if (gaps.length) return fail(`Address every open finding before resubmitting (${gaps.length} item${gaps.length === 1 ? "" : "s"} outstanding).`);

  return run("resubmit", async () =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.creative.updateMany({
        where: { id: g.s.id, workflow: "SUBMISSION_REVIEW", status: "CHANGES_REQUESTED", project: { clientId: user.id } },
        data: { status: "SUBMITTED" },
      });
      if (!count) throw new Conflict(DENIAL_MESSAGE.INVALID_STATE);
      const round = await tx.submissionRound.create({
        data: {
          creativeId: g.s.id,
          cycleId: current.cycle.id,
          number: current.round!.number + 1, // unique (cycleId, number) rejects a concurrent duplicate
          versionId: version.id,
          submittedById: user.id,
          note: cleanNote || null,
        },
        select: { id: true },
      });
      await activity(tx, g.s, user, "RESUBMITTED", `Resubmitted “${g.s.name}” (V${version.versionNumber}, round ${current.round!.number + 1})`);
      return { ok: true as const, roundId: round.id };
    }),
  );
}

// ---------------------------------------------------------------------------
// CLIENT: supporting evidence

export type EvidenceInput = {
  creativeId: string;
  title: string;
  type: string;
  description?: string;
  source?: string;
  url?: string;
  /** An uploaded file (private Blob), verified here before it is recorded. */
  file?: { uploadKey: string; url: string; fileName: string } | null;
  /** Published findings in the open cycle this evidence supports. */
  findingIds?: string[];
};

function validLink(value: string) {
  if (!value) return { ok: true as const, url: null };
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false as const };
    return { ok: true as const, url: url.toString() };
  } catch {
    return { ok: false as const };
  }
}

/**
 * CLIENT adds supporting evidence to their own submission (draft, or while
 * changes are requested). Always client-submitted and shared with the team.
 * An attached file must be the exact upload the server issued a token for,
 * within the size limit, and really of its declared type; otherwise it is
 * deleted and nothing is recorded.
 */
export async function addEvidence(user: CurrentUser, input: EvidenceInput): Promise<CommandResult<{ evidenceId: string }>> {
  const g = await guard(user, "MANAGE_EVIDENCE", String(input.creativeId ?? ""));
  if (!g.ok) return g;

  const title = clean(input.title, LIMITS.name);
  const description = clean(input.description, LIMITS.text);
  const source = clean(input.source, LIMITS.name);
  const type = Object.values(EvidenceTypes).find((t) => t === input.type) as EvidenceType | undefined;
  if (!title || title.length < 2) return fail("Give the evidence a title (2–120 characters).");
  if (!type) return fail("Choose the type of evidence.");
  if (description === null) return fail(`Keep the description under ${LIMITS.text} characters.`);
  if (source === null) return fail(`Keep the source under ${LIMITS.name} characters.`);
  const link = validLink(String(input.url ?? "").trim());
  if (!link.ok) return fail("Enter a full web address starting with https://, or leave the link empty.");
  if (!input.file && !link.url && !description) return fail("Attach a file, add a link, or describe the evidence.");

  // Findings it supports: published, in the open cycle, still open for a response.
  const findingIds = [...new Set((Array.isArray(input.findingIds) ? input.findingIds : []).map(String))];
  if (findingIds.length) {
    const current = await currentRound(g.s.id);
    const usable =
      current && !current.cycle.closedAt
        ? await prisma.finding.count({
            where: {
              id: { in: findingIds },
              creativeId: g.s.id,
              cycleId: current.cycle.id,
              status: { in: ["OPEN", "RESPONDED"] },
              publishedAt: { not: null },
            },
          })
        : 0;
    if (usable !== findingIds.length) return fail("Some of those findings aren't open for responses.");
  }

  let file: { url: string; name: string; mimeType: string; size: number } | null = null;
  if (input.file) {
    if (typeof input.file !== "object") return fail("This upload couldn't be verified. Please upload the file again.");
    const checked = await verifyEvidenceUpload(g.s.id, input.file);
    if (!checked.ok) return checked;
    if (checked.existingId) return { ok: true, evidenceId: checked.existingId }; // retry of an upload already recorded
    file = checked.file;
  }

  const version = await latestVersion(g.s.id);

  return run("addEvidence", async () =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.creative.updateMany({
        where: { id: g.s.id, workflow: "SUBMISSION_REVIEW", status: g.s.status, project: { clientId: user.id } },
        data: { updatedAt: new Date() },
      });
      if (!count) throw new Conflict(DENIAL_MESSAGE.INVALID_STATE);
      const evidence = await tx.evidence.create({
        data: {
          creativeId: g.s.id,
          title,
          type,
          description: description || null,
          source: source || null,
          url: link.url,
          origin: "CLIENT_SUBMITTED",
          visibility: "SHARED",
          addedById: user.id,
          versionId: version?.id ?? null,
          fileUrl: file?.url ?? null,
          fileName: file?.name ?? null,
          mimeType: file?.mimeType ?? null,
          fileSize: file?.size ?? null,
        },
        select: { id: true },
      });
      if (findingIds.length) {
        await tx.findingEvidence.createMany({ data: findingIds.map((findingId) => ({ findingId, evidenceId: evidence.id, linkedById: user.id })) });
      }
      // Drafts are private: activity only once the team can see the submission.
      if (g.s.status !== "DRAFT") await activity(tx, g.s, user, "EVIDENCE_SUBMITTED", `Evidence added to “${g.s.name}”: ${title}`);
      return { ok: true as const, evidenceId: evidence.id };
    }),
  );
}

type VerifiedFile = { url: string; name: string; mimeType: string; size: number };

async function verifyEvidenceUpload(
  creativeId: string,
  input: { uploadKey: string; url: string; fileName: string },
): Promise<CommandResult<{ existingId: string | null; file: VerifiedFile }>> {
  const unverified = fail("This upload couldn't be verified. Please upload the file again.");
  const uploadKey = String(input.uploadKey ?? "");
  const url = String(input.url ?? "");
  const name = String(input.fileName ?? "").trim().slice(0, 200);
  const kind = evidenceKindFor(name);
  if (!UPLOAD_KEY_PATTERN.test(uploadKey) || !kind || !isPrivateBlobUrl(url)) return unverified;

  const existing = await prisma.evidence.findFirst({ where: { creativeId, fileUrl: url }, select: { id: true } });
  if (existing) return { ok: true, existingId: existing.id, file: { url, name, mimeType: kind.mimeType, size: 0 } };

  const blob = await headBlob(url);
  if (!blob) return fail("The uploaded file couldn't be found. Please try again.");
  // Only the exact path /api/evidence/upload issued for this submission.
  if (!evidencePathMatches(blob.pathname, creativeId, uploadKey, kind.extension)) return unverified;

  let problem: string | null = null;
  if (blob.size <= 0 || blob.size > EVIDENCE_MAX_BYTES) problem = "Evidence files can be up to 10 MB.";
  else if (blob.contentType !== kind.mimeType || !(await contentMatches(url, kind.mimeType).catch(() => false))) {
    problem = `This file isn't a valid ${kind.label} file.`;
  }
  if (problem) {
    await deleteUnreferencedBlob(url);
    return fail(problem);
  }
  return { ok: true, existingId: null, file: { url, name, mimeType: kind.mimeType, size: blob.size } };
}

/**
 * CLIENT withdraws evidence they added. Withdrawal is recorded, never a
 * delete, and only evidence not yet part of a submitted round can be
 * withdrawn: anything the team has already received stays as it was.
 */
export async function withdrawEvidence(user: CurrentUser, evidenceId: string): Promise<CommandResult> {
  const evidence = evidenceId
    ? await prisma.evidence.findUnique({
        where: { id: String(evidenceId) },
        select: { id: true, creativeId: true, title: true, origin: true, addedById: true, withdrawnAt: true, createdAt: true },
      })
    : null;
  if (!evidence) return fail("This evidence is no longer available.");
  const g = await guard(user, "MANAGE_EVIDENCE", evidence.creativeId);
  if (!g.ok) return g;
  if (evidence.origin !== "CLIENT_SUBMITTED" || evidence.addedById !== user.id) return fail("You can only withdraw evidence you added.");
  if (evidence.withdrawnAt) return fail("This evidence was already withdrawn.");

  const lastRound = await prisma.submissionRound.findFirst({
    where: { creativeId: g.s.id },
    orderBy: { submittedAt: "desc" },
    select: { submittedAt: true },
  });
  if (evidenceIsFinal(evidence, lastRound?.submittedAt ?? null)) {
    return fail("This evidence was part of an earlier submission, so it stays in the record. Add new evidence instead.");
  }

  return run("withdrawEvidence", async () =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.evidence.updateMany({
        where: { id: evidence.id, withdrawnAt: null, addedById: user.id, creative: { status: g.s.status } },
        data: { withdrawnAt: new Date(), withdrawnById: user.id },
      });
      if (!count) throw new Conflict("This evidence changed meanwhile. Refresh and try again.");
      if (g.s.status !== "DRAFT") await activity(tx, g.s, user, "OTHER", `Evidence withdrawn from “${g.s.name}”: ${evidence.title}`);
      return { ok: true as const };
    }),
  );
}

// ---------------------------------------------------------------------------
// TEAM: review

/** TEAM starts reviewing a submitted round. */
export async function startReview(user: CurrentUser, creativeId: string): Promise<CommandResult> {
  const g = await guard(user, "START_REVIEW", creativeId);
  if (!g.ok) return g;
  const bad = checkTransition("START_REVIEW", g.s, user);
  if (bad) return fail(bad);

  return run("startReview", async () =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.creative.updateMany({
        where: { id: g.s.id, workflow: "SUBMISSION_REVIEW", status: "SUBMITTED" },
        data: { status: "IN_REVIEW" },
      });
      if (!count) throw new Conflict("Another reviewer has already started this review.");
      await activity(tx, g.s, user, "REVIEW_STARTED", `Review started for “${g.s.name}”`);
      return { ok: true as const };
    }),
  );
}

export type FindingInput = {
  creativeId: string;
  issue: string;
  explanation: string;
  severity: string;
  requiredAction: string;
  actionDetails: string;
  marketCodes?: string[];
  platformCodes?: string[];
};

async function validateFinding(input: Omit<FindingInput, "creativeId">) {
  const issue = clean(input.issue, LIMITS.finding);
  const explanation = clean(input.explanation, LIMITS.text);
  const actionDetails = clean(input.actionDetails, LIMITS.text);
  const severity = Object.values(Severities).find((v) => v === input.severity) as FindingSeverity | undefined;
  const requiredAction = Object.values(FindingActions).find((v) => v === input.requiredAction) as FindingAction | undefined;
  if (issue === null) return fail(`Keep the issue under ${LIMITS.finding} characters.`);
  if (!issue || issue.length < 3) return fail("Describe the issue.");
  if (explanation === null || actionDetails === null) return fail(`Keep each field under ${LIMITS.text} characters.`);
  if (!explanation) return fail("Explain why this is an issue.");
  if (!severity) return fail("Choose a severity.");
  if (!requiredAction) return fail("Choose the required client action.");
  if (!actionDetails) return fail("Say exactly what the client needs to do.");
  const markets = await validCodes("market", input.marketCodes ?? []);
  const platforms = await validCodes("platform", input.platformCodes ?? []);
  if (!markets.ok || !platforms.ok) return fail("Choose markets and platforms from the list.");
  return { ok: true as const, data: { issue, explanation, actionDetails, severity, requiredAction }, markets: markets.codes, platforms: platforms.codes };
}

/** TEAM records a DRAFT finding (team-only until published) on the version under review. */
export async function recordFinding(user: CurrentUser, input: FindingInput): Promise<CommandResult<{ findingId: string }>> {
  const g = await guard(user, "RECORD_FINDING", input.creativeId);
  if (!g.ok) return g;
  const valid = await validateFinding(input);
  if (!valid.ok) return valid;
  const { issue, explanation, actionDetails, severity, requiredAction } = valid.data;
  const markets = { codes: valid.markets };
  const platforms = { codes: valid.platforms };

  const current = await currentRound(g.s.id);
  if (!current?.round || current.cycle.closedAt) return fail(DENIAL_MESSAGE.INVALID_STATE);

  return run("recordFinding", async () =>
    prisma.$transaction(async (tx) => {
      const finding = await tx.finding.create({
        data: {
          creativeId: g.s.id,
          cycleId: current.cycle.id,
          versionId: current.round!.versionId,
          createdById: user.id,
          issue,
          explanation,
          severity,
          requiredAction,
          actionDetails,
          status: "DRAFT",
          markets: { create: markets.codes.map((marketCode) => ({ marketCode })) },
          platforms: { create: platforms.codes.map((platformCode) => ({ platformCode })) },
        },
        select: { id: true },
      });
      await tx.findingEvent.create({ data: { findingId: finding.id, fromStatus: null, toStatus: "DRAFT", actorId: user.id } });
      // No activity: draft findings are internal.
      return { ok: true as const, findingId: finding.id };
    }),
  );
}

/**
 * TEAM edits a finding while it is still a DRAFT (never seen by the client).
 * Published findings can't be edited; their history lives in FindingEvent.
 */
export async function updateDraftFinding(
  user: CurrentUser,
  input: Omit<FindingInput, "creativeId"> & { findingId: string },
): Promise<CommandResult> {
  const finding = await prisma.finding.findUnique({
    where: { id: String(input.findingId ?? "") },
    select: { id: true, creativeId: true, status: true },
  });
  if (!finding) return fail("This finding is no longer available.");
  const g = await guard(user, "RECORD_FINDING", finding.creativeId);
  if (!g.ok) return g;
  if (finding.status !== "DRAFT") return fail("Only draft findings can be edited. This one has already been shared with the client.");
  const valid = await validateFinding(input);
  if (!valid.ok) return valid;

  return run("updateDraftFinding", async () =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.finding.updateMany({ where: { id: finding.id, status: "DRAFT" }, data: valid.data });
      if (!count) throw new Conflict("This finding changed meanwhile. Refresh and try again.");
      await tx.findingMarket.deleteMany({ where: { findingId: finding.id } });
      await tx.findingPlatform.deleteMany({ where: { findingId: finding.id } });
      if (valid.markets.length) await tx.findingMarket.createMany({ data: valid.markets.map((marketCode) => ({ findingId: finding.id, marketCode })) });
      if (valid.platforms.length) await tx.findingPlatform.createMany({ data: valid.platforms.map((platformCode) => ({ findingId: finding.id, platformCode })) });
      await tx.findingEvent.create({ data: { findingId: finding.id, fromStatus: "DRAFT", toStatus: "DRAFT", actorId: user.id, note: "Edited" } });
      return { ok: true as const };
    }),
  );
}

/**
 * TEAM dismisses, resolves or reopens a finding during review. Findings are
 * never published one by one: they reach the client only through
 * requestChanges or completeReview.
 */
export async function reviewFinding(
  user: CurrentUser,
  input: { findingId: string; move: Extract<FindingMove, "DISMISS" | "RESOLVE" | "REOPEN">; note?: string },
): Promise<CommandResult> {
  const finding = await prisma.finding.findUnique({
    where: { id: String(input.findingId ?? "") },
    select: { id: true, creativeId: true, status: true },
  });
  if (!finding) return fail("This finding is no longer available.");
  const moves = { RESOLVE: "RESOLVE_FINDING", REOPEN: "REOPEN_FINDING", DISMISS: "DISMISS_FINDING" } as const;
  const action: SubmissionAction | undefined = moves[input.move as keyof typeof moves];
  if (!action) return fail("This action isn't available.");
  const g = await guard(user, action, finding.creativeId);
  if (!g.ok) return g;

  const note = clean(input.note, LIMITS.note);
  if (note === null) return fail(`Keep the note under ${LIMITS.note} characters.`);
  const move = moveFinding(input.move, finding.status, user.role, note);
  if (!move.ok) return fail(move.error);
  const current = input.move === "RESOLVE" ? await currentRound(g.s.id) : null;

  return run("reviewFinding", async () =>
    prisma.$transaction(async (tx) => {
      const now = new Date();
      const { count } = await tx.finding.updateMany({
        where: { id: finding.id, status: finding.status },
        data: {
          status: move.to,
          ...(input.move === "RESOLVE"
            ? { resolvedById: user.id, resolvedAt: now, resolutionNote: note, resolvedInVersionId: current?.round?.versionId ?? null }
            : {}),
        },
      });
      if (!count) throw new Conflict("This finding changed meanwhile. Refresh and try again.");
      await tx.findingEvent.create({ data: { findingId: finding.id, fromStatus: finding.status, toStatus: move.to, actorId: user.id, note: note || null } });
      return { ok: true as const };
    }),
  );
}

/** Publishes DRAFT findings (DRAFT -> OPEN) with history and one activity entry. */
async function publishDrafts(tx: Prisma.TransactionClient, s: Loaded, user: CurrentUser, drafts: string[]) {
  if (!drafts.length) return;
  const { count } = await tx.finding.updateMany({ where: { id: { in: drafts }, status: "DRAFT" }, data: { status: "OPEN", publishedAt: new Date() } });
  if (count !== drafts.length) throw new Conflict("Findings changed while you were reviewing. Refresh and try again.");
  await tx.findingEvent.createMany({ data: drafts.map((findingId) => ({ findingId, fromStatus: "DRAFT" as const, toStatus: "OPEN" as const, actorId: user.id })) });
  await activity(tx, s, user, "FINDING_RECORDED", `${drafts.length} finding${drafts.length === 1 ? "" : "s"} shared on “${s.name}”`);
}

async function decisionContext(creativeId: string, requested: { roundId: string; versionId: string }) {
  const [current, version] = await Promise.all([currentRound(creativeId), latestVersion(creativeId)]);
  if (!current) return { ok: false as const, error: DENIAL_MESSAGE.INVALID_STATE };
  const check = checkDecisionTarget(
    {
      cycle: current.cycle,
      latestRound: current.round ? { id: current.round.id, versionId: current.round.versionId } : null,
      latestVersionId: version?.id ?? null,
      roundHasDecision: Boolean(current.round?.decisions.length),
    },
    requested,
  );
  if (!check.ok) return check;
  return { ok: true as const, cycleId: current.cycle.id, versionNumber: version!.versionNumber };
}

/** TEAM requests changes on the round under review: publishes draft findings and records the interim decision. */
export async function requestChanges(
  user: CurrentUser,
  input: { creativeId: string; roundId: string; versionId: string; summary: string },
): Promise<CommandResult> {
  const g = await guard(user, "REQUEST_CHANGES", input.creativeId);
  if (!g.ok) return g;
  const bad = checkTransition("REQUEST_CHANGES", g.s, user);
  if (bad) return fail(bad);
  const summary = clean(input.summary, LIMITS.text);
  if (!summary) return fail("Summarise what the client needs to change.");
  const requested = { roundId: String(input.roundId ?? ""), versionId: String(input.versionId ?? "") };
  const ctx = await decisionContext(g.s.id, requested);
  if (!ctx.ok) return fail(ctx.error);

  const findings = await prisma.finding.findMany({ where: { cycleId: ctx.cycleId }, select: { id: true, status: true, severity: true } });
  const can = canRequestChanges(findings);
  if (!can.ok) return fail(can.error);
  const drafts = findings.filter((f) => f.status === "DRAFT").map((f) => f.id);

  return run("requestChanges", async () =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.creative.updateMany({
        where: {
          id: g.s.id,
          workflow: "SUBMISSION_REVIEW",
          status: "IN_REVIEW",
          versions: { none: { versionNumber: { gt: ctx.versionNumber } } },
        },
        data: { status: "CHANGES_REQUESTED" },
      });
      if (!count) throw new Conflict("This submission changed while you were reviewing. Refresh and try again.");
      await publishDrafts(tx, g.s, user, drafts);
      // One decision per round (unique roundId) rejects a concurrent second decision.
      await tx.reviewDecision.create({
        data: { creativeId: g.s.id, cycleId: ctx.cycleId, roundId: requested.roundId, versionId: requested.versionId, reviewerId: user.id, kind: "CHANGES_REQUESTED", summary },
      });
      await activity(tx, g.s, user, "CHANGES_REQUESTED", `Changes requested on “${g.s.name}” (V${ctx.versionNumber})`);
      return { ok: true as const };
    }),
  );
}

/** TEAM completes the review cycle with a final internal outcome on the round's exact version. */
export async function completeReview(
  user: CurrentUser,
  input: {
    creativeId: string;
    roundId: string;
    versionId: string;
    outcome: string;
    summary: string;
    scopeNote?: string;
    /** Explicitly share the remaining DRAFT findings as part of this outcome. Otherwise they must be dismissed first. */
    publishDrafts?: boolean;
  },
): Promise<CommandResult> {
  const g = await guard(user, "COMPLETE_REVIEW", input.creativeId);
  if (!g.ok) return g;
  const bad = checkTransition("COMPLETE_REVIEW", g.s, user);
  if (bad) return fail(bad);
  const outcome = Object.values(Outcomes).find((v) => v === input.outcome) as ReviewOutcome | undefined;
  if (!outcome) return fail("Choose an outcome.");
  const summary = clean(input.summary, LIMITS.text) ?? "";
  const scopeNote = clean(input.scopeNote, LIMITS.note);
  if (scopeNote === null) return fail(`Keep the scope note under ${LIMITS.note} characters.`);
  const requested = { roundId: String(input.roundId ?? ""), versionId: String(input.versionId ?? "") };
  const ctx = await decisionContext(g.s.id, requested);
  if (!ctx.ok) return fail(ctx.error);

  const findings = await prisma.finding.findMany({ where: { cycleId: ctx.cycleId }, select: { id: true, status: true, severity: true } });
  const drafts = input.publishDrafts ? findings.filter((f) => f.status === "DRAFT").map((f) => f.id) : [];
  // Judge the outcome on the findings as they will be once drafts are shared.
  const effective = findings.map((f) => (drafts.includes(f.id) ? { ...f, status: "OPEN" as const } : f));
  const allowed = checkOutcome(outcome, effective, summary);
  if (!allowed.ok) return fail(allowed.error);

  return run("completeReview", async () =>
    prisma.$transaction(async (tx) => {
      const { count } = await tx.creative.updateMany({
        where: {
          id: g.s.id,
          workflow: "SUBMISSION_REVIEW",
          status: "IN_REVIEW",
          versions: { none: { versionNumber: { gt: ctx.versionNumber } } },
        },
        data: { status: "REVIEW_COMPLETE" },
      });
      if (!count) throw new Conflict("This submission changed while you were reviewing. Refresh and try again.");
      await publishDrafts(tx, g.s, user, drafts);
      const closed = await tx.reviewCycle.updateMany({ where: { id: ctx.cycleId, closedAt: null }, data: { closedAt: new Date() } });
      if (!closed.count) throw new Conflict("This review cycle is already closed.");
      await tx.reviewDecision.create({
        data: {
          creativeId: g.s.id,
          cycleId: ctx.cycleId,
          roundId: requested.roundId,
          versionId: requested.versionId,
          reviewerId: user.id,
          kind: "FINAL",
          outcome,
          summary,
          scopeNote: scopeNote || null,
        },
      });
      await activity(tx, g.s, user, "REVIEW_COMPLETED", `Review completed for “${g.s.name}” (V${ctx.versionNumber})`);
      return { ok: true as const };
    }),
  );
}
