"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { attachEvidenceRecord, createEvidenceRecord } from "@/lib/workflow/evidence-record-commands";

/*
 * Form actions for a client's Evidence Dictionary. Thin wrappers: each
 * re-loads the user from the database and calls the command, which
 * authorizes (own workspace, own submission, status allows evidence),
 * validates and writes. Nothing from the browser is trusted.
 */

export type EvidenceRecordFormState =
  | {
      ok?: string;
      error?: string;
      values?: Record<string, string | string[]>;
      recordId?: string;
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

function recordValues(formData: FormData) {
  return {
    title: text(formData, "title"),
    type: text(formData, "type"),
    description: text(formData, "description"),
    source: text(formData, "source"),
    url: text(formData, "url"),
    claimText: text(formData, "claimText"),
    validUntil: text(formData, "validUntil"),
  };
}

/** CLIENT: add a record to their own dictionary. */
export async function createClientRecordAction(_prev: EvidenceRecordFormState, formData: FormData): Promise<EvidenceRecordFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  if (user.role !== "CLIENT") return { error: "You don't have permission to do that." };
  const values = recordValues(formData);
  const result = await createEvidenceRecord(user, values);
  if (!result.ok) return { error: result.error, values };
  revalidateWorkspaces();
  return { ok: "Record added to your Evidence Dictionary.", recordId: result.recordId };
}

/** CLIENT: attach one of their records to one of their submissions. */
export async function attachClientRecordAction(_prev: EvidenceRecordFormState, formData: FormData): Promise<EvidenceRecordFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  if (user.role !== "CLIENT") return { error: "You don't have permission to do that." };
  const values = { creativeId: text(formData, "creativeId"), claimLocation: text(formData, "claimLocation"), findings: formData.getAll("findings").map(String) };
  const result = await attachEvidenceRecord(user, {
    recordId: text(formData, "recordId"),
    creativeId: values.creativeId,
    claimLocation: values.claimLocation,
    findingIds: values.findings,
  });
  if (!result.ok) return { error: result.error, values };
  revalidateWorkspaces();
  return { ok: "Attached. It becomes part of the review record when you submit or resubmit." };
}
