# Notifications: failure handling (PR D, Nov 16, 2026)

**Decision: best-effort inside the transaction.** A notification can never block a submission, a review decision or a message. A notification can also never exist without the step that caused it.

## How it works

Each workflow step already runs in one database transaction, behind a guarded status update (`src/lib/workflow/commands.ts`). After the step's own writes, it calls one notifier from `src/lib/notifications/events.ts`. The notifier calls `notifySafely` in `src/lib/notifications/emit.ts`, which does this:

1. `SAVEPOINT clyntique_notify`
2. Looks up the recipients, applies preferences, builds the rows and inserts them with `ON CONFLICT DO NOTHING`. Message threads use `ON CONFLICT DO UPDATE`, which re-arms the row.
3. On success, `RELEASE SAVEPOINT`.
4. On any error, `ROLLBACK TO SAVEPOINT`, then logs `notifications: <step> skipped` with the error name only, never row data. Then it returns normally.

The step then commits exactly as it would without notifications. If the step itself fails or is refused, for example when another reviewer started first, the whole transaction rolls back and its notifications go with it.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Fail the step when its notification fails | A notification bug or a missing table would stop clients from submitting. That is not acceptable for a pilot. |
| Write notifications after the commit | A crash between the two writes loses the notification, and a retry could duplicate it. It also needs an outbox or a background job. |
| Outbox table plus a worker | Needs a scheduler. PR D avoids background processes. |

## What is accepted

- If a notification write fails, that one notification is lost. The workflow record (Activity, decision, round) still exists and is visible on the item's page. The error is logged.
- If the connection itself fails during the savepoint rollback, the step fails with its normal "Something went wrong" message, as it would for any database outage.

## Tests

- `tests/notifications.test.ts`, "failure handling": savepoint and release order; rollback with no throw; a failing recipient lookup is contained; `submitForReview` and `startReview` still return `ok` when the notification write rejects; a refused step writes no notification.
- `scripts/rehearse-notifications-pg.ts`, run with `npm run db:rehearse-notifications`, on real PostgreSQL: a foreign-key failure inside notify leaves the step's writes before and after it committed, with no partial rows. With the tables missing, as when code ships ahead of its migration, the step still commits.
