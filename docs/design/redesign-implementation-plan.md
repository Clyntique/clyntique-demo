# Brand redesign: implementation plan (for approval)

13 Oct 2026. The visual direction is approved with refinements. This is the plan only: no code, packages, schema, deploys or Git commands.

## 0. Refinements already resolved

**Needs-attention colour.** The burnt orange is darkened, and every status colour was rechecked (WCAG AA: 4.5:1 for text, 3:1 for dots and bars):

| Family | Pill text (ink) on its soft tint | Text on white | Text on canvas | Solid (dots, bars, white-on-fill) on white |
|---|---|---|---|---|
| Positive | `#21593F` on `#E4F0E9`: 6.99 | 8.19 | 7.80 | `#2F7A55`: 5.20 |
| **Needs attention** | `#8A3B0C` on `#FCEBDD`: 6.66 | 7.74 | 7.36 | **`#B34D15`: 5.26** (was `#C4561A`, 4.47); 5.01 on canvas, 4.53 on its soft tint |
| Critical | `#8E1D2C` on `#FBE6E8`: 7.44 | 8.89 | 8.46 | `#B42335`: 6.50 |
| Info | `#22385C` on `#EAF0F8`: 10.24 | 11.74 | 11.17 | `#3A527A`: 7.87 |
| Neutral | `#4D4A45` on `#F0EDE8`: 7.55 | 8.82 | 8.39 | **`#736C61`: 5.19** (was `#8A8378`, 3.75) |

- Every solid now also passes 4.5:1, so any of them can safely carry white text.
- Attention and critical differ mainly in hue (orange vs crimson). Every pill keeps its own label and icon, so colour is never the only cue.
- Gold is never a status colour.

