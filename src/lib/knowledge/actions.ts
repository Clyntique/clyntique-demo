"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import {
  createLibraryDocument,
  deleteLibraryDocument,
  processLibraryDocument,
  saveChunkAsRecord,
  setLibraryVisibility,
  type NewDocumentInput,
} from "@/lib/workflow/library-commands";

/*
 * Form actions of the Content Library and knowledge search, for both roles.
 * Thin wrappers: each re-loads the user and calls the command, which decides
 * ownership and permissions (src/lib/workflow/library-commands.ts). Nothing
 * from the browser is trusted.
 */

export type LibraryActionState = { ok?: string; error?: string; documentId?: string; recordId?: string } | undefined;

const SIGN_IN = "Your session has ended. Please sign in again.";

function revalidate() {
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
}

/** Records an uploaded file, then extracts its text in the same request. */
export async function createLibraryDocumentAction(input: NewDocumentInput): Promise<LibraryActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  const created = await createLibraryDocument(user, input);
  if (!created.ok) return { error: created.error };
  const processed = await processLibraryDocument(user, created.documentId);
  revalidate();
  if (!processed.ok) return { ok: "Document saved, but it could not be indexed yet: " + processed.error, documentId: created.documentId };
  return { ok: `Document added and indexed (${processed.chunkCount} ${processed.chunkCount === 1 ? "passage" : "passages"}).`, documentId: created.documentId };
}

export async function processLibraryDocumentAction(_prev: LibraryActionState, formData: FormData): Promise<LibraryActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  const result = await processLibraryDocument(user, String(formData.get("documentId") ?? ""));
  revalidate();
  if (!result.ok) return { error: result.error };
  return { ok: `Indexed ${result.chunkCount} ${result.chunkCount === 1 ? "passage" : "passages"}.` };
}

export async function setLibraryVisibilityAction(_prev: LibraryActionState, formData: FormData): Promise<LibraryActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  const result = await setLibraryVisibility(user, String(formData.get("documentId") ?? ""), String(formData.get("visibility") ?? ""));
  revalidate();
  if (!result.ok) return { error: result.error };
  return { ok: formData.get("visibility") === "TEAM" ? "Shared with Clyntique reviewers." : "Now private to your workspace." };
}

export async function deleteLibraryDocumentAction(_prev: LibraryActionState, formData: FormData): Promise<LibraryActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  const result = await deleteLibraryDocument(user, String(formData.get("documentId") ?? ""));
  revalidate();
  if (!result.ok) return { error: result.error };
  return { ok: "Document deleted. Its file and search passages are gone; records that quoted it keep the quote." };
}

export async function saveChunkAsRecordAction(_prev: LibraryActionState, formData: FormData): Promise<LibraryActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: SIGN_IN };
  const result = await saveChunkAsRecord(user, { chunkId: String(formData.get("chunkId") ?? ""), claimText: String(formData.get("claimText") ?? "") });
  revalidate();
  if (!result.ok) return { error: result.error };
  return { ok: "Saved to the Evidence Dictionary. Attach it to a submission from the record page.", recordId: result.recordId };
}
