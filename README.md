# Clyntique

Collaborative creative/ad review platform. Next.js 16 (App Router), TypeScript, Tailwind CSS, Prisma 7 + PostgreSQL.

## Local setup

1. `npm install` (also generates the Prisma client)
2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL`: PostgreSQL connection string. For Render, use the **External** Database URL.
   - `SESSION_SECRET`: at least 32 random characters (see the command in `.env.example`).
3. `npm run db:check` checks the database connection and lists tables.
4. Schema: for a **new, empty database of your own**, run `npx prisma migrate deploy` (applies
   `prisma/migrations` from the `0_init` baseline). **Never run `db push`, `migrate dev` or
   `migrate reset` against the shared Render database**; its migration steps need operator approval
   (`docs/audit/m1a-report.md`).
5. Create the demo accounts (see below).
6. `npm run dev` and open http://localhost:3000.

`.env` is git-ignored. Never commit it.

## Demo users (development only)

Fictional accounts: `team@clyntique.demo` (TEAM), `client@clyntique.demo` (CLIENT) and, optionally,
`client2@clyntique.demo` (a second CLIENT for cross-client isolation checks). **Passwords are not
documented anywhere**; you choose them when seeding. Earlier versions of this README published demo
passwords. Those are refused by the seed and must be rotated wherever they were used (see
`docs/audit/m0-operator-steps.md`).

The seed (`prisma/seed.ts`, rules in `prisma/seed-plan.ts`) is safe by default:

- `npm run db:seed` is a **dry run**: it lists what it would do and writes nothing.
- `--apply` creates **missing** demo accounts only. Existing accounts are never modified.
- `--apply --rotate` also replaces the passwords of the listed demo accounts (same email and role only).
- Any write requires `SEED_CONFIRM_DATABASE` to equal the database name in `DATABASE_URL`.
- Passwords come only from `SEED_TEAM_PASSWORD`, `SEED_CLIENT_PASSWORD` and the optional
  `SEED_CLIENT2_PASSWORD` (at least 12 characters, never a previously published password).
- It refuses to run with `NODE_ENV=production` and never prints passwords or connection strings.

```bash
npx tsx prisma/seed.ts --apply
```

## Routes

- `/auth/login`: email/password sign-in. TEAM users land on `/admin`, CLIENT users on `/dashboard`.
- `/admin`, `/admin/projects`, `/admin/creatives`, `/admin/activity`: TEAM shell. Other roles are redirected to `/dashboard`.
- `/dashboard`, `/dashboard/projects`, `/dashboard/creatives`, `/dashboard/activity`: CLIENT shell. TEAM users are redirected to `/admin`.

- `/admin/projects/new`, `/admin/projects/[projectId]`, `/admin/projects/[projectId]/creatives/new`: TEAM project detail and creation.
- `/dashboard/projects/[projectId]`: CLIENT project detail (own projects only; anything else returns 404).

All workspace data comes from PostgreSQL through `src/lib/data/workspace.ts`, which scopes every
query to the signed-in user: TEAM sees everything, CLIENT sees only their own projects and never
DRAFT creatives. Mutations live in `src/app/admin/projects/actions.ts` and re-check the TEAM role
on the server.

If a Prisma CLI command (e.g. an operator-approved `migrate` step) fails with P1001 against Render
while `npm run db:check` works, run that one command with `sslmode=require` in place of
`sslmode=verify-full` in the connection URL.

Auth is a signed (HS256 JWT), httpOnly session cookie. `src/proxy.ts` does early redirects;
the authoritative checks are in `src/lib/auth/dal.ts` (`requireUser`, `requireRole`), which
re-load the user from the database on every protected request.

## Creative review (Phase 4)

Review page: `/admin/creatives/[creativeId]` (TEAM) and `/dashboard/creatives/[creativeId]` (CLIENT).

**File storage: Vercel Blob, private store.** Create a *private* Blob store (access mode cannot be changed
later), connect it to the Vercel project, and set these variable names (values are never committed):

| Variable                                  | Purpose                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `BLOB_READ_WRITE_TOKEN`                   | Required. Signs browser upload tokens and reads/deletes blobs.           |
| `BLOB_STORE_ID` / `VERCEL_OIDC_TOKEN`     | Added by Vercel when the store is connected; used by the SDK on Vercel.  |
| `CREATIVE_MAX_IMAGE_MB`, `CREATIVE_MAX_VIDEO_MB` | Optional limits (defaults 15 and 100; hard ceilings 50 and 500). |

Locally, run `vercel env pull` (include the Development environment on the store connection).
Without a token, the page works but shows "File uploads aren't set up" instead of the uploader.

Files are private: blob URLs are not publicly readable. The browser loads them through
`/api/media/[versionId]`, which re-checks the session and creative access on every request.
Uploads go browser → Blob using short-lived tokens issued by `/api/creatives/upload` (TEAM only,
fixed path and content type, size capped). A file only becomes a version after `finalizeVersion`
verifies its path, size, content type and leading bytes.

Formats: JPEG, PNG, WebP, MP4, WebM. Abandoned uploads (never saved as a version) can be listed with
`npm run blob:orphans` and removed with `npm run blob:orphans -- --delete`; only files older than
24 hours and not referenced by any version are touched.

Revision rules: a new version while a creative is shared sets it back to *In Review*; earlier
approvals stay in history on the version they were made on. If a client submits a decision on a
version that is no longer the newest, it is rejected and they are asked to review the new one.
Drafts stay drafts until the team shares them.

## Scripts

| Script             | Purpose                                       |
| ------------------ | --------------------------------------------- |
| `npm run dev`      | Development server                            |
| `npm run build`    | Generate Prisma client and build              |
| `npm run lint`     | ESLint                                        |
| `npm run db:check` | Test the DB connection (read-only)            |
| `npm run db:push`  | Legacy: never against the shared database     |
| `npm run db:seed`  | Demo users: dry run (see "Demo users")        |
| `npm test`         | Unit tests (Vitest; mocked, no DB or Blob)    |
| `npm run blob:orphans` | List (or delete) unreferenced Blob uploads |
