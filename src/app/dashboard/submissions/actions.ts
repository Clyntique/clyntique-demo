"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import {
  addEvidence,
  createDraft,
  respondToFinding,
  resubmit,
  submitForReview,
  updateDraft,
  withdrawEvidence,
  type EvidenceInput,
} from "@/lib/workflow/commands";

/*
 * Form actions for client submissions. Thin wrappers: each one re-loads the
 * user from the database, then calls the workflow command, which authorizes
 * (policy.ts), validates and writes. Nothing from the browser is trusted.
 */

export type SubmissionFormState =
  | {
      ok?: string;
      error?: string;
      values?: Record<string, string | string[]>;
    }
  | undefined;

const SIGN_IN = "Your session has ended. Please sign in again.";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function list(formData: FormData, key: string) {
  return formData.getAll(key).map(String);
}

function revalidateWorkspaces() {
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
}

function draftValues(formData: FormData) {
  return {
    name: text(formData, "name"),
    description: text(formData, "description"),
    context: text(formData, "context"),
    format: text(formData, "format"),
    markets: list(formData, "markets"),
    platforms: list(formData, "platforms"),
  };
}

/** CLIENT: create a draft submission, then open it. */
export async function createSubmission(_prev: SubmissionFormState, formData: FormData): Promise<SubmissionFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };

  const values = { projectId: text(formData, "projectId"), ...draftValues(formData) };
  const result = await createDraft(user, {
    projectId: values.projectId,
    name: values.name,
    description: values.description,
    context: values.context,
    format: values.format,
    marketCodes: values.markets,
    platformCodes: values.platforms,
  });
  if (!result.ok) return { error: result.error, values };

  revalidateWorkspaces();
  redirect(`/dashboard/creatives/${result.creativeId}?created=1`);
}

/** CLIENT: edit a draft. Markets and platforms are sent only while it is a draft. */
export async function updateSubmission(_prev: SubmissionFormState, formData: FormData): Promise<SubmissionFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };

  const values = draftValues(formData);
  const targeting = formData.get("targeting") === "1";
  const result = await updateDraft(user, text(formData, "creativeId"), {
    name: values.name,
    description: values.description,
    context: values.context,
    format: values.format,
    ...(targeting ? { marketCodes: values.markets, platformCodes: values.platforms } : {}),
  });
  if (!result.ok) return { error: result.error, values };

  revalidateWorkspaces();
  return { ok: "Draft saved." };
}

/** CLIENT: submit a complete draft for review. */
export async function submitSubmission(_prev: SubmissionFormState, formData: FormData): Promise<SubmissionFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };

  const result = await submitForReview(user, text(formData, "creativeId"));
  if (!result.ok) return { error: result.error };

  revalidateWorkspaces();
  return { ok: "Submitted for review. It's now in the Clyntique team's review queue." };
}

/** CLIENT: respond to a published finding. Responses are added, never edited. */
export async function respondToFindingAction(_prev: SubmissionFormState, formData: FormData): Promise<SubmissionFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };

  const values = { message: text(formData, "message"), evidence: list(formData, "evidence") };
  const result = await respondToFinding(user, { findingId: text(formData, "findingId"), message: values.message, evidenceIds: values.evidence });
  if (!result.ok) return { error: result.error, values };

  revalidateWorkspaces();
  return { ok: "Response added." };
}

/**
 * CLIENT: add supporting evidence. Called by the evidence form after any file
 * has been uploaded to private storage; addEvidence re-verifies the file.
 */
export async function addEvidenceAction(input: EvidenceInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SIGN_IN };
  const result = await addEvidence(user, input);
  if (!result.ok) return result;
  revalidateWorkspaces();
  return { ok: true };
}

/** CLIENT: withdraw evidence added since the last submission (kept in the record as withdrawn). */
export async function withdrawEvidenceAction(_prev: SubmissionFormState, formData: FormData): Promise<SubmissionFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  const result = await withdrawEvidence(user, text(formData, "evidenceId"));
  if (!result.ok) return { error: result.error };
  revalidateWorkspaces();
  return { ok: "Evidence withdrawn." };
}

/** CLIENT: resubmit after changes were requested (a new review round on the newest version). */
export async function resubmitSubmission(_prev: SubmissionFormState, formData: FormData): Promise<SubmissionFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  const values = { note: text(formData, "note") };
  const result = await resubmit(user, text(formData, "creativeId"), values.note);
  if (!result.ok) return { error: result.error, values };
  revalidateWorkspaces();
  return { ok: "Resubmitted. It's back in the Clyntique team's review queue." };
}
