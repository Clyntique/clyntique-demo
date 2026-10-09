"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { CreativeFormat, EvidenceType } from "@/generated/prisma/enums";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/dal";
import { getUploadLimits, limitFor, mediaKindFor, UPLOAD_KEY_PATTERN, uploadPathFor } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { DENIAL_MESSAGE, authorize } from "@/lib/workflow/policy";
import { findAccessibleCreative, latestVersionNumber, submissionFacts, type AccessibleCreative } from "./access";
import { contentMatches, deleteUnreferencedBlob, headBlob, isPrivateBlobUrl } from "./blob";

/*
 * Review workflow mutations: versions, sharing, creative details, evidence,
 * comments and client decisions.
 *
 * Every action re-loads the signed-in user, checks the role, and re-checks the
 * creative through findAccessibleCreative (CLIENT: own projects, never drafts).
 * Ids from the browser are only lookup keys; nothing is trusted until it has
 * been matched against the user's scope. Status changes use conditional
 * updates so double submits and races can't produce inconsistent records.
 *
 * Activity entries are shared with the client, so actions on DRAFT creatives
 * don't create them.
 *
 * Two workflows share these actions:
 * - LEGACY_CLIENT_APPROVAL (Phase 4): TEAM uploads/shares/manages evidence,
 *   CLIENT approves. Unchanged, for existing records only.
 * - SUBMISSION_REVIEW (M3+): only finalizeVersion applies, for the submitting
 *   CLIENT while the submission is editable (policy.ts). Every other action
 *   here refuses new-workflow submissions; their review actions arrive in M4.
 */

export type ReviewFormState =
  | {
      ok?: string;
      error?: string;
      fieldErrors?: Partial<Record<string, string>>;
      values?: Record<string, string>;
    }
  | undefined;

const NOT_FOUND = "This creative is no longer available.";
const NEW_WORKFLOW = "This submission uses the compliance review workflow, which doesn't support that action here.";

function isLegacy(creative: AccessibleCreative) {
  return creative.workflow === "LEGACY_CLIENT_APPROVAL";
}
const SIGN_IN = "Your session has ended. Please sign in again.";

const LIMITS = {
  name: 120,
  description: 1000,
  context: 2000,
  changeNotes: 1000,
  evidenceTitle: 160,
  evidenceDescription: 2000,
  evidenceSource: 200,
  url: 2000,
  comment: 4000,
  reason: 2000,
  fileName: 200,
};
const MIN_REASON = 10;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function revalidateWorkspaces() {
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
}

async function signedIn(role?: CurrentUser["role"]): Promise<{ error: string } | { user: CurrentUser }> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  if (role && user.role !== role) return { error: "You don't have permission to do that." };
  return { user };
}

async function creativeFor(user: CurrentUser, creativeId: string) {
  return findAccessibleCreative(user, creativeId);
}

function versionLabel(n: number) {
  return `V${n}`;
}

