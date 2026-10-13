# Brand kit audit and UI redesign proposal

13 Oct 2026. Read-only review of `D:\clyntique-demo\brand-kit`. No app code changed. For approval before any implementation.

## 1. What the kit contains

| File | What it is | Notes |
|---|---|---|
| `BrandKit.pdf` (4 pages) | Logo usage, colour system, typography and voice | See below |
| `logo.png` | Primary logo: mark plus "CLYNTIQUE" wordmark | 737×737, RGB, **no transparency**, 565 KB |
| `main-svg-logo.svg` | Primary logo | **Raster PNG wrapped in an SVG** (1254×1254), white background, 1.2 MB |
| `brand-mark.svg` | Brand mark | **Raster PNG wrapped in an SVG** (878×878), white background, 618 KB |
| `secondary-logo.jpg` | Mark without wordmark | 503×328 JPEG, no transparency |

**Logo usage** (PDF page 2):
- **Primary logo:** for standard brand use.
- **Secondary logo:** for when the primary doesn't fit.
- **Brand mark:** for social profiles, favicons, app icons and compact uses.

The mark is a hexagonal "C" with navy on the left and gold on the right. Inside it is a gold world map on a globe grid. It has 3D bevels and drop shadows.

**Core colour system** (PDF page 3):

| Name in kit | Hex | Contrast on white | Use it for |
|---|---|---|---|
| Dark Blue | `#1A2C48` | 14.0:1 | Text, primary buttons, navigation, headings |
| Clyntique Gold | `#DCA858` | **2.15:1** | Accents only. Not text or thin icons on light backgrounds. On navy it is 6.5:1, so fine there |
| Grey Orange | `#817566` | 4.50:1 (4.28:1 on `#FAF9F9`) | Secondary text on white only, at the AA limit |
| Pastel Grey Orange | `#EED69F` | — | Soft highlight fills |
| "Light Red" | `#FAF9F9` | — | Page background. It is actually an off-white; the label looks like a typo |

Each of the first three also has three lighter tints, which aren't labelled with values.

**Typography and voice** (PDF page 4):
- **Headings:** "Bayer TypeArchiType", a display face. It isn't on Google Fonts and probably needs a commercial webfont licence.
- **Body:** Poppins (Google Fonts, free).
- **Voice:** "Luxury editorial expression meets operational clarity."
- The PDF itself also embeds Montserrat Bold and Playfair Display.

## 2. Issues to resolve before the redesign

1. **No usable vector or transparent logo.** The SVGs are photos in an SVG wrapper. Every file has a white background baked in, so none can sit on navy or tinted surfaces, in dark areas, or as a crisp favicon.
2. **The mark doesn't survive small sizes.** At 16–32 px (favicon, sidebar) the bevels, shadows and world map turn to noise. The kit says to use the brand mark for favicons, but it's the same detailed artwork.
3. **File weight.** 0.6–1.2 MB per logo is too heavy for an app shell; it should be a few KB.
4. **Heading font licence.** Bayer TypeArchiType needs a licensed webfont file. Using it without one isn't an option.
5. **Gold collides with the app's "needs attention" colour.** Gold `#DCA858` is almost the same as the status colour `#D6A56B`. If gold becomes the brand accent, brand elements will read as warnings.
6. **Positioning mismatch.** The kit's "what is clyntique?" text describes "a premium business infrastructure, operations, and concierge solutions company" for founders, executives and celebrities. The app is an advertising compliance review product. The product copy needs your direction; I won't change it on my own.
7. **Minor kit errors.** "Light Red" is an off-white. The colour page's subtitle repeats the logo caption ("Preferred logo for standard brand applications").

## 3. Proposed direction (for approval)

Keep every layout, workflow, permission and privacy rule as they are. Restyle with the official identity: navy as the primary colour, gold as a sparing accent, warm off-white surfaces, and Poppins.

**Colour tokens** (`globals.css`, names unchanged so components keep working):

| Token | Now | Proposed |
|---|---|---|
| `brand-*` (accent, buttons, links, focus) | Blue `#4868D8` scale | **Navy scale built from `#1A2C48`**: primary buttons navy with white text; links and focus in a lighter navy that passes AA |
| New `gold-*` | — | `#DCA858` and its tints. Only for accents on navy (active nav indicator, sidebar rule), large decorative shapes, and the logo |
| `canvas` / `surface` / `line` | Warm greys | Shift to the kit's off-white `#FAF9F9` and warm tints (a small change; the current palette is already warm) |
| `muted` | `#6B7480` | A warm grey derived from Grey Orange, darkened slightly to pass AA on both white and off-white |
| `attention-*` (status) | Gold-amber `#D6A56B` | **Move to a distinct burnt orange** so warnings never look like the brand, checked for AA. `positive` and `critical` unchanged |

**Typography:**
- **Body and UI:** Poppins via `next/font/google`, replacing Geist Sans.
- **Record IDs and codes:** keep Geist Mono; Poppins has no monospace.
- **Headings:**
  - (a) Bayer TypeArchiType, if you have or buy a webfont licence and can send the files;
  - otherwise (b) Poppins SemiBold for headings now, with Bayer added later without any layout change.

**Logo usage:**

| Place | Asset |
|---|---|
| Sign-in page and large placements | Primary logo, needs a transparent PNG or a true SVG |
| Sidebar, phone header, page tabs (16–32 px) | Brand mark, needs a simplified flat version |
| Favicon and app icon | Same simplified flat mark |
| Viewfinder mark (current) | Retired everywhere once the official marks are in |

**Getting usable logo files.** Choose one:
- **(a) Preferred:** ask the brand designer for the vector source (SVG, AI or PDF), transparent PNGs, and a flat single-colour or two-colour small version of the mark.
- **(b) Interim:** I draw a faithful flat SVG of the hexagonal C (navy and gold, no map or shadows) for small sizes, and cut a transparent PNG of the full logo for the sign-in page. Both would need your sign-off as on-brand.

**Screens, in order** (each reviewed with screenshots, like Stages C–E):
1. Tokens, fonts and app shell (sidebar, header, nav, favicon).
2. Sign-in page.
3. Overview dashboards (TEAM and CLIENT).
4. Review workspace (stage, Findings/Evidence/History).
5. Lists: submissions, projects, activity, review queue.
6. Forms, empty states and status pills (checking the new attention colour).

**Unchanged:** every workflow step, permission, privacy boundary, data rule and test. Visual changes only.

**Checks for each step:**
- tests, TypeScript, lint and build;
- WCAG AA contrast for every text and background pair;
- desktop and phone screenshots, with no horizontal scrolling;
- favicon readable at 16 px;
- a Preview check after your push.

## 4. Decisions needed from you

1. **Logo files:** (a) request vector and transparent files from the designer, or (b) I make interim flat and transparent versions for your sign-off.
2. **Heading font:** (a) licensed Bayer TypeArchiType (please send the webfont files), or (b) Poppins for now.
3. **Positioning:** keep the app's compliance-review wording, and use the kit for visual identity only? Or should any of the kit's "premium business infrastructure" language appear in the app?
4. **Warning colour:** OK to move "needs attention" from gold-amber to a distinct burnt orange?
5. **Visual preview first:** OK to publish a short visual proposal (swatches, the sidebar, sign-in and one dashboard mocked in the new identity) before I change any code?
