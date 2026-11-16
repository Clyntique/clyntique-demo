// Shared notification interface (PR D, Nov 16, 2026).
//
// The agreed contract between the backend (Claude Code: src/lib/notifications,
// workflow hooks, database) and the dashboard UI (Antigravity: notification
// bell, dropdown, optional full page and Profile preferences). Changing a type
// here is an interface change: agree it with the other side first.
// This file holds types and constants only, so client components may import it.

export const NOTIFICATION_KINDS = [
  "SUBMISSION_RECEIVED",
  "RESUBMISSION_RECEIVED",
  "REVIEW_STARTED",
  "CHANGES_REQUESTED",
  "REVIEW_COMPLETED",
  "REVIEW_REOPENED",
  "NEW_MESSAGE",
  "EVIDENCE_REVIEWED",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  /** Already worded for this viewer. Render as plain text, never as HTML. */
  title: string;
  body: string | null;
  /** Relative link built on the server; starts with /dashboard or /admin. Never build links on the client. */
  href: string;
  /** More than 1 for a message thread ("3 new messages"). */
  eventCount: number;
  /** ISO 8601. */
  createdAt: string;
  read: boolean;
};

export type NotificationPage = {
  items: NotificationItem[];
  /** The viewer's unread total (not only this page). */
  unread: number;
  /** Pass back as `cursor` for the next page; null on the last page. */
  nextCursor: string | null;
};

export type NotificationPreferenceRow = {
  kind: NotificationKind;
  label: string;
  inApp: boolean;
  /** false = required (always on); show it locked. */
  mutable: boolean;
};

export type NotificationActionResult = { ok: true; unread: number } | { ok: false; error: string };

export type SavePreferencesResult = { ok: true } | { ok: false; error: string };

/** Props of the dashboard bell. `unread` comes from the server render; AutoRefresh keeps it current. */
export type NotificationBellProps = {
  role: "TEAM" | "CLIENT";
  unread: number;
};

export const NOTIFICATION_PAGE_DEFAULT = 10;
export const NOTIFICATION_PAGE_MAX = 50;
