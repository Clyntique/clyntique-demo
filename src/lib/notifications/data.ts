import "server-only";
import type { CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { NOTIFICATION_KIND_META, kindsFor } from "./labels";
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_PAGE_DEFAULT,
  NOTIFICATION_PAGE_MAX,
  type NotificationItem,
  type NotificationKind,
  type NotificationPage,
  type NotificationPreferenceRow,
} from "./types";

/*
 * Reads and writes for the signed-in viewer only. Every query is filtered by
 * recipientId = viewer; nothing here accepts another user's id. Missing tables
 * (code deployed before its migration) read as empty instead of failing a page.
 */

function missingTable(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code === "P2021" || code === "P2022";
}

/** For the header badge, computed during the normal page render (no polling). */
export async function unreadNotificationCount(user: CurrentUser): Promise<number> {
  try {
    return await prisma.notification.count({ where: { recipientId: user.id, readAt: null } });
  } catch (error) {
    if (missingTable(error)) return 0;
    throw error;
  }
}

function clampLimit(limit: unknown) {
  const n = Number(limit);
  if (!Number.isFinite(n)) return NOTIFICATION_PAGE_DEFAULT;
  return Math.min(NOTIFICATION_PAGE_MAX, Math.max(1, Math.floor(n)));
}

/** Newest first; unread and read together. Cursor = the last item's id. */
export async function listNotifications(user: CurrentUser, input: { cursor?: string | null; limit?: number } = {}): Promise<NotificationPage> {
  const limit = clampLimit(input.limit);
  const cursor = typeof input.cursor === "string" && input.cursor ? input.cursor : null;
  try {
    const [rows, unread] = await Promise.all([
      prisma.notification.findMany({
        where: { recipientId: user.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, kind: true, title: true, body: true, href: true, eventCount: true, createdAt: true, readAt: true, recipientId: true },
      }),
      prisma.notification.count({ where: { recipientId: user.id, readAt: null } }),
    ]);
    // A cursor that belongs to someone else yields their rows' position only, never their rows:
    // the where clause still limits rows to this viewer. Belt and braces:
    const own = rows.filter((r) => r.recipientId === user.id);
    const page = own.slice(0, limit);
    const items: NotificationItem[] = page.map((r) => ({
      id: r.id,
      kind: r.kind as NotificationKind,
      title: r.title,
      body: r.body,
      href: r.href,
      eventCount: r.eventCount,
      createdAt: r.createdAt.toISOString(),
      read: r.readAt !== null,
    }));
    return { items, unread, nextCursor: own.length > limit ? page[page.length - 1].id : null };
  } catch (error) {
    if (missingTable(error)) return { items: [], unread: 0, nextCursor: null };
    // An unknown cursor id (P2025) is just "no more pages".
    if ((error as { code?: string } | null)?.code === "P2025") return { items: [], unread: await unreadNotificationCount(user), nextCursor: null };
    throw error;
  }
}

export async function markRead(user: CurrentUser, id: unknown): Promise<number> {
  if (typeof id !== "string" || !id) return 0;
  const { count } = await prisma.notification.updateMany({ where: { id, recipientId: user.id, readAt: null }, data: { readAt: new Date() } });
  return count;
}

export async function markAllRead(user: CurrentUser): Promise<number> {
  const { count } = await prisma.notification.updateMany({ where: { recipientId: user.id, readAt: null }, data: { readAt: new Date() } });
  return count;
}

/** Opening a conversation clears its message notification for this viewer. Best-effort: never fails the read. */
export async function markConversationNotificationsRead(userId: string, conversationId: string): Promise<number> {
  try {
    const { count } = await prisma.notification.updateMany({ where: { recipientId: userId, conversationId, readAt: null }, data: { readAt: new Date() } });
    return count;
  } catch (error) {
    if (!missingTable(error)) console.error("notifications: conversation read skipped", error instanceof Error ? error.name : "unknown error");
    return 0;
  }
}

export async function preferencesFor(user: CurrentUser): Promise<NotificationPreferenceRow[]> {
  const kinds = kindsFor(user.role);
  let rows: { kind: string; inApp: boolean }[] = [];
  try {
    rows = await prisma.notificationPreference.findMany({ where: { userId: user.id }, select: { kind: true, inApp: true } });
  } catch (error) {
    if (!missingTable(error)) throw error;
  }
  const saved = new Map(rows.map((r) => [r.kind, r.inApp]));
  return kinds.map((kind) => {
    const meta = NOTIFICATION_KIND_META[kind];
    return { kind, label: meta.label, mutable: meta.mutable, inApp: meta.mutable ? (saved.get(kind) ?? true) : true };
  });
}

export type PreferenceInput = { kind: unknown; inApp: unknown };

/** Validates against this role's mutable kinds; required kinds and other roles' kinds are refused. */
export function validatePreferences(role: CurrentUser["role"], input: unknown): { ok: true; rows: { kind: NotificationKind; inApp: boolean }[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length > NOTIFICATION_KINDS.length) return { ok: false, error: "Choose your notification settings again." };
  const allowed = new Set(kindsFor(role).filter((k) => NOTIFICATION_KIND_META[k].mutable));
  const rows: { kind: NotificationKind; inApp: boolean }[] = [];
  for (const item of input as PreferenceInput[]) {
    const kind = item?.kind as NotificationKind;
    if (!allowed.has(kind) || typeof item?.inApp !== "boolean") return { ok: false, error: "This notification setting can't be changed." };
    rows.push({ kind, inApp: item.inApp });
  }
  return { ok: true, rows };
}

export async function savePreferences(user: CurrentUser, rows: { kind: NotificationKind; inApp: boolean }[]) {
  await prisma.$transaction(
    rows.map((r) =>
      prisma.notificationPreference.upsert({
        where: { userId_kind: { userId: user.id, kind: r.kind } },
        create: { userId: user.id, kind: r.kind, inApp: r.inApp },
        update: { inApp: r.inApp },
      }),
    ),
  );
}
