import "server-only";
import type { Role } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { basePathFor } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";
import { conversationScope, unreadMessageWhere } from "./access";

/*
 * Reviewer chat reads. Every query applies conversationScope(user); the
 * subject label shown to TEAM comes from the submitted snapshot of the
 * submission, never from the client's live (possibly unsubmitted) edits.
 */

export type ConversationRow = {
  id: string;
  /** "General" or the submission title as this viewer may see it. */
  subject: string;
  creativeId: string | null;
  /** Link to the submission, when the conversation is about one. */
  submissionHref: string | null;
  clientName: string;
  lastMessage: { body: string; senderRole: Role; createdAt: Date } | null;
  lastMessageAt: Date;
  unread: number;
};

export type ThreadMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: Role;
  body: string;
  createdAt: Date;
  readAt: Date | null;
  mine: boolean;
};

export type Thread = ConversationRow & { messages: ThreadMessage[] };

export type UnreadSummary = { conversations: number; messages: number };

const conversationSelect = (user: CurrentUser) =>
  ({
    id: true,
    creativeId: true,
    lastMessageAt: true,
    client: { select: { name: true } },
    creative: {
      select: {
        name: true,
        rounds: { orderBy: { submittedAt: "desc" }, take: 1, select: { submittedName: true } },
      },
    },
    messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, senderRole: true, createdAt: true } },
    _count: { select: { messages: { where: unreadMessageWhere(user) } } },
  }) as const;

type Row = Awaited<ReturnType<typeof loadRows>>[number];

function loadRows(user: CurrentUser, where: object, take: number) {
  return prisma.conversation.findMany({
    where: { AND: [conversationScope(user), where] },
    orderBy: { lastMessageAt: "desc" },
    take,
    select: conversationSelect(user),
  });
}

function toRow(user: CurrentUser, c: Row): ConversationRow {
  const team = user.role === "TEAM";
  const subject = !c.creativeId || !c.creative ? "General" : team ? (c.creative.rounds[0]?.submittedName ?? "Submission") : c.creative.name;
  return {
    id: c.id,
    subject,
    creativeId: c.creativeId,
    submissionHref: c.creativeId ? `${basePathFor(user.role)}/creatives/${c.creativeId}` : null,
    clientName: c.client.name,
    lastMessage: c.messages[0] ?? null,
    lastMessageAt: c.lastMessageAt,
    unread: c._count.messages,
  };
}

/** Unread counts for the nav badge and the overview card, in one query. */
export async function getUnreadSummary(user: CurrentUser): Promise<UnreadSummary> {
  const groups = await prisma.message.groupBy({
    by: ["conversationId"],
    where: { AND: [unreadMessageWhere(user), { conversation: conversationScope(user) }] },
    _count: { _all: true },
  });
  return { conversations: groups.length, messages: groups.reduce((n, g) => n + g._count._all, 0) };
}

/** Conversations with at least one message, unread first, then newest. */
export async function listConversations(user: CurrentUser, take = 100): Promise<ConversationRow[]> {
  const rows = await loadRows(user, { messages: { some: {} } }, take);
  return rows
    .map((c) => toRow(user, c))
    .sort((a, b) => (a.unread > 0 === b.unread > 0 ? b.lastMessageAt.getTime() - a.lastMessageAt.getTime() : a.unread > 0 ? -1 : 1));
}

export async function getThread(user: CurrentUser, conversationId: string): Promise<Thread | null> {
  const [row] = await loadRows(user, { id: conversationId }, 1);
  if (!row) return null;
  const messages = await prisma.message.findMany({
    where: { conversationId: row.id },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true, senderId: true, senderRole: true, body: true, createdAt: true, readAt: true, sender: { select: { name: true } } },
  });
  return {
    ...toRow(user, row),
    messages: messages.reverse().map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: m.sender.name,
      senderRole: m.senderRole,
      body: m.body,
      createdAt: m.createdAt,
      readAt: m.readAt,
      mine: m.senderId === user.id,
    })),
  };
}

/** The conversation about one submission, if it has any messages yet. */
export async function getSubmissionThread(user: CurrentUser, creativeId: string): Promise<Thread | null> {
  const [row] = await loadRows(user, { creativeId, subjectKey: creativeId }, 1);
  return row ? getThread(user, row.id) : null;
}

/** Submissions the client may start a conversation about: submitted ones only. */
export async function listChatSubjects(user: CurrentUser) {
  if (user.role !== "CLIENT") return [];
  return prisma.creative.findMany({
    where: { workflow: "SUBMISSION_REVIEW", project: { clientId: user.id }, rounds: { some: {} } },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, name: true },
  });
}
