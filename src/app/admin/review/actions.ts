"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { completeReview, recordFinding, requestChanges, reviewFinding, startReview, updateDraftFinding } from "@/lib/workflow/commands";

/*
 * Form actions for internal review. Thin wrappers: each re-loads the user from
 * the database and calls a workflow command, which authorizes (TEAM only,
 * correct status, never legacy), validates, and writes with guarded updates.
 */

export type ReviewActionState =
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

function revalidateWorkspaces() {
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
}

function findingValues(formData: FormData) {
  return {
    issue: text(formData, "issue"),
    explanation: text(formData, "explanation"),
    severity: text(formData, "severity"),
    requiredAction: text(formData, "requiredAction"),
    actionDetails: text(formData, "actionDetails"),
    markets: formData.getAll("markets").map(String),
    platforms: formData.getAll("platforms").map(String),
  };
}

export async function startReviewAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  const result = await startReview(user, text(formData, "creativeId"));
  if (!result.ok) return { error: result.error };
  revalidateWorkspaces();
  return { ok: "Review started." };
}

export async function addFindingAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  const values = findingValues(formData);
  const result = await recordFinding(user, {
    creativeId: text(formData, "creativeId"),
    issue: values.issue,
    explanation: values.explanation,
    severity: values.severity,
    requiredAction: values.requiredAction,
    actionDetails: values.actionDetails,
    marketCodes: values.markets,
    platformCodes: values.platforms,
  });
  if (!result.ok) return { error: result.error, values };
  revalidateWorkspaces();
  return { ok: "Draft finding added. Only the team can see it until you request changes or complete the review." };
}

export async function updateFindingAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  const values = findingValues(formData);
  const result = await updateDraftFinding(user, {
    findingId: text(formData, "findingId"),
    issue: values.issue,
    explanation: values.explanation,
    severity: values.severity,
    requiredAction: values.requiredAction,
    actionDetails: values.actionDetails,
    marketCodes: values.markets,
    platformCodes: values.platforms,
  });
  if (!result.ok) return { error: result.error, values };
  revalidateWorkspaces();
  return { ok: "Finding updated." };
}

export async function dismissFindingAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  const result = await reviewFinding(user, { findingId: text(formData, "findingId"), move: "DISMISS", note: text(formData, "note") });
  if (!result.ok) return { error: result.error };
  revalidateWorkspaces();
  return { ok: "Finding dismissed." };
}

export async function resolveFindingAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  const result = await reviewFinding(user, { findingId: text(formData, "findingId"), move: "RESOLVE", note: text(formData, "note") });
  if (!result.ok) return { error: result.error, values: { note: text(formData, "note") } };
  revalidateWorkspaces();
  return { ok: "Finding resolved." };
}

export async function reopenFindingAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  const result = await reviewFinding(user, { findingId: text(formData, "findingId"), move: "REOPEN", note: text(formData, "note") });
  if (!result.ok) return { error: result.error, values: { note: text(formData, "note") } };
  revalidateWorkspaces();
  return { ok: "Finding reopened. The client will see your note when you request changes." };
}

export async function requestChangesAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  const values = { summary: text(formData, "summary") };
  const result = await requestChanges(user, {
    creativeId: text(formData, "creativeId"),
    roundId: text(formData, "roundId"),
    versionId: text(formData, "versionId"),
    summary: values.summary,
  });
  if (!result.ok) return { error: result.error, values };
  revalidateWorkspaces();
  return { ok: "Changes requested. The findings are now visible to the client." };
}

export async function completeReviewAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  const values = { outcome: text(formData, "outcome"), summary: text(formData, "summary"), scopeNote: text(formData, "scopeNote") };
  const result = await completeReview(user, {
    creativeId: text(formData, "creativeId"),
    roundId: text(formData, "roundId"),
    versionId: text(formData, "versionId"),
    outcome: values.outcome,
    summary: values.summary,
    scopeNote: values.scopeNote,
    publishDrafts: formData.get("publishDrafts") === "1",
  });
  if (!result.ok) return { error: result.error, values };
  revalidateWorkspaces();
  return { ok: "Review completed and recorded." };
}
