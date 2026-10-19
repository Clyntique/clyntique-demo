import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { creativeScope } from "@/lib/data/workspace";
import { prisma } from "@/lib/prisma";

/*
 * Authorization for reviewer chat, shared by pages, server actions and the
 * submission tab (the same idea as creativeScope / findAccessibleCreative):
 * - CLIENT: only their own conversations (clientId = them).
 * - TEAM: every conversation in the shared Team inbox, i.e. unassigned ones or
 *   ones assigned to them. MVP: nothing is assigned yet. When reviewers are
 *   assigned to clients or submissions, only this scope changes.
 * - Never a conversation about a submission the Team cannot see: a Team user
 *   only ever reaches conversations about submitted SUBMISSION_REVIEW work, so
 *   a client's draft (or earlier-workflow record) is never revealed by chat.
 * Anything outside the scope is "not found", for missing and forbidden alike.
 */

export const GENERAL_SUBJECT = "general";
export { MESSAGE_MAX_LENGTH } from "./limits";

/** The role whose messages count as "unread" for this role. */
export function otherRole(role: Role): Role {
  return role === "TEAM" ? "CLIENT" : "TEAM";
}

export function conversationScope(user: CurrentUser): Prisma.ConversationWhereInput {
  if (user.role === "CLIENT") return { clientId: user.id };
  return {
    AND: [
      { OR: [{ assignedReviewerId: null }, { assignedReviewerId: user.id }] },
      { OR: [{ creativeId: null }, { creative: { workflow: "SUBMISSION_REVIEW", rounds: { some: {} } } }] },
    ],
  };
}

/** Unread = sent by the other side and not opened yet. */
export function unreadMessageWhere(user: CurrentUser): Prisma.MessageWhereInput {
  return { readAt: null, senderRole: otherRole(user.role) };
}

export async function findAccessibleConversation(user: CurrentUser, conversationId: string) {
  if (!conversationId || typeof conversationId !== "string") return null;
  return prisma.conversation.findFirst({
    where: { AND: [{ id: conversationId }, conversationScope(user)] },
    select: { id: true, clientId: true, creativeId: true },
  });
}

export type ChatSubject = {
  /** Null = the General conversation. */
  creativeId: string | null;
  subjectKey: string;
  /** The client asked about a submission, but it goes to General (draft or earlier workflow). */
  fellBackToGeneral: boolean;
};

/**
 * Where a client's message about `requestedCreativeId` belongs. Only a
 * SUBMISSION_REVIEW submission that was submitted at least once has its own
 * conversation. A draft, an earlier-workflow creative or anything not theirs
 * falls back to General, so the Team never learns about private drafts.
 */
export async function resolveSubject(user: CurrentUser, requestedCreativeId?: string | null): Promise<ChatSubject> {
  const general: ChatSubject = { creativeId: null, subjectKey: GENERAL_SUBJECT, fellBackToGeneral: Boolean(requestedCreativeId) };
  if (user.role !== "CLIENT" || !requestedCreativeId || typeof requestedCreativeId !== "string") return general;
  const creative = await prisma.creative.findFirst({
    where: { AND: [{ id: requestedCreativeId }, creativeScope(user)] },
    select: { id: true, workflow: true, rounds: { take: 1, select: { id: true } } },
  });
  if (!creative || creative.workflow !== "SUBMISSION_REVIEW" || creative.rounds.length === 0) return general;
  return { creativeId: creative.id, subjectKey: creative.id, fellBackToGeneral: false };
}

/** The client's conversation for a subject: one per client and subject, race-safe. */
export async function ensureConversation(user: CurrentUser, subject: ChatSubject) {
  return prisma.conversation.upsert({
    where: { clientId_subjectKey: { clientId: user.id, subjectKey: subject.subjectKey } },
    create: { clientId: user.id, creativeId: subject.creativeId, subjectKey: subject.subjectKey },
    update: {},
    select: { id: true },
  });
}
