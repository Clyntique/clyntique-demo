"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { attachEvidenceRecord, checkEvidenceRecord, createEvidenceRecord } from "@/lib/workflow/evidence-record-commands";
import type { EvidenceRecordFormState } from "@/app/dashboard/evidence/actions";

/*
 * Form actions for the team's Evidence Dictionary. Thin wrappers around the
 * commands, which authorize (TEAM only; a client's record only once it
 * reached the team; attachments only to a submission under review).
 */

const SIGN_IN = "Your session has ended. Please sign in again.";
const NO_PERMISSION = "You don't have permission to do that.";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function revalidateWorkspaces() {
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
}

/** TEAM: add a Clyntique reference record. */
export async function createTeamRecordAction(_prev: EvidenceRecordFormState, formData: FormData): Promise<EvidenceRecordFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  if (user.role !== "TEAM") return { error: NO_PERMISSION };
  const values = {
    title: text(formData, "title"),
    type: text(formData, "type"),
    description: text(formData, "description"),
    source: text(formData, "source"),
    url: text(formData, "url"),
    claimText: text(formData, "claimText"),
    validUntil: text(formData, "validUntil"),
  };
  const result = await createEvidenceRecord(user, values);
  if (!result.ok) return { error: result.error, values };
  revalidateWorkspaces();
  return { ok: "Clyntique record added.", recordId: result.recordId };
}

/** TEAM: attach a Clyntique record to a submission under review. */
export async function attachTeamRecordAction(_prev: EvidenceRecordFormState, formData: FormData): Promise<EvidenceRecordFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  if (user.role !== "TEAM") return { error: NO_PERMISSION };
  const values = { creativeId: text(formData, "creativeId"), visibility: text(formData, "visibility"), claimLocation: text(formData, "claimLocation"), findings: formData.getAll("findings").map(String) };
  const result = await attachEvidenceRecord(user, {
    recordId: text(formData, "recordId"),
    creativeId: values.creativeId,
    visibility: values.visibility,
    claimLocation: values.claimLocation,
    findingIds: values.findings,
  });
  if (!result.ok) return { error: result.error, values };
  revalidateWorkspaces();
  return { ok: "Attached as Clyntique evidence. If shared, the client sees it with your next decision." };
}

/** TEAM: record a check of a record (append-only). */
export async function checkRecordAction(_prev: EvidenceRecordFormState, formData: FormData): Promise<EvidenceRecordFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  if (user.role !== "TEAM") return { error: NO_PERMISSION };
  const values = { result: text(formData, "result"), note: text(formData, "note") };
  const result = await checkEvidenceRecord(user, { recordId: text(formData, "recordId"), ...values });
  if (!result.ok) return { error: result.error, values };
  revalidateWorkspaces();
  return { ok: "Check recorded. The client sees it as “Clyntique reviewer”." };
}