/** Only http(s) links are stored, so a link can never run script when clicked. */
function safeUrl(value: string): string | null {
  if (!value || value.length > LIMITS.url) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// ---------------------------------------------------------------------------
// Versions

export type FinalizeResult =
  | { ok: true; versionNumber: number }
  | { ok: false; error: string; retryable: boolean };

/**
 * Records an uploaded file as the creative's next version.
 *
 * Called by the browser after a client upload to Blob finishes. The upload
 * itself proves nothing, so this re-checks the role, the creative, the exact
 * storage path, the stored size and type, and the file's leading bytes.
 * Rejected files are deleted (they are not referenced by any version).
 *
 * Idempotent: retrying with the same blob returns the existing version, and
 * version numbers come from a unique (creativeId, versionNumber) constraint,
 * so concurrent uploads never share or skip a number.
 */
export async function finalizeVersion(input: {
  creativeId: string;
  uploadKey: string;
  url: string;
  fileName: string;
  changeNotes?: string;
}): Promise<FinalizeResult> {
  const auth = await signedIn();
  if ("error" in auth) return { ok: false, error: auth.error, retryable: false };
  const { user } = auth;

  const creativeId = String(input?.creativeId ?? "");
  const uploadKey = String(input?.uploadKey ?? "");
  const url = String(input?.url ?? "");
  const fileName = String(input?.fileName ?? "").trim().slice(0, LIMITS.fileName);
  const changeNotes = String(input?.changeNotes ?? "").trim();

  if (changeNotes.length > LIMITS.changeNotes) {
    return { ok: false, error: `Keep change notes under ${LIMITS.changeNotes} characters.`, retryable: false };
  }

  const creative = await creativeFor(user, creativeId);
  if (!creative) return { ok: false, error: NOT_FOUND, retryable: false };

  // Legacy creatives: TEAM uploads. Client submissions: only the owning client,
  // only while the submission is editable (DRAFT or CHANGES_REQUESTED).
  if (isLegacy(creative)) {
    if (user.role !== "TEAM") return { ok: false, error: "You don't have permission to do that.", retryable: false };
  } else {
    const allowed = authorize(user, "UPLOAD_VERSION", submissionFacts(creative));
    if (!allowed.ok) return { ok: false, error: DENIAL_MESSAGE[allowed.reason], retryable: false };
  }

  // Retry of an upload that was already recorded.
  const existing = await prisma.creativeVersion.findFirst({
    where: { creativeId: creative.id, fileUrl: url },
    select: { versionNumber: true },
  });
  if (existing) return { ok: true, versionNumber: existing.versionNumber };

  if (creative.status === "ARCHIVED") {
    return { ok: false, error: "Archived creatives can't get new versions.", retryable: false };
  }

  const kind = mediaKindFor(fileName);
  if (!UPLOAD_KEY_PATTERN.test(uploadKey) || !kind || !isPrivateBlobUrl(url)) {
    return { ok: false, error: "This upload couldn't be verified. Please upload the file again.", retryable: false };
  }

  const blob = await headBlob(url);
  if (!blob) {
    return { ok: false, error: "The uploaded file couldn't be found. Please try again.", retryable: true };
  }

  // The stored path must be the one the server issued a token for:
  // creatives/<creativeId>/<uploadKey>-<random suffix>.<ext>
  const expected = uploadPathFor(creative.id, uploadKey, kind.extension);
  const prefix = expected.slice(0, -(kind.extension.length + 1));
  const pathOk =
    blob.pathname === expected ||
    (blob.pathname.startsWith(`${prefix}-`) && blob.pathname.endsWith(`.${kind.extension}`) && !blob.pathname.slice(prefix.length).includes("/"));

  const limit = limitFor(kind.mediaType, getUploadLimits());
  let problem: string | null = null;
  if (!pathOk) problem = "This upload couldn't be verified. Please upload the file again.";
  else if (blob.size <= 0 || blob.size > limit) problem = "The file is larger than the allowed size.";
  else if (blob.contentType !== kind.mimeType || !(await contentMatches(url, kind.mimeType).catch(() => false))) {
    problem = `This file isn't a valid ${kind.label} file.`;
  }
  if (problem) {
    if (pathOk) await deleteUnreferencedBlob(url);
    return { ok: false, error: problem, retryable: false };
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const versionNumber = await prisma.$transaction(async (tx) => {
        const latest = await tx.creativeVersion.findFirst({
          where: { creativeId: creative.id },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true },
        });
        const next = (latest?.versionNumber ?? 0) + 1;

        await tx.creativeVersion.create({
          data: {
            creativeId: creative.id,
            versionNumber: next,
            fileUrl: url,
            filePathname: blob.pathname,
            fileName: fileName || null,
            mimeType: kind.mimeType,
            sizeBytes: blob.size,
            mediaType: kind.mediaType,
            changeNotes: changeNotes || null,
            createdById: user.id,
          },
        });

        const current = await tx.creative.findUniqueOrThrow({ where: { id: creative.id }, select: { status: true, workflow: true } });

        if (current.workflow === "SUBMISSION_REVIEW") {
          // Client submission: the status never changes on upload; the client
          // submits or resubmits explicitly. Uploads close once submitted.
          if (current.status !== "DRAFT" && current.status !== "CHANGES_REQUESTED") {
            throw new ActionConflict("This submission was submitted meanwhile, so uploads are closed.");
          }
          await tx.creative.update({ where: { id: creative.id }, data: { updatedAt: new Date() } });
          // Private drafts get no activity; a revision after changes were requested does.
          if (current.status === "CHANGES_REQUESTED") {
            await tx.activity.create({
              data: {
                projectId: creative.projectId,
                creativeId: creative.id,
                userId: user.id,
                type: "VERSION_UPLOADED",
                message: `${versionLabel(next)} of “${creative.name}” uploaded as a revision`,
              },
            });
          }
          return next;
        }

        // Legacy: a new version always needs a fresh decision. Drafts stay
        // drafts; anything already shared goes (back) to review. Older
        // approvals stay in history attached to the version they were made on.
        if (current.status === "ARCHIVED") throw new ActionConflict("Archived creatives can't get new versions.");
        await tx.creative.update({
          where: { id: creative.id },
          data: { status: current.status === "DRAFT" ? "DRAFT" : "IN_REVIEW" },
        });

        if (current.status !== "DRAFT") {
          await tx.activity.create({
            data: {
              projectId: creative.projectId,
              userId: user.id,
              type: "VERSION_UPLOADED",
              message: `${versionLabel(next)} of “${creative.name}” uploaded for review`,
            },
          });
        }
        return next;
      });

      revalidateWorkspaces();
      return { ok: true, versionNumber };
    } catch (error) {
      if (error instanceof ActionConflict) return { ok: false, error: error.message, retryable: false };
      if (isUniqueViolation(error)) {
        // Another upload took this number, or this exact file was recorded
        // by a concurrent retry. Check for the latter, otherwise try again.
        const recorded = await prisma.creativeVersion.findFirst({
          where: { creativeId: creative.id, fileUrl: url },
          select: { versionNumber: true },
        });
        if (recorded) return { ok: true, versionNumber: recorded.versionNumber };
        continue;
      }
      console.error("finalizeVersion failed", error instanceof Error ? error.name : "unknown error");
      return { ok: false, error: "The version couldn't be saved. Please try again.", retryable: true };
    }
  }
  return { ok: false, error: "The version couldn't be saved. Please try again.", retryable: true };
}