**Other refinements:**
- **"Queue is clear"** is shown only when the review queue is genuinely empty (it is the existing empty state's heading).
- **Date and greeting:** both are worked out on the server today, and Vercel runs in UTC. For a viewer in India that can show the wrong greeting, and the wrong date near midnight. The plan renders both in the viewer's own time zone, in a small client component.

## 1. Phases, highest impact first

| # | Phase | Effort | What changes visibly |
|---|---|---|---|
| 1 | **Tokens and Poppins** | ~3–4 h | Every page: navy instead of blue, warm neutrals, new status colours, Poppins. About 80% of the visual change. |
| 2 | **App shell and official logo** | ~4–5 h | Sidebar, phone header, page headers; Viewfinder mark replaced by the official logo |
| 3 | **Sign-in** | ~2 h | First impression for the demo |
| 4 | **TEAM and CLIENT dashboards** | ~4–6 h | Summary strip, list sections, empty states, accurate local date and greeting |
| 5 | **Creative review workspace** | ~4–5 h | Header, stage frame, version/compare controls, finding cards, tabs |
| 6 | Lists and remaining pages | ~2–3 h (spot fixes) | Submissions grid, projects, queue, activity, new submission, legacy view |

**Recommended for the demo:** phases 1–4 (about 1.5–2 days), then 5 as time allows. Phase 6 inherits phase 1's tokens, so only obvious issues are fixed, which keeps time free for the policy library and AI work.

## 2. Exact files per phase

**Phase 1: tokens and fonts**
- `src/app/globals.css`:
  - `@theme` tokens: `brand-*` becomes the navy scale; a new `gold-*`; warm neutrals (`canvas`, `surface`, `stage`, `line`, `muted`, `ink*`); `attention-*` becomes burnt orange; `critical-*` becomes crimson; `positive-*` tuned.
  - Type utilities (`text-display`, `text-page-title`, `text-small`, `text-caption`, `text-micro`, `text-record`) retuned for Poppins.
- `src/app/layout.tsx`: Poppins via `next/font/google` (400, 500, 600, italic 400) replaces Geist Sans; Geist Mono stays.
- `src/components/workspace/creative-card.tsx`: the four placeholder tints move to tokens (the only hard-coded colours).
- No component markup changes: the 31 files using semantic classes pick up the tokens.

**Phase 2: shell and logo**
- `src/components/layout/brand.tsx`: official mark and wordmark images replace the Viewfinder drawings.
- `src/components/layout/app-shell.tsx`: white sidebar, user block.
- `src/components/layout/nav-links.tsx`: active state (navy tint, small gold hexagon marker).
- `src/components/layout/mobile-menu.tsx`: phone header and sheet.
- `src/components/layout/page-header.tsx`: wide-tracked eyebrow, title scale.
- `src/components/layout/breadcrumb.tsx`.
- New files `public/brand/mark.png`, `public/brand/wordmark.png`, `public/brand/logo.png`: the transparent cuts of the official logo, sized at 2×.
- `src/app/icon.svg` (favicon): **unchanged** until you approve the concept (see decision 1).

**Phase 3: sign-in**
- `src/app/auth/login/page.tsx`: cream brand panel, full logo, gold globe-line motif.
- `src/app/auth/login/login-form.tsx`, `src/components/ui/input.tsx`, `src/components/ui/button.tsx`: field and button styling, which also applies app-wide.

**Phase 4: dashboards**
- `src/components/views/dashboard-view.tsx`: TEAM summary strip, sections, CLIENT sections; date and greeting through a new small client component (for example `src/components/ui/local-date.tsx`).
- `src/components/ui/list-group.tsx`, `src/components/ui/states.tsx` (empty states), `src/components/ui/status-badge.tsx`, `src/components/ui/severity.tsx`, `src/components/ui/card.tsx`.
- CLIENT progress track (Resubmitted → Being reviewed → Decision): a **new** small display-only component, for example `src/components/ui/submission-steps.tsx`. It reads only the existing status and round number, adds no data or logic, and is optional. (The existing `ui/review-progress.tsx` is a different thing, the project-level status bar, and is only restyled.)

**Phase 5: review workspace**
- `src/components/submissions/submission-view.tsx`: header and layout.
- `src/components/workspace/stage.tsx` and `src/components/review/media-preview.tsx`: stage frame, version and compare controls.
- `src/components/workspace/tabs.tsx`.
- `src/components/submissions/findings-list.tsx`, `src/components/submissions/review-panel.tsx`, `src/components/submissions/review-history.tsx`, `src/components/submissions/client-remediation.tsx`, `src/components/workspace/history.tsx`: cards, responses, notes.
- `src/components/review/creative-review-view.tsx`: legacy view, token check only.

**Phase 6: lists**
- `src/components/views/review-queue-view.tsx`, `creatives-view.tsx`, `projects-view.tsx`, `project-detail-view.tsx`, `activity-view.tsx`, `new-submission-view.tsx`, `page-skeleton.tsx`.
- `src/components/workspace/project-list.tsx`, `src/components/workspace/activity-feed.tsx`.

**Not touched in any phase:** data loaders, server actions, the workflow and policy code, privacy rules, the API routes, the schema and the tests' expectations. Only class names, markup structure and static assets change.

## 3. Dependencies

**None required.**
- **Poppins:** comes through `next/font/google`, which is built into Next.js.
- **Logos:** static PNG files, no package.
- **Not added now:**
  - **Lucide:** the existing icon set in `ui/icons.tsx` gets restyled, which saves time.
  - **Radix, Sonner:** the current components work, so they stay optional for after the demo.
- If you later want Lucide or Radix, each is compatible (checked against React 19.3) and can be added in its own small step.

## 4. Testing and visual verification after each phase

1. **Automated:** all tests (242), TypeScript, lint and production build.
2. **Contrast:** a script checks every token text/background pair the phase introduces (AA).
3. **Local screenshots**, as TEAM and as CLIENT, at desktop (1440 and 1024 px) and phone (375 px):
   - no horizontal scrolling;
   - Poppins is wider than Geist, so check truncation in the sidebar, pills, tables and buttons.
4. **Behaviour spot-check** for the touched pages:
   - TEAM vs CLIENT pages;
   - another client still blocked;
   - private draft content still hidden from TEAM;
   - status labels unchanged in wording.
   Visual-only changes don't affect these, but they are rechecked because markup moves.
5. **A review page** with before/after screenshots (like Stages C–E), sent to you.
6. **Preview check after your push.** To save time, phases 1–3 can go in one push and 4–5 in another.

## 5. Risks and decisions needing your approval

1. **Favicon until the concept is approved.** Choose one:
   - (a) keep today's Viewfinder favicon temporarily, or
   - (b) use the official mark scaled down; it's muddy at 16 px.
   Recommendation: (a). In phase 2 I'll include real-pixel 16 and 32 px renders of the flat concept for your approval.
2. **Viewfinder mark in the app.** It's replaced by the official logo in phase 2. Only the favicon waits for decision 1.
3. **Date and greeting in the viewer's local time.** OK to move both to a small client component? The greeting is currently server/UTC-based.
4. **Workspace layout.** The mockup showed a compact icon rail on the review page. Recommendation: keep today's standard sidebar for the demo and skip the rail. Less change and less risk.
5. **CLIENT progress track.** Add it as a small new display-only component (about 1 h), or skip it for the demo? Recommendation: add it. It makes the client view clearer and uses only data that is already loaded.
6. **Critical colour change.** High severity and errors move from red-orange to crimson so they stay distinct from the new orange. OK?
7. **Logo file weight.** The transparent cuts are raster images (mark about 76 KB, logo about 300 KB at 480 px). They're fine for the demo; real vector files from the designer would replace them later.
8. **No visual regression tooling.** Visual checks are manual screenshots. Automated tests cover behaviour, not pixels.
