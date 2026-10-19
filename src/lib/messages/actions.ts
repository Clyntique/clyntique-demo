"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { markConversationRead, postMessage } from "./commands";

/*
 * Form actions for reviewer chat. Thin wrappers: each one re-loads the user
 * from the database, then calls the command, which checks the conversation
 * scope and validates. Nothing from the browser is trusted.
 */

export type MessageFormState =
  | {
      ok?: boolean;
      error?: string;
      /** Echoed so a failed send keeps what was typed. */
      body?: string;
      /** Bumped after each successful send, so the form can clear itself. */
      sent?: number;
      conversationId?: string;
    }
  | undefined;

function revalidateChat() {
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
}

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function sendMessageAction(prev: MessageFormState, formData: FormData): Promise<MessageFormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Your session has ended. Please sign in again.", body: text(formData, "body") };

  const body = text(formData, "body");
  const result = await postMessage(user, {
    conversationId: text(formData, "conversationId") || null,
    creativeId: text(formData, "creativeId") || null,
    body,
  });
  if (!result.ok) return { error: result.error, body };

  revalidateChat();
  return { ok: true, sent: (prev?.sent ?? 0) + 1, conversationId: result.conversationId };
}

/** Called when a conversation is opened, to mark the other side's messages as read. */
export async function markReadAction(conversationId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || typeof conversationId !== "string") return;
  const result = await markConversationRead(user, conversationId);
  if (result.marked > 0) revalidateChat();
}