class ActionConflict extends Error {}

// ---------------------------------------------------------------------------
// Sharing and details (TEAM)

export async function shareForReview(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const auth = await signedIn("TEAM");
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;

  const creative = await creativeFor(user, text(formData, "creativeId"));
  if (!creative) return { error: NOT_FOUND };
  if (!isLegacy(creative)) return { error: NEW_WORKFLOW };
  if (creative.status !== "DRAFT") return { ok: "Already shared with the client." };

  const versions = await latestVersionNumber(creative.id);
  if (!versions) return { error: "Upload a file before sharing this creative." };

  try {
    const shared = await prisma.$transaction(async (tx) => {
      // Conditional update: a double click shares (and logs) only once.
      const { count } = await tx.creative.updateMany({
        where: { id: creative.id, status: "DRAFT" },
        data: { status: "IN_REVIEW" },
      });
      if (!count) return false;
      await tx.activity.create({
        data: {
          projectId: creative.projectId,
          userId: user.id,
          type: "CREATIVE_UPLOADED",
          message: `Shared “${creative.name}” for review (${versionLabel(versions)})`,
        },
      });
      return true;
    });
    revalidateWorkspaces();
    return { ok: shared ? "Shared with the client for review." : "Already shared with the client." };
  } catch (error) {
    console.error("shareForReview failed", error instanceof Error ? error.name : "unknown error");
    return { error: "Something went wrong. Please try again." };
  }
}

export async function updateCreativeDetails(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const auth = await signedIn("TEAM");
  if ("error" in auth) return { error: auth.error };

  const values = {
    name: text(formData, "name"),
    format: text(formData, "format"),
    description: text(formData, "description"),
    context: text(formData, "context"),
  };
  const creative = await creativeFor(auth.user, text(formData, "creativeId"));
  if (!creative) return { error: NOT_FOUND, values };
  if (!isLegacy(creative)) return { error: NEW_WORKFLOW, values };

  const fieldErrors: Record<string, string> = {};
  if (values.name.length < 2) fieldErrors.name = "Enter a creative name (at least 2 characters).";
  else if (values.name.length > LIMITS.name) fieldErrors.name = `Keep the name under ${LIMITS.name} characters.`;
  const format = Object.values(CreativeFormat).find((f) => f === values.format);
  if (!format) fieldErrors.format = "Choose a format.";
  if (values.description.length > LIMITS.description)
    fieldErrors.description = `Keep the description under ${LIMITS.description} characters.`;
  if (values.context.length > LIMITS.context)
    fieldErrors.context = `Keep the campaign context under ${LIMITS.context} characters.`;
  if (Object.keys(fieldErrors).length || !format) return { fieldErrors, values };

  try {
    await prisma.creative.update({
      where: { id: creative.id },
      data: {
        name: values.name,
        format,
        description: values.description || null,
        context: values.context || null,
      },
    });
  } catch (error) {
    console.error("updateCreativeDetails failed", error instanceof Error ? error.name : "unknown error");
    return { error: "Something went wrong. Please try again.", values };
  }
  revalidateWorkspaces();
  return { ok: "Details saved." };
}

// ---------------------------------------------------------------------------
// Evidence (TEAM writes, both roles read)

