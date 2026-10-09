# Clyntique — Feature Inventory

Status legend: **Fully implemented** · **Partially implemented** · **UI only / mock** · **Not implemented**.
"Verified" = observed in a browser or by query; "code-read" = traced in source only. Nothing in the application is UI-only/mock: the static demo data from Phase 2 was deleted in Phase 3 (`src/lib/demo-data.ts` no longer exists; no mock data found by searching `src/` and `prisma/`).

## 1. Feature table

| Feature | Status | Route / File | Database model | Actual behaviour | Limitations |
|---|---|---|---|---|---|
| Email/password sign-in | Fully implemented | `/auth/login`, `src/app/auth/actions.ts` `login`, `src/app/auth/login/login-form.tsx` | `User` | bcrypt compare; constant-time-ish dummy hash for unknown emails; sets JWT cookie; role-based redirect. Verified. | No rate limiting or lockout; no password reset; no sign-up. |
| Logout | Fully implemented | `logout` in `src/app/auth/actions.ts`, `src/components/layout/logout-button.tsx` | — | Deletes cookie, redirects to login. Verified. | Session is a stateless JWT (7 days); logging out does not revoke a copied token. |
| Session + role gate | Fully implemented | `src/lib/auth/session*.ts`, `src/lib/auth/dal.ts`, `src/proxy.ts` | `User` | Proxy redirects early on JWT role; DAL re-reads user and role from DB per request. Verified. | `proxy.ts` matcher excludes `/api/*`; API routes check for themselves. |
| Team dashboard | Fully implemented | `/admin`, `src/components/views/dashboard-view.tsx` | Project, Creative, Activity | Real counts, "Needs revision" list, recent projects/activity. Verified. | "Active projects" counts projects with no creatives. |
| Client dashboard | Fully implemented | `/dashboard`, same view | same | Real counts scoped to the client; drafts excluded. Verified. | — |
| Project list + search | Fully implemented | `/admin/projects`, `/dashboard/projects`, `projects-view.tsx`, `getProjects` | Project, User | Search on project name and client name (`?q=`). Verified in Phase 3. | No pagination, sorting options, or archive filter. |
| Create project | Fully implemented | `/admin/projects/new`, `createProject` | Project, Activity | TEAM-only; validated; writes activity. Verified in Phase 3. | Client must already exist; one client per project. |
| Project detail | Fully implemented | `/admin/projects/[projectId]`, `/dashboard/projects/[projectId]`, `project-detail-view.tsx` | Project, Creative, Activity | Progress bar, creatives grid, project activity. Verified. | — |
| Edit / archive / delete project | Not implemented | — | — | No code path. | — |
| Client account creation / assignment | Partially implemented | `prisma/seed.ts`, `createProject` | User | Existing CLIENT users can be assigned when creating a project. | No UI to create users; seed refuses production; no reassignment. |
| Create creative | Fully implemented | `/admin/projects/[projectId]/creatives/new`, `createCreative`, `creative-form.tsx` | Creative | Always creates a DRAFT with name, format, description, context; redirects to review page. Verified. | No file at creation; no activity for drafts (by design). |
| Edit creative details | Fully implemented | `updateCreativeDetails`, `DetailsForm` | Creative | Updates name, format, description, context. Code-read (not exercised in browser). | Renaming does not update old activity messages. |
| Delete / archive creative | Not implemented | — | `CreativeStatus.ARCHIVED` exists | No code sets or reads ARCHIVED beyond display. | — |
| File upload (image/video) | Partially implemented | `src/app/api/creatives/upload/route.ts`, `src/components/review/version-uploader.tsx`, `finalizeVersion`, `src/lib/media.ts`, `src/lib/review/blob.ts` | CreativeVersion | Token issued only to TEAM for an exact server-built path, fixed content type, size cap; browser uploads directly to a private Blob store; `finalizeVersion` verifies path, size, type and magic bytes then creates the version. | **Never exercised against a real Blob store** (no credentials). Token enforcement of size/type is relied on from SDK docs. |
| Private file delivery | Partially implemented | `src/app/api/media/[versionId]/route.ts` | CreativeVersion | Auth + scope check, streams via `get()` with Range/ETag forwarding, `nosniff`, restrictive CSP. 401/404 behaviours verified; 502 when blob unreachable verified. | Real streaming and 206 handling unverified. Serving large videos through a function is costly (Vercel guidance). |
| Image preview / video player | Partially implemented | `src/components/review/media-preview.tsx` | CreativeVersion | `<img>` or native `<video controls preload="metadata">`, no autoplay; loading skeleton and error fallback. Error fallback verified (file unavailable). | Successful render of real media unverified. |
| Versions + history | Partially implemented | `finalizeVersion`, `getCreativeReview`, `VersionHistory` in `creative-review-view.tsx` | CreativeVersion | `max+1` numbering in a transaction with unique-constraint retry; history panel with Current badge, decisions, comment counts; `?v=N` to view old versions. Display, numbering rules and status effects verified using directly inserted test versions. | The upload step that creates versions in real use is unverified. |
| Share for review | Fully implemented | `shareForReview`, `ShareForm` | Creative, Activity | Conditional DRAFT→IN_REVIEW once, writes activity. Verified. | Needs ≥ 1 version; cannot undo. |
| Campaign context + "About" | Fully implemented | `Creative.context`, `Creative.description`, evidence panel | Creative | Shown to both roles. Verified. | Free text only. |
| Evidence CRUD | Fully implemented | `saveEvidence`, `deleteEvidence`, `review-forms.tsx` | Evidence | TEAM adds/edits/removes; both roles read; http(s) links only, opened with `rel="noopener noreferrer nofollow"`. Create + unsafe-link rejection verified; edit/delete code-read only. | Per creative, not per version; no attachments (links only); no claim linkage; invalid calendar dates (e.g. 31 Feb) roll over instead of being rejected. |
| Claims / findings | Not implemented | — | none | No model, UI or concept. | — |
| Comments / feedback thread | Fully implemented | `addComment`, `CommentForm`, `Thread` | Comment | Both roles; per version; double-submit guard; verified create + persistence. | No edit/delete, replies, mentions or attachments; the thread shows only the selected version. |
| Approve | Fully implemented | `submitDecision`, `DecisionPanel` | Approval, Creative, Activity | Atomic guarded update; tied to exact version. Verified. | Cannot be changed afterwards. |
| Request changes | Fully implemented | same | same | Reason required (≥ 10 chars). Verified. | No structured change list; team cannot mark items resolved. |
| Stale-version protection | Fully implemented | `submitDecision` where-clause | Creative | Rejects a decision if a newer version exists. Verified. | — |
| Activity records | Fully implemented | writes in `actions.ts`, reads `getActivity` | Activity | Written for project creation, share, new version, evidence add, comments, decisions. Verified. | Entries are not clickable; messages are frozen text; some types are reused (see DATABASE doc). |
| Activity page | Fully implemented | `/admin/activity`, `/dashboard/activity`, `activity-view.tsx` | Activity | Timeline grouped by day, up to 100 entries. Verified. | No filtering or links to the creative. |
| Creatives list + filters | Fully implemented | `/admin/creatives`, `/dashboard/creatives`, `creatives-view.tsx` | Creative | Tabs by status with counts; cards link to the review page. Verified. | Filters are client-side over all creatives; no pagination. |
| Card thumbnails | Partially implemented | `src/components/workspace/creative-card.tsx` | CreativeVersion | Image thumbnails via `/api/media`; tinted placeholder or play mark otherwise. | Unverified with real images; one authenticated media request per card. |
| Notifications / email | Not implemented | — | — | None. | Users must reload to see changes. |
| Real-time updates | Not implemented | — | — | None. | — |
| Client uploads / evidence / responses | Not implemented | — | — | Clients cannot upload or respond beyond comments and decisions. | — |
| Organisations / multiple clients per project / team roles | Not implemented | — | — | `Project.clientId` is a single user; every TEAM user is an admin. | — |
| Orphan-upload cleanup | Partially implemented | `prisma/blob-orphans.ts`, `npm run blob:orphans` | CreativeVersion | Lists (dry-run default) or deletes Blob files under `creatives/` older than 24 h and unreferenced. | Never run; manual only. |
| Loading / empty / error states | Fully implemented | `page-skeleton.tsx`, `states.tsx`, `workspace-error.tsx`, `not-found.tsx` | — | Suspense skeletons, empty states, error boundary with retry, in-shell not-found. Verified in Phases 2–4. | — |
| Responsive layout | Partially implemented | `app-shell.tsx` | — | Sidebar on desktop/tablet, top bar and tabs on mobile. | Phase 3 checked a client project page on mobile; Phase 4 pages were checked only at ~800–1024 px. |
| Automated tests | Not implemented | — | — | No test framework, no test script, no test files. | — |
| Deployment configuration | Not implemented (in repo) | — | — | No `vercel.json`, CI workflow, Dockerfile or `engines` field found. `package.json` has `postinstall`/`build` running `prisma generate`. | Any Vercel/Render setup exists outside the repo and could not be verified. |

