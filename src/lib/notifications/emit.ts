import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { NOTIFICATION_KIND_META } from "./labels";
import type { NotificationKind } from "./types";

/*
 * Notification writes (PR D). Called only from workflow and message commands,
 * inside the same interactive transaction as the step that caused them.
 *
 * Failure handling (decided Nov 16, docs/notifications/failure-handling.md):
 * notifications are BEST-EFFORT INSIDE THE TRANSACTION. The writes run behind a
 * SAVEPOINT. If anything in them fails (missing table, bad row, constraint), the
 * savepoint is rolled back, the error is logged without row data, and the
 * workflow step commits exactly as it would have without notifications. A
 * notification can never exist without its step (it commits or rolls back with
 * it), and a notification problem can never stop a submission or a review.
 *
 * Duplicates: every row has a dedupeKey that is unique per recipient. One-off
 * events use the id of the row the step created (round:<id>, decision:<id>,
 * record-check:<id>, cycle:<id>), inserted with ON CONFLICT DO NOTHING, so a
 * replay or retry writes nothing new. Messages use conversation:<id> and re-arm
 * the same row (unread again, eventCount + 1).
 */

export type NotificationDraft = {
  recipientId: string;
  kind: NotificationKind;
  dedupeKey: string;
  title: string;
  body?: string | null;
  href: string;
  creativeId?: string | null;
  conversationId?: string | null;
  evidenceRecordId?: string | null;
};

export type NotificationBatch = {
  drafts: NotificationDraft[];
  /** Re-arm an existing row with the same key instead of ignoring it (message threads). */
  coalesce?: boolean;
};

export type NotifyOutcome = { written: number; failed: boolean };

const HREF = /^\/(dashboard|admin)(\/[A-Za-z0-9_-]+)*(\?[A-Za-z0-9_=&-]+)?$/;
const TITLE_MAX = 200;
const BODY_MAX = 300;

/** Relative, own-app paths only: never an external or scheme URL. */
export function isSafeHref(href: string): boolean {
  return HREF.test(href);
}

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Applies the actor rule, href rule and length limits. Pure, for tests. */
export function prepareDrafts(drafts: NotificationDraft[], actorId: string): NotificationDraft[] {
  const seen = new Set<string>();
  const out: NotificationDraft[] = [];
  for (const d of drafts) {
    if (!d.recipientId || d.recipientId === actorId) continue; // never notify the person who acted
    if (!isSafeHref(d.href)) continue;
    const key = `${d.recipientId}\u0000${d.dedupeKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...d, title: clip(d.title.trim(), TITLE_MAX), body: d.body ? clip(d.body.trim(), BODY_MAX) : null });
  }
  return out;
}

async function mutedPairs(tx: Prisma.TransactionClient, drafts: NotificationDraft[]) {
  const mutableKinds = [...new Set(drafts.map((d) => d.kind))].filter((k) => NOTIFICATION_KIND_META[k].mutable);
  if (!mutableKinds.length) return new Set<string>();
  const rows = await tx.notificationPreference.findMany({
    where: { userId: { in: [...new Set(drafts.map((d) => d.recipientId))] }, kind: { in: mutableKinds }, inApp: false },
    select: { userId: true, kind: true },
  });
  return new Set(rows.map((r) => `${r.userId}\u0000${r.kind}`));
}

/**
 * Builds and writes notifications for one workflow step, best-effort (see top).
 * `build` runs inside the savepoint too, so a failing recipient lookup is
 * contained as well. Returns what happened, for logs and tests only.
 */
export async function notifySafely(
  tx: Prisma.TransactionClient,
  label: string,
  actorId: string,
  build: (tx: Prisma.TransactionClient) => Promise<NotificationBatch>,
): Promise<NotifyOutcome> {
  await tx.$executeRaw`SAVEPOINT clyntique_notify`;
  try {
    const batch = await build(tx);
    const prepared = prepareDrafts(batch.drafts, actorId);
    let written = 0;
    if (prepared.length) {
      const muted = await mutedPairs(tx, prepared);
      const rows = prepared.filter((d) => !muted.has(`${d.recipientId}\u0000${d.kind}`));
      if (batch.coalesce) {
        for (const d of rows) {
          written += await tx.$executeRaw`
            INSERT INTO "Notification" ("id", "recipientId", "kind", "dedupeKey", "title", "body", "href", "creativeId", "conversationId", "evidenceRecordId", "eventCount", "createdAt", "readAt")
            VALUES (${randomUUID()}, ${d.recipientId}, CAST(${d.kind} AS "NotificationKind"), ${d.dedupeKey}, ${d.title}, ${d.body ?? null}, ${d.href}, ${d.creativeId ?? null}, ${d.conversationId ?? null}, ${d.evidenceRecordId ?? null}, 1, CURRENT_TIMESTAMP, NULL)
            ON CONFLICT ("recipientId", "dedupeKey") DO UPDATE SET
              "eventCount" = CASE WHEN "Notification"."readAt" IS NULL THEN "Notification"."eventCount" + 1 ELSE 1 END,
              "readAt" = NULL,
              "createdAt" = EXCLUDED."createdAt",
              "title" = EXCLUDED."title",
              "body" = EXCLUDED."body"`;
        }
      } else if (rows.length) {
        const result = await tx.notification.createMany({
          data: rows.map((d) => ({
            recipientId: d.recipientId,
            kind: d.kind,
            dedupeKey: d.dedupeKey,
            title: d.title,
            body: d.body ?? null,
            href: d.href,
            creativeId: d.creativeId ?? null,
            conversationId: d.conversationId ?? null,
            evidenceRecordId: d.evidenceRecordId ?? null,
          })),
          skipDuplicates: true,
        });
        written = result.count;
      }
    }
    await tx.$executeRaw`RELEASE SAVEPOINT clyntique_notify`;
    return { written, failed: false };
  } catch (error) {
    try {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT clyntique_notify`;
    } catch {
      // The connection itself failed: the step's own next statement will surface it.
    }
    console.error(`notifications: ${label} skipped`, error instanceof Error ? error.name : "unknown error");
    return { written: 0, failed: true };
  }
}