export async function saveEvidence(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const auth = await signedIn("TEAM");
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;

  const values = {
    evidenceId: text(formData, "evidenceId"),
    title: text(formData, "title"),
    type: text(formData, "type"),
    description: text(formData, "description"),
    source: text(formData, "source"),
    url: text(formData, "url"),
    date: text(formData, "date"),
  };
  const creative = await creativeFor(user, text(formData, "creativeId"));
  if (!creative) return { error: NOT_FOUND, values };
  if (!isLegacy(creative)) return { error: NEW_WORKFLOW, values };

  const fieldErrors: Record<string, string> = {};
  if (values.title.length < 2) fieldErrors.title = "Give the evidence a title.";
  else if (values.title.length > LIMITS.evidenceTitle)
    fieldErrors.title = `Keep the title under ${LIMITS.evidenceTitle} characters.`;
  const type = Object.values(EvidenceType).find((t) => t === values.type);
  if (!type) fieldErrors.type = "Choose what kind of evidence this is.";
  if (values.description.length > LIMITS.evidenceDescription)
    fieldErrors.description = `Keep the description under ${LIMITS.evidenceDescription} characters.`;
  if (values.source.length > LIMITS.evidenceSource)
    fieldErrors.source = `Keep the source under ${LIMITS.evidenceSource} characters.`;
  const url = values.url ? safeUrl(values.url) : null;
  if (values.url && !url) fieldErrors.url = "Enter a full web link starting with https://";
  let date: Date | null = null;
  if (values.date) {
    date = /^\d{4}-\d{2}-\d{2}$/.test(values.date) ? new Date(`${values.date}T00:00:00Z`) : null;
    if (!date || Number.isNaN(date.getTime())) fieldErrors.date = "Enter a valid date.";
  }
  if (Object.keys(fieldErrors).length || !type) return { fieldErrors, values };

  const data = {
    title: values.title,
    type,
    description: values.description || null,
    source: values.source || null,
    url,
    date,
  };

  try {
    if (values.evidenceId) {
      // Scoped to this creative, so an id from another creative matches nothing.
      const { count } = await prisma.evidence.updateMany({
        where: { id: values.evidenceId, creativeId: creative.id },
        data,
      });
      if (!count) return { error: "This evidence no longer exists.", values };
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.evidence.create({ data: { ...data, creativeId: creative.id } });
        if (creative.status !== "DRAFT") {
          await tx.activity.create({
            data: {
              projectId: creative.projectId,
              userId: user.id,
              type: "OTHER",
              message: `Evidence added to “${creative.name}”`,
            },
          });
        }
      });
    }
  } catch (error) {
    console.error("saveEvidence failed", error instanceof Error ? error.name : "unknown error");
    return { error: "Something went wrong. Please try again.", values };
  }
  revalidateWorkspaces();
  return { ok: values.evidenceId ? "Evidence updated." : "Evidence added." };
}

export async function deleteEvidence(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const auth = await signedIn("TEAM");
  if ("error" in auth) return { error: auth.error };

  const creative = await creativeFor(auth.user, text(formData, "creativeId"));
  if (!creative) return { error: NOT_FOUND };
  if (!isLegacy(creative)) return { error: NEW_WORKFLOW };
  try {
    await prisma.evidence.deleteMany({ where: { id: text(formData, "evidenceId"), creativeId: creative.id } });
  } catch (error) {
    console.error("deleteEvidence failed", error instanceof Error ? error.name : "unknown error");
    return { error: "Something went wrong. Please try again." };
  }
  revalidateWorkspaces();
  return { ok: "Evidence removed." };
}

// ---------------------------------------------------------------------------
// Feedback (TEAM and the project's CLIENT)

const DUPLICATE_WINDOW_MS = 15_000;