## 2. Page inventory

Pages are server-rendered shells with `Suspense` skeletons; each calls `requireRole(role)` for authorization (`src/lib/auth/dal.ts`).

| URL | Purpose | Roles | Main components | Data source | Actions (functional?) | Missing | Related actions / API |
|---|---|---|---|---|---|---|---|
| `/` | Redirect to login | any | `src/app/page.tsx` | — | Redirect | — | `proxy.ts` |
| `/auth/login` | Sign in | anonymous (signed-in users redirected home) | `LoginForm` | `User` | Sign in (functional) | Reset/sign-up | `login` |
| `/admin` | Team dashboard | TEAM | `DashboardView`, `StatRow`, `ProjectTable`, `ActivityList` | `getProjects`, `getCreativeStatusCounts`, `getCreatives`, `getActivity` | New project, links (functional) | — | — |
| `/admin/projects` | Project list | TEAM | `ProjectsView`, `ProjectList` | `getProjects` | Search, New project (functional) | Edit/archive | — |
| `/admin/projects/new` | New project | TEAM | `NewProjectView`, `ProjectForm` | `getClientOptions` | Create project (functional) | Create client | `createProject` |
| `/admin/projects/[projectId]` | Project detail | TEAM | `ProjectDetailView` | `getProject`, `getCreatives`, `getActivity` | Add creative, open creative (functional) | Edit/delete | — |
| `/admin/projects/[projectId]/creatives/new` | New creative | TEAM | `NewCreativeView`, `CreativeForm` | `getProject` | Create draft (functional) | — | `createCreative` |
| `/admin/creatives` | All creatives | TEAM | `CreativesView`, `CreativeCard` | `getCreatives` | Filter, open (functional) | Search/pagination | — |
| `/admin/creatives/[creativeId]` | Review page (team) | TEAM | `CreativeReviewView`, `MediaPreview`, `VersionUploader`, `DetailsForm`, `EvidenceForm`, `CommentForm`, `ShareForm` | `getCreativeReview` | Upload*, share, edit details, evidence CRUD, comment (functional; *upload unverified) | Delete/archive creative; comment edit | `finalizeVersion`, `shareForReview`, `updateCreativeDetails`, `saveEvidence`, `deleteEvidence`, `addComment`, `/api/creatives/upload`, `/api/media/[versionId]` |
| `/admin/activity` | Timeline | TEAM | `ActivityView` | `getActivity` | None | Links, filters | — |
| `/dashboard` | Client dashboard | CLIENT | `DashboardView` | as above (scoped) | View projects, open creative | — | — |
| `/dashboard/projects` | Project list | CLIENT | `ProjectsView` | `getProjects` (scoped) | Search | — | — |
| `/dashboard/projects/[projectId]` | Project detail | CLIENT | `ProjectDetailView` | `getProject` (scoped) | Open creative | — | — |
| `/dashboard/creatives` | Creatives list | CLIENT | `CreativesView` | `getCreatives` (scoped, no drafts) | Filter, open | — | — |
| `/dashboard/creatives/[creativeId]` | Review page (client) | CLIENT | `CreativeReviewView`, `DecisionPanel`, `CommentForm` | `getCreativeReview` (scoped) | Comment, approve, request changes (functional) | Withdraw/change decision; notifications | `addComment`, `submitDecision`, `/api/media/[versionId]` |
| `/dashboard/activity` | Timeline | CLIENT | `ActivityView` | `getActivity` (scoped) | None | Links | — |
| `POST /api/creatives/upload` | Upload-token endpoint | TEAM | `handleUpload` | `Creative` (access check) | Issues short-lived upload token | Real-store verification | — |
| `GET /api/media/[versionId]` | Authenticated file stream | TEAM, CLIENT (scoped) | route handler | `CreativeVersion` + Blob | Streams private file | Real-store verification | — |
