# Antigravity handoff: search fix and notification bell (Nov 16, 2026)

The exact, agreed interface is `src/lib/notifications/types.ts` on branch `feature/notifications`. If this note and that file ever disagree, the file wins.

Two items touch dashboard files Antigravity owns. Please read before your next change to the header, bell or search.

## 1. Search privacy fix: PR #32 (merged and live Nov 16, 17:41 UTC, main `ec26917`)

https://github.com/Clyntique/clyntique-demo/pull/32. Rebase any local branch that touches search onto main `ec26917` or later.

Changed only `src/lib/search/actions.ts` and added `tests/global-search-privacy.test.ts`. The command palette, header and `types.ts` are untouched, and the `SearchResponse` shape is unchanged.

- Team evidence results now go through `teamMaySeeRecord`. The query selects `ownerClientId` and `attachments`.
- Team creative results match and display the latest `SubmissionRound` snapshot (`submittedName`, `submittedDescription`), never the live `Creative.name` or `description`.
- Client policy results load only the ACTIVE + VERIFIED version.
- Team creative and evidence groups fetch 12 rows and return at most 4.

If your local branch also edits `src/lib/search/actions.ts`, rebase onto main first, or the leak comes back. Rules to keep:

- Team never sees client text that has not been submitted.
- Team creative titles come from the round snapshot.
- Evidence records shown to Team must pass `teamMaySeeRecord`.

## 2. Notification bell: interface for PR D (architecture approved by the CEO Nov 16; backend on `feature/notifications`)

Claude Code owns the backend: `src/lib/notifications/*`, the migration, the workflow hooks and the tests. Antigravity owns the UI: `notification-bell.tsx`, `dashboard-header.tsx`, `app-shell.tsx`, the optional full page and the optional Profile preferences section. Neither side edits the other's files.

### Unread count for the header

In `app-shell.tsx`, call `unreadNotificationCount(user)` from `@/lib/notifications` (server-only), for example next to `navCounts`, and pass the result to `DashboardHeader`, then to `NotificationBell` as `unread`. It returns 0 instead of an error if the tables don't exist yet.

### Types (`src/lib/notifications/types.ts`; summary, the file is authoritative)

```ts
export type NotificationKind =
  | "SUBMISSION_RECEIVED" | "RESUBMISSION_RECEIVED" | "REVIEW_STARTED"
  | "CHANGES_REQUESTED" | "REVIEW_COMPLETED" | "REVIEW_REOPENED"
  | "NEW_MESSAGE" | "EVIDENCE_REVIEWED";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;          // already worded for this viewer; render as plain text
  body: string | null;
  href: string;           // relative, starts with /dashboard or /admin
  eventCount: number;     // > 1 for a message thread ("3 new messages")
  createdAt: string;      // ISO
  read: boolean;
};

export type NotificationPage = { items: NotificationItem[]; unread: number; nextCursor: string | null };

export type NotificationPreferenceRow = { kind: NotificationKind; label: string; inApp: boolean; mutable: boolean };
```

### Server actions (`src/lib/notifications/actions.ts`)

```ts
getNotifications(input?: { cursor?: string; limit?: number }): Promise<NotificationPage> // limit 1–50, default 10
markNotificationRead(id: string): Promise<NotificationActionResult>      // { ok: true; unread } | { ok: false; error }
markAllNotificationsRead(): Promise<NotificationActionResult>
getNotificationPreferences(): Promise<NotificationPreferenceRow[]>
saveNotificationPreferences(input: { kind: NotificationKind; inApp: boolean }[]): Promise<SavePreferencesResult>
```

Each action uses the signed-in user only and never takes a user id.

### Bell props

```ts
NotificationBell({ role, unread }: NotificationBellProps)   // from types.ts
```

- `unread` arrives from the server render. The 30-second AutoRefresh updates it, so no polling inside the bell.
- Badge: show `unread` (cap the display at "9+"), with `aria-label="Notifications, N unread"`.
- When the bell opens, call `getNotifications({ limit: 10 })`.
- Clicking an item: call `markNotificationRead(id)`, then navigate to `href`.
- "Mark all as read" calls `markAllNotificationsRead()`.
- Empty state: keep "You're all caught up".
- Keep the "View full activity log" link. Add "See all notifications" only if you build `/dashboard/notifications` and `/admin/notifications`.
- Render `title` and `body` as text, never as HTML. Never build hrefs on the client.
- Preferences (optional for v1): a section on the Profile page listing `getNotificationPreferences()` rows. A row with `mutable: false` (changes requested, review completed) shows as locked on.

### Test hooks

Please keep `aria-label`s stable and add `data-testid="notification-item"` and `data-testid="notification-mark-all"` for the browser walkthrough.