export async function addComment(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const auth = await signedIn();
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;

  const content = text(formData, "content");
  const values = { content };
  const creative = await creativeFor(user, text(formData, "creativeId"));
  if (!creative) return { error: NOT_FOUND, values };
  if (!isLegacy(creative)) return { error: NEW_WORKFLOW, values };

  if (!content) return { fieldErrors: { content: "Write a comment first." }, values };
  if (content.length > LIMITS.comment)
    return { fieldErrors: { content: `Keep comments under ${LIMITS.comment} characters.` }, values };

  const version = await prisma.creativeVersion.findFirst({
    where: { id: text(formData, "versionId"), creativeId: creative.id },
    select: { id: true, versionNumber: true },
  });
  if (!version) return { error: "This version is no longer available. Refresh the page.", values };

  // A double submit within a few seconds posts the comment once.
  const duplicate = await prisma.comment.findFirst({
    where: {
      versionId: version.id,
      userId: user.id,
      content,
      createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    },
    select: { id: true },
  });

  if (!duplicate) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.comment.create({
          data: { creativeId: creative.id, versionId: version.id, userId: user.id, content },
        });
        await tx.creative.update({ where: { id: creative.id }, data: { updatedAt: new Date() } });
        if (creative.status !== "DRAFT") {
          await tx.activity.create({
            data: {
              projectId: creative.projectId,
              userId: user.id,
              type: user.role === "CLIENT" ? "FEEDBACK_RECEIVED" : "OTHER",
              message:
                user.role === "CLIENT"
                  ? `Feedback on “${creative.name}” (${versionLabel(version.versionNumber)})`
                  : `Team replied on “${creative.name}” (${versionLabel(version.versionNumber)})`,
            },
          });
        }
      });
    } catch (error) {
      console.error("addComment failed", error instanceof Error ? error.name : "unknown error");
      return { error: "Your comment wasn't posted. Please try again.", values };
    }
    revalidateWorkspaces();
  }
  return { ok: "Comment posted." };
}

// ---------------------------------------------------------------------------
// Client decisions

export async function submitDecision(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const auth = await signedIn("CLIENT");
  if ("error" in auth) return { error: auth.error };
  const { user } = auth;

  const decision = text(formData, "decision");
  const reason = text(formData, "reason");
  const values = { reason, decision };
  if (decision !== "APPROVED" && decision !== "CHANGES_REQUESTED") return { error: "Choose a decision.", values };

  if (decision === "CHANGES_REQUESTED") {
    if (reason.length < MIN_REASON)
      return { fieldErrors: { reason: "Tell the team what to change (at least a short sentence)." }, values };
    if (reason.length > LIMITS.reason)
      return { fieldErrors: { reason: `Keep this under ${LIMITS.reason} characters.` }, values };
  }

  // findAccessibleCreative already limits a client to their own, non-draft creatives.
  const creative: AccessibleCreative | null = await creativeFor(user, text(formData, "creativeId"));
  if (!creative) return { error: NOT_FOUND, values };
  // Client approval exists only in the legacy workflow; internal review decisions are TEAM-only (M4).
  if (!isLegacy(creative)) return { error: NEW_WORKFLOW, values };

  const version = await prisma.creativeVersion.findFirst({
    where: { id: text(formData, "versionId"), creativeId: creative.id },
    select: { id: true, versionNumber: true },
  });
  if (!version) return { error: "This version is no longer available. Refresh the page.", values };

  try {
    const result = await prisma.$transaction(async (tx) => {
      // One atomic guard for every rule: the creative is still in review and
      // the reviewed version is still the newest. A double submit, a second
      // tab, or a revision uploaded meanwhile all match zero rows.
      const { count } = await tx.creative.updateMany({
        where: {
          id: creative.id,
          workflow: "LEGACY_CLIENT_APPROVAL",
          status: "IN_REVIEW",
          project: { clientId: user.id },
          versions: { none: { versionNumber: { gt: version.versionNumber } } },
        },
        data: { status: decision },
      });
      if (!count) return "conflict" as const;

      await tx.approval.create({
        data: {
          creativeId: creative.id,
          versionId: version.id,
          userId: user.id,
          status: decision,
          reason: decision === "CHANGES_REQUESTED" ? reason : null,
        },
      });
      await tx.activity.create({
        data: {
          projectId: creative.projectId,
          userId: user.id,
          type: decision === "APPROVED" ? "CREATIVE_APPROVED" : "CHANGES_REQUESTED",
          message:
            decision === "APPROVED"
              ? `Approved “${creative.name}” (${versionLabel(version.versionNumber)})`
              : `Requested changes on “${creative.name}” (${versionLabel(version.versionNumber)})`,
        },
      });
      return "saved" as const;
    });

    if (result === "conflict") {
      const latest = await latestVersionNumber(creative.id);
      revalidateWorkspaces();
      return latest > version.versionNumber
        ? { error: `The team uploaded ${versionLabel(latest)} while you were reviewing. Please review the new version.` }
        : { error: "This creative isn't waiting for a decision any more. Refresh to see its current status." };
    }
  } catch (error) {
    console.error("submitDecision failed", error instanceof Error ? error.name : "unknown error");
    return { error: "Your decision wasn't saved. Please try again.", values };
  }

  revalidateWorkspaces();
  return { ok: decision === "APPROVED" ? "Approved. The team has been updated." : "Changes requested. The team has been updated." };
}
