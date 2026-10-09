# Clyntique — Current Workflows (implemented behaviour only)

This describes what the code does today, read from the source files named in each step. "Verified" means I observed it in a browser or by query during Phase 4 or this audit; "code-read only" means I traced the code but did not exercise it. Anything depending on a real Vercel Blob store is **unverified** because no Blob credentials were available (see GAPS-U1).

## 0. Accounts and sign-in

- Two accounts exist in the database: a TEAM user and a CLIENT user (created by `prisma/seed.ts`; documented in `README.md`). There is no sign-up, invitation, password reset, or user-management screen. `seed.ts` refuses to run when `NODE_ENV=production`.
- `/auth/login` (email + password) → `login` in `src/app/auth/actions.ts` → signed 7-day JWT cookie (`clyntique_session`, httpOnly, sameSite=lax, secure in production). TEAM lands on `/admin`, CLIENT on `/dashboard`. Verified.
- Wrong-role URLs redirect to the user's own area (`src/proxy.ts` early, `requireRole` in `src/lib/auth/dal.ts` authoritatively). Verified in Phase 3 and this phase.

## 1. Client workflow

### What a client can create or submit
Exactly three things, all on the review page (`/dashboard/creatives/[creativeId]`):
1. A **comment** on a specific version (`addComment`, up to 4,000 characters).
2. An **approval** of the current version (`submitDecision`, decision `APPROVED`).
3. A **change request** on the current version, with a required written reason (10–2,000 characters).

A client **cannot**: create projects or creatives, upload files, add or edit evidence, edit or delete comments, change or retract a decision, or see anything that is a draft. There is no client-facing form for submitting evidence, responding to findings, or supplying materials. Those capabilities do not exist in the code.

### Pages a client can open
`/dashboard` (stats: projects, awaiting your review, approved; "Waiting for your review" list; projects table; recent activity), `/dashboard/projects` (search), `/dashboard/projects/[projectId]`, `/dashboard/creatives` (filter tabs: All, Needs your review, Changes Requested, Approved), `/dashboard/creatives/[creativeId]`, `/dashboard/activity`. Details in the Feature Inventory page table.

### What the client sees on the review page
Title, project, status badge, "V# current" badge, format/ratio, media type, last-updated time, a role-specific status banner ("V2 is ready for your review", "You requested changes. The team is working on the next version.", "You approved V3."), the file preview (image or native video player), file name/size/uploader/time and the version's change notes, the version history panel with a Current badge and the latest decision badge per version, campaign context, "About this creative", evidence items (type, date, title, description, source, safe external link), and the feedback thread for the selected version (comments plus decision entries). Older versions are opened with `?v=N`; the page then explains it is an earlier version and links to the current one.

### What happens after a client acts (all verified in a browser against real data unless noted)
- **Comment:** stored on the selected version; shown in that version's thread; bumps the creative's `updatedAt`; writes a `FEEDBACK_RECEIVED` activity row ("Feedback on “…” (V1)"). Identical text from the same user on the same version within 15 seconds is silently treated as a double submit (shows "Comment posted." but stores once).
- **Approve:** one atomic update requires status `IN_REVIEW`, the client's own project, and that no newer version exists. On success: `Creative.status = APPROVED`, an `Approval` row for that version, a `CREATIVE_APPROVED` activity row. The UI shows "Approved. The team has been updated." The client then has no further action on that version.
- **Request changes:** same guard; requires the reason; status becomes `CHANGES_REQUESTED`; `Approval` row with `reason`; `CHANGES_REQUESTED` activity row.
- **Stale page:** if the team uploads a newer version while the client has the old one open, the client's decision is rejected with "The team uploaded V3 while you were reviewing. Please review the new version." Nothing is written. Verified.
- **After a request for changes**, the client has no controls until the team uploads a new version, which resets the status to `IN_REVIEW`. The client's earlier change-request text is visible only on the earlier version's thread (opened through the version panel); the new version's thread starts empty. The client cannot tell the team "addressed / not addressed" other than by commenting.
- There is no notification (email, in-app, or real-time). Clients and team learn of changes by opening the app or reloading.

