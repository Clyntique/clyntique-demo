# Clyntique

Collaborative creative/ad review platform. Next.js 16 (App Router), TypeScript, Tailwind CSS, Prisma 7 + PostgreSQL.

## Local setup

1. `npm install` (also generates the Prisma client)
2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL`: PostgreSQL connection string. For Render, use the **External** Database URL.
   - `SESSION_SECRET`: at least 32 random characters (see the command in `.env.example`).
3. `npm run db:check` checks the database connection and lists tables.
4. `npm run db:push` creates/updates the tables from `prisma/schema.prisma`.
5. `npm run db:seed` creates the demo users (safe to re-run; refuses to run with `NODE_ENV=production`).
6. `npm run dev` and open http://localhost:3000.

`.env` is git-ignored. Never commit it.

## Demo users (development only)

Fictional accounts created by `npm run db:seed`. These passwords are for local development only.

| Role   | Name           | Email                   | Password               |
| ------ | -------------- | ----------------------- | ---------------------- |
| TEAM   | Clyntique Team | `team@clyntique.demo`   | `clyntique-team-dev`   |
| CLIENT | Alex Morgan    | `client@clyntique.demo` | `clyntique-client-dev` |

## Routes

- `/auth/login`: email/password sign-in. TEAM users land on `/admin`, CLIENT users on `/dashboard`.
- `/admin`, `/admin/projects`, `/admin/creatives`, `/admin/activity`: TEAM shell. Other roles are redirected to `/dashboard`.
- `/dashboard`, `/dashboard/projects`, `/dashboard/creatives`, `/dashboard/activity`: CLIENT shell. TEAM users are redirected to `/admin`.

Dashboard, project, creative, and activity pages currently show static sample data from
`src/lib/demo-data.ts` (labelled as sample data in the UI). Nothing there is read from or
written to the database yet.

Auth is a signed (HS256 JWT), httpOnly session cookie. `src/proxy.ts` does early redirects;
the authoritative checks are in `src/lib/auth/dal.ts` (`requireUser`, `requireRole`), which
re-load the user from the database on every protected request.

## Scripts

| Script             | Purpose                                       |
| ------------------ | --------------------------------------------- |
| `npm run dev`      | Development server                            |
| `npm run build`    | Generate Prisma client and build              |
| `npm run lint`     | ESLint                                        |
| `npm run db:check` | Test the DB connection (read-only)            |
| `npm run db:push`  | Sync the schema to the database               |
| `npm run db:seed`  | Create/update the demo users                  |
