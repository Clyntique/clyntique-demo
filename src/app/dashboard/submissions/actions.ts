"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { createDraft, submitForReview, updateDraft } from "@/lib/workflow/commands";

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
