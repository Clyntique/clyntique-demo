import "server-only";
import type { CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { ensureConversation, findAccessibleConversation, otherRole, resolveSubject } from "./access";
import { MESSAGE_MAX_LENGTH } from "./limits";

/*
 * Reviewer chat writes. Deliberately imports nothing from the review workflow
 * (src/lib/workflow, src/lib/review): sending or reading a message can never
 * change a submission's status, findings, decisions or evidence, and writes no
 * project Activity entry. Official decisions stay in the review workflow.
 */

const SEND_LIMIT = 15; // messages per user per minute
const SEND_WINDOW_MS = 60_000;

export type PostMessageInput = {
  /** Existing conversation. Required for TEAM. */
  conversationId?: string | null;
  /** CLIENT starting or continuing a conversation about a submission ("" = General). */
  creativeId?: string | null;
  body: string;
};

export type PostMessageResult =
  | { ok: true; conversationId: string; messageId: string }
  | { ok: false; error: string };

export function cleanBody(raw: unknown): { ok: true; body: string } | { ok: false; error: string } {
  const body = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (!body) return { ok: false, error: "Write a message first." };
  if (body.length > MESSAGE_MAX_LENGTH) return { ok: false, error: `Messages can be up to ${MESSAGE_MAX_LENGTH.toLocaleString("en-US")} characters.` };
  return { ok: true, body };
}

export async function postMessage(user: CurrentUser, input: PostMessageInput): Promise<PostMessageResult> {
  const cleaned = cleanBody(input.body);
  if (!cleaned.ok) return cleaned;

  let conversationId: string;
  if (input.conversationId) {
    const found = await findAccessibleConversation(user, input.conversationId);
    if (!found) return { ok: false, error: "This conversation could not be found." };
    conversationId = found.id;
  } else if (user.role === "CLIENT") {
    // Continue the existing conversation for this subject, or open it (never a duplicate).
    const subject = await resolveSubject(user, input.creativeId);
    conversationId = (await ensureConversation(user, subject)).id;
  } else {
    return { ok: false, error: "Open a conversation to reply." };
  }

  const recent = await prisma.message.count({ where: { senderId: user.id, createdAt: { gte: new Date(Date.now() - SEND_WINDOW_MS) } } });
  if (recent >= SEND_LIMIT) return { ok: false, error: "You're sending messages too quickly. Please wait a moment." };

  const now = new Date();
  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: { conversationId, senderId: user.id, senderRole: user.role, body: cleaned.body, createdAt: now },
      select: { id: true },
    }),
    prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now }, select: { id: true } }),
  ]);
  return { ok: true, conversationId, messageId: message.id };
}

/** Marks the other side's unread messages in a conversation as read. */
export async function markConversationRead(user: CurrentUser, conversationId: string): Promise<{ ok: boolean; marked: number }> {
  const found = await findAccessibleConversation(user, conversationId);
  if (!found) return { ok: false, marked: 0 };
  const result = await prisma.message.updateMany({
    where: { conversationId: found.id, readAt: null, senderRole: otherRole(user.role) },
    data: { readAt: new Date(), readById: user.id },
  });
  return { ok: true, marked: result.count };
}