## 2. Team / admin workflow

### Setting up work
1. **Create a project** (`/admin/projects/new` → `createProject`): name (2–120), client (must be an existing CLIENT user), optional description. Writes a "Project created" activity row. Redirects to the project page. Verified in Phase 3.
2. **Assign a client:** only at project creation, from the list of existing CLIENT users. No later reassignment; no way to create new client users from the UI.
3. **Create a creative** (`/admin/projects/[projectId]/creatives/new` → `createCreative`): name, format (Story/Feed/Static/Video), optional description and campaign context. It is **always created as a DRAFT** with no file and no activity entry. Redirects to the new review page. Verified.

### Preparing a creative (review page `/admin/creatives/[creativeId]`)
- **Upload a file** (`VersionUploader` → `/api/creatives/upload` token → direct browser upload to a private Blob store → `finalizeVersion`). Accepts JPEG, PNG, WebP (default max 15 MB) and MP4, WebM (default max 100 MB), shown in the uploader. The server rechecks role, creative, exact storage path, size, content type and the file's leading bytes before creating the version. **Unverified end to end** (no Blob credentials in this environment); the surrounding database logic was verified using directly inserted test versions.
- **Version numbers** go V1, V2, … per creative. Each upload may carry change notes (≤ 1,000 chars).
- **Edit details** (title, format, description, campaign context) in the "Creative details" panel.
- **Evidence** (TEAM only): add, edit, remove (remove asks for confirmation). Fields: title, type, description ("Why it matters"), source, optional http(s) link, optional date. Create verified; edit and remove are code-read only. Evidence belongs to the creative, not to a version.
- **Share for review:** button "Share V# for review" appears only for a DRAFT that has at least one version. It conditionally updates `DRAFT → IN_REVIEW` once and writes a `CREATIVE_UPLOADED` activity row ("Shared “…” for review (V1)"). Verified. After sharing, the client sees it.

### During and after review
- **Inspecting:** the team sees the same page as the client plus upload, details and evidence-management panels. The team can open any version, read its thread (comments and decisions), and reply with comments.
- **Request for changes:** status banner "The client requested changes. Address the feedback and upload a new version." The team's only way to respond in the workflow is to upload a new version (`finalizeVersion`), which sets the status to `IN_REVIEW` and writes a `VERSION_UPLOADED` activity row, or to comment.
- **Approval:** banner "The client approved V#." Uploading a new version after approval sets the creative back to `IN_REVIEW`; the old version keeps its Approved badge and its Approval row; the new version is not approved. Verified with simulated versions.
- **Revision while a client is reviewing:** the new version becomes current immediately; the client's pending decision on the previous version is rejected (see above); comments on the older version are kept.
- **Drafts:** uploads to a draft keep it a draft and create no activity entries. Evidence added to a draft creates none either.
- **Not available to the team:** deleting or archiving a creative or project, editing a project, moving a draft back from review, editing or deleting comments, overriding or reversing a client decision, assigning other team members.

### Team dashboard and lists
Stats: Active projects, In client review, Changes requested. "Needs revision" list (CHANGES_REQUESTED creatives), recent projects, recent activity. Drafts are visible to the team in lists and project pages and have a Draft filter on `/admin/creatives`.

## 3. Cross-cutting behaviour

- **Data scope:** client queries are restricted to their own projects and non-draft creatives in one place (`creativeScope`/`projectScope`, `src/lib/data/workspace.ts`), reused by the review loaders (`src/lib/data/review.ts`, `src/lib/review/access.ts`). Missing and forbidden creatives look identical (not-found page). Verified for a client opening a draft creative URL.
- **Files:** never public. Browser URLs are `/api/media/[versionId]`, which authenticates and scopes on every request (code-read; unauthenticated and unknown-id responses verified, real file streaming unverified).
- **Status display:** the same `StatusBadge` and counts are used on the creative list, project page, dashboard and review page (all read `Creative.status`).
- **Persistence:** all review data is in PostgreSQL and survived page reloads in testing.
