"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { openReviewCycle, recordExternalOutcome, recordExternalSubmission } from "@/lib/workflow/commands";

/*
 * Form actions for the lifecycle records (Oct 19 sprint): re-review, external
 * submission and external outcome. Thin wrappers, like the review and
 * submission actions: each re-loads the user from the database and calls a
 * workflow command, which authorizes (policy.ts), validates and writes.
 * Nothing from the browser is trusted.
 */

export type LifecycleActionState =
  | {
      ok?: string;
      error?: string;
      values?: Record<string, string>;
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

/** TEAM: open the next review cycle on a completed submission. */
export async function reopenReviewAction(_prev: LifecycleActionState, formData: FormData): Promise<LifecycleActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  const values = { reason: text(formData, "reason"), note: text(formData, "note"), triggerRuleVersionId: text(formData, "triggerRuleVersionId") };
  const result = await openReviewCycle(user, {
    creativeId: text(formData, "creativeId"),
    reason: values.reason,
    note: values.note,
    triggerRuleVersionId: values.triggerRuleVersionId || undefined,
  });
  if (!result.ok) return { error: result.error, values };
  revalidateWorkspaces();
  return { ok: `Review cycle ${result.cycleNumber} opened. The submission is back in the review queue; earlier cycles stay as they were.` };
}

/** CLIENT reports, or TEAM records, that a reviewed version went to a platform or regulator. */
export async function recordExternalSubmissionAction(_prev: LifecycleActionState, formData: FormData): Promise<LifecycleActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  const values = {
    versionId: text(formData, "versionId"),
    destinationType: text(formData, "destinationType"),
    destinationName: text(formData, "destinationName"),
    platformCode: text(formData, "platformCode"),
    marketCode: text(formData, "marketCode"),
    submittedOn: text(formData, "submittedOn"),
    externalReference: text(formData, "externalReference"),
    note: text(formData, "note"),
    basis: text(formData, "basis"),
  };
  const result = await recordExternalSubmission(user, {
    creativeId: text(formData, "creativeId"),
    versionId: values.versionId,
    destinationType: values.destinationType,
    destinationName: values.destinationName,
    platformCode: values.platformCode || undefined,
    marketCode: values.marketCode || undefined,
    submittedOn: values.submittedOn,
    externalReference: values.externalReference || undefined,
    note: values.note || undefined,
    basis: values.basis || undefined,
  });
  if (!result.ok) return { error: result.error, values };
  revalidateWorkspaces();
  return { ok: "External submission recorded. Add the outcome here once the platform or regulator answers." };
}

/** CLIENT reports, or TEAM records, what the platform or regulator answered. */
export async function recordExternalOutcomeAction(_prev: LifecycleActionState, formData: FormData): Promise<LifecycleActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  const values = {
    kind: text(formData, "kind"),
    outcomeOn: text(formData, "outcomeOn"),
    note: text(formData, "note"),
    evidenceId: text(formData, "evidenceId"),
    basis: text(formData, "basis"),
  };
  const result = await recordExternalOutcome(user, {
    submissionId: text(formData, "submissionId"),
    kind: values.kind,
    outcomeOn: values.outcomeOn,
    note: values.note || undefined,
    evidenceId: values.evidenceId || undefined,
    basis: values.basis || undefined,
  });
  if (!result.ok) return { error: result.error, values };
  revalidateWorkspaces();
  return { ok: "Outcome recorded. It is shown as reported, not as a Clyntique decision." };
}
