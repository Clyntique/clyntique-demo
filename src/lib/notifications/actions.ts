"use server";

import { getCurrentUser } from "@/lib/auth/dal";
import { listNotifications, markAllRead, markRead, preferencesFor, savePreferences, unreadNotificationCount, validatePreferences } from "./data";
import type { NotificationActionResult, NotificationPage, NotificationPreferenceRow, SavePreferencesResult } from "./types";

// Server actions for the notification bell (Antigravity UI). Each one acts for
// the signed-in user only and never takes a user id from the browser.

const SIGNED_OUT = "Sign in again to see your notifications.";

export async function getNotifications(input?: { cursor?: string; limit?: number }): Promise<NotificationPage> {
  const user = await getCurrentUser();
  if (!user) return { items: [], unread: 0, nextCursor: null };
  return listNotifications(user, { cursor: input?.cursor ?? null, limit: input?.limit });
}

export async function markNotificationRead(id: string): Promise<NotificationActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SIGNED_OUT };
  await markRead(user, id);
  // Same answer whether the id was theirs, someone else's or unknown.
  return { ok: true, unread: await unreadNotificationCount(user) };
}

export async function markAllNotificationsRead(): Promise<NotificationActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SIGNED_OUT };
  await markAllRead(user);
  return { ok: true, unread: 0 };
}

export async function getNotificationPreferences(): Promise<NotificationPreferenceRow[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return preferencesFor(user);
}

export async function saveNotificationPreferences(input: { kind: string; inApp: boolean }[]): Promise<SavePreferencesResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: SIGNED_OUT };
  if (user.demoSession) return { ok: false, error: "Settings can't be changed in a demo session." };
  const valid = validatePreferences(user.role, input);
  if (!valid.ok) return valid;
  try {
    await savePreferences(user, valid.rows);
    return { ok: true };
  } catch {
    return { ok: false, error: "Your settings could not be saved. Please try again." };
  }
}
