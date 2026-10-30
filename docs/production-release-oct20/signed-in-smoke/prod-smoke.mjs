// Signed-in Production smoke test for Clyntique (run on GT, not in the cloud).
//
// Two parts:
//   READ-ONLY (default): anonymous checks, Team and Client sign-in, existing
//     data visibility, permissions, private media, AI wording, review records,
//     client isolation and phone layout. It clicks nothing that saves data and
//     does not open existing chat threads (opening one marks messages as read).
//   FIXTURES (--fixtures, only after the CEO approves): creates one project and
//     one submission labelled "[SMOKE TEST <time>]" for the existing client
//     account and runs the full lifecycle on it: upload V1, submit, chat, AI
//     scan, finding, changes requested, response, evidence, V2, resubmit,
//     resolve, complete, review record, external submission and outcome,
//     re-review, isolation. Existing projects and submissions are never touched.
//
// Credentials come only from environment variables set by run-smoke.ps1:
//   SMOKE_TEAM_EMAIL / SMOKE_TEAM_PASSWORD, SMOKE_CLIENT_EMAIL / SMOKE_CLIENT_PASSWORD,
//   SMOKE_CLIENT2_EMAIL / SMOKE_CLIENT2_PASSWORD (client 2 is optional).
// They are removed from the environment at start, never printed, and scrubbed
// from every line the script writes. Password fields are masked in screenshots;
// pages showing existing client data are screenshotted with the content masked.
// No trace, video or session cookies are saved.
//
// Options: --base <url> (default https://clyntique-demo.vercel.app), --out <dir>,
//   --fixtures (needs SMOKE_FIXTURES_APPROVED=yes), --expect-projects <n> (default 4),
//   --timeout <ms> per step (default 90000), --headed,
//   --reuse-draft <id|latest> (with --fixtures: skip creating the project and the
//     draft and continue on an existing [SMOKE TEST] draft of Client 1; "latest"
//     picks the newest [SMOKE TEST] draft in Client 1's submissions list),
//   --creative <file> (with --fixtures: upload this labelled image as V1 instead
//     of the generated PNG, so the real Blob upload and the live AI scan use it;
//     PNG/JPEG/WebP under 4 MB; V2 stays a generated PNG).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    return import(pathToFileURL(join(globalRoot, "playwright", "index.mjs")).href);
  }
}
const { chromium } = await loadPlaywright();

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i > -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const BASE = opt("base", "https://clyntique-demo.vercel.app").replace(/\/$/, "");
const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const OUT = resolve(opt("out", `./smoke-${STAMP}`));
const FIXTURES = argv.includes("--fixtures");
const EXPECT_PROJECTS = Number(opt("expect-projects", "4"));
const STEP_TIMEOUT = Number(opt("timeout", "90000"));
const TAG = `[SMOKE TEST ${STAMP.slice(0, 16).replace("T", " ")}]`;
const REUSE_DRAFT = opt("reuse-draft", null);
const CREATIVE = opt("creative", null) ? resolve(opt("creative", null)) : null;
const CREATIVE_TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
if (CREATIVE) {
  const type = CREATIVE_TYPES[extname(CREATIVE).toLowerCase()];
  if (!type) { console.error("--creative must be a .png, .jpg, .jpeg or .webp file. Nothing was run."); process.exit(1); }
  if (readFileSync(CREATIVE).length > 4 * 1024 * 1024) { console.error("--creative must be under 4 MB (the AI scan limit). Nothing was run."); process.exit(1); }
}

// ---------------------------------------------------------------- secrets
const ACCOUNTS = {};
for (const [key, prefix] of [["team", "SMOKE_TEAM"], ["client", "SMOKE_CLIENT"], ["client2", "SMOKE_CLIENT2"]]) {
  const email = process.env[`${prefix}_EMAIL`]?.trim();
  const password = process.env[`${prefix}_PASSWORD`];
  if (email && password) ACCOUNTS[key] = { email, password };
  delete process.env[`${prefix}_PASSWORD`];
}
const SECRETS = Object.values(ACCOUNTS).map((a) => a.password).filter((p) => p && p.length >= 4);
function scrub(value) {
  let s = String(value ?? "");
  for (const secret of SECRETS) s = s.split(secret).join("<redacted>");
  return s
    .replace(/(_vercel_share|token|signature|sig|X-Amz-[A-Za-z]+)=[^&\s"')]+/gi, "$1=<redacted>")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "<connection string>")
    .replace(/\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}/g, "<hash>");
}
const log = (line) => console.log(scrub(line));

if (!ACCOUNTS.team || !ACCOUNTS.client) {
  console.error("Set SMOKE_TEAM_* and SMOKE_CLIENT_* (run-smoke.ps1 asks for them). Nothing was run.");
  process.exit(2);
}
if (FIXTURES && process.env.SMOKE_FIXTURES_APPROVED !== "yes") {
  console.error("--fixtures creates labelled records in Production and needs SMOKE_FIXTURES_APPROVED=yes (only after the CEO's approval). Nothing was run.");
  process.exit(2);
}
mkdirSync(join(OUT, "screenshots"), { recursive: true });

// ---------------------------------------------------------------- harness
const RECORD_DISCLAIMER = "This is Clyntique's internal review record.";
const EXTERNAL_DISCLAIMER = "Recorded manually. Clyntique did not submit this";
const COVERAGE = /Insufficient policy coverage/i;
const APPROVAL_CLAIM = /(approved by clyntique|clyntique (has )?approved|regulatory approval granted|compliant with all|fully compliant|guaranteed compliance)/i;
const NOT_FOUND = /not found|404|doesn.t exist|could not be found|couldn.t find/i;

class CriticalStop extends Error {}
const results = [];
const diagnostics = {};
let shot = 0;

function diag(role) {
  return (diagnostics[role] ??= { consoleErrors: [], pageErrors: [], serverErrors: [] });
}

async function newRole(browser, role, viewport = { width: 1366, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const d = diag(role);
  page.on("console", (m) => {
    if (m.type() === "error" && !/vercel\.live|_vercel\/insights|speed-insights/.test(m.text())) d.consoleErrors.push(scrub(`${page.url().replace(BASE, "")} :: ${m.text().slice(0, 200)}`));
  });
  page.on("pageerror", (e) => d.pageErrors.push(scrub(`${page.url().replace(BASE, "")} :: ${String(e.message).slice(0, 200)}`)));
  page.on("response", (r) => {
    if (r.url().startsWith(BASE) && r.status() >= 500) d.serverErrors.push(scrub(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, "").split("?")[0]}`));
  });
  return { role, context, page, signedIn: false };
}

const safePath = (u) => scrub(String(u ?? "").replace(BASE, "").split("?")[0]).replace(/\/api\/media\/\S+/, "/api/media/…");

async function snap(actor, label, maskContent) {
  shot += 1;
  const file = `${String(shot).padStart(3, "0")}-${`${actor.role}-${label}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 70)}.png`;
  const page = actor.page;
  try {
    const mask = [page.locator('input[type="password"]')];
    if (maskContent) mask.push(page.locator("main"));
    await page.screenshot({ path: join(OUT, "screenshots", file), fullPage: true, mask, maskColor: "#1A2C48" });
    return file;
  } catch {
    return null;
  }
}

// step(): runs one check and records PASS / FAIL / BLOCKED. Only an explicit
// return marks PASS; any exception is a FAIL. `existing: true` masks the page
// content in the screenshot because it shows pre-existing client data.
async function step(phase, actor, action, expected, fn, { existing = false, critical = false } = {}) {
  const row = { phase, role: actor.role, action, expected, actual: "", status: "PASS", screenshot: null, url: "" };
  let timer;
  const timeout = new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(`timed out after ${STEP_TIMEOUT} ms`)), STEP_TIMEOUT)));
  try {
    const out = await Promise.race([fn(actor.page), timeout]);
    if (out && typeof out === "object") {
      row.status = out.status ?? "PASS";
      row.actual = out.text ?? "as expected";
    } else row.actual = typeof out === "string" ? out : "as expected";
  } catch (e) {
    row.status = "FAIL";
    row.actual = String(e?.message ?? e).split("\n")[0].slice(0, 300);
  } finally {
    clearTimeout(timer);
  }
  row.actual = scrub(row.actual);
  row.url = safePath(actor.page.url());
  row.screenshot = await snap(actor, action, existing);
  results.push(row);
  log(`${row.status.padEnd(7)} [${phase}] ${actor.role}: ${action} -> ${row.actual}`);
  if (critical && row.status === "FAIL") throw new CriticalStop(`${actor.role}: ${action} -> ${row.actual}`);
  return row;
}

const blocked = (text) => ({ status: "BLOCKED", text });
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function text(page) {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}
async function expectText(page, pattern, what) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(escapeRe(pattern), "i");
  const t = await text(page);
  if (!re.test(t)) throw new Error(`${what ?? pattern} not found on ${safePath(page.url())}`);
  return t;
}
async function expectNoText(page, pattern, what) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(escapeRe(pattern), "i");
  const t = await text(page);
  if (re.test(t)) throw new Error(`${what ?? pattern} unexpectedly present on ${safePath(page.url())}`);
  return t;
}
async function settle(page) {
  await page.waitForTimeout(300);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, null, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(150);
}
// A server action finishing late (e.g. after sending a message) can navigate the
// page away again; if the page did not stay on `path`, wait and load it once more.
// A second mismatch is a genuine redirect and is returned as is.
// Navigation waits for the DOM only (networkidle is waited for inside settle(),
// with a catch), so a slow network or a long-lived request cannot fail a step
// whose page already rendered. The navigation itself gets the step budget.
async function goto(page, path) {
  const options = { waitUntil: "domcontentloaded", timeout: Math.max(30000, STEP_TIMEOUT - 15000) };
  let res = await page.goto(`${BASE}${path}`, options);
  await settle(page);
  if (new URL(page.url()).pathname !== path.split("?")[0]) {
    await page.waitForTimeout(2000);
    res = await page.goto(`${BASE}${path}`, options);
    await settle(page);
  }
  return res;
}
async function openTab(page, label) {
  await settle(page);
  const re = new RegExp(`^${label}`, "i");
  for (const role of ["tab", "button", "link"]) {
    const el = page.getByRole(role, { name: re });
    if (await el.count()) {
      await el.first().click();
      await page.waitForTimeout(500);
      return;
    }
  }
  throw new Error(`tab "${label}" not found`);
}
async function fillIfPresent(scope, selector, value) {
  const el = scope.locator(selector);
  if (!(await el.count())) return false;
  await el.first().fill(value);
  return true;
}
async function selectIfPresent(scope, selector, value) {
  const el = scope.locator(selector);
  if (!(await el.count())) return false;
  const options = await el.first().locator("option").evaluateAll((os) => os.map((o) => ({ v: o.value, t: o.textContent ?? "", d: o.disabled })));
  const match = options.find((o) => o.v === value) ?? options.find((o) => value && new RegExp(escapeRe(value), "i").test(o.t)) ?? options.find((o) => o.v && !o.d);
  if (!match) return false;
  await el.first().selectOption(match.v);
  return true;
}
async function overflow(page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  if (sw > iw + 2) throw new Error(`horizontal overflow: page ${sw}px wide at ${iw}px`);
  return `no horizontal overflow at ${iw}px`;
}
async function ids(page, prefix) {
  const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") ?? ""));
  const re = new RegExp(`^${escapeRe(prefix)}/([^/?#]+)$`);
  return [...new Set(hrefs.map((h) => h.replace(/^https?:\/\/[^/]+/, "").match(re)?.[1]).filter((id) => id && id !== "new"))];
}
async function mediaUrls(page) {
  const srcs = await page.$$eval('img[src*="/api/media/"]', (is) => is.map((i) => i.getAttribute("src") ?? ""));
  return [...new Set(srcs.map((s) => s.replace(/^https?:\/\/[^/]+/, "")))];
}
async function imagesLoaded(page) {
  return page.$$eval('img[src*="/api/media/"]', (is) => is.filter((i) => i.complete && i.naturalWidth > 0).length);
}

async function signIn(actor, account, landing) {
  const page = actor.page;
  await goto(page, "/auth/login");
  await page.locator('input[name="email"]').fill(account.email);
  await page.locator('input[name="password"]').fill(account.password);
  await page.locator('form:has(input[name="password"]) button[type="submit"]').click();
  const outcome = await Promise.race([
    page.waitForURL(/\/(admin|dashboard)(\/|$)/, { timeout: 30000 }).then(() => "ok"),
    page.getByText(/Invalid email or password|Too many sign-in attempts/i).first().waitFor({ timeout: 30000 }).then(() => "refused"),
  ]).catch(() => "timeout");
  // Never leave a filled password on screen for the screenshot.
  await page.locator('input[name="password"]').fill("").catch(() => {});
  if (outcome !== "ok") throw new Error(outcome === "refused" ? "sign-in refused (wrong password or rate limit); not retried" : "no redirect after sign-in");
  await settle(page);
  if (!new RegExp(`^${escapeRe(BASE)}${landing}`).test(page.url())) throw new Error(`landed on ${safePath(page.url())}, expected ${landing}`);
  actor.signedIn = true;
  return `signed in, landed on ${safePath(page.url())}`;
}

// A small real PNG (240x160, two colours) built here, so uploads use an image file.
function makePng(seed) {
  const w = 240, h = 160;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      const band = ((x + y + seed * 40) >> 4) % 2;
      raw[o] = band ? 0x1a : 0xdc;
      raw[o + 1] = band ? 0x2c : 0xa8;
      raw[o + 2] = band ? 0x48 : 0x58;
    }
  }
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function uploadVersion(page, n) {
  if (/File uploads aren.t set up in this environment/i.test(await text(page))) return blocked("uploads are not configured on this deployment");
  // The page can hold several file inputs (the evidence form has its own,
  // id "evidence-file-<id>"); the version uploader's input is id "file-<id>".
  const input = page.locator('input[type="file"][id^="file-"]');
  if (!(await input.count())) return blocked("no creative file input offered in this state");
  const name = n === 1 && CREATIVE ? `smoke-test-v1${extname(CREATIVE).toLowerCase()}` : `smoke-test-v${n}.png`;
  if (n === 1 && CREATIVE) await input.first().setInputFiles({ name, mimeType: CREATIVE_TYPES[extname(CREATIVE).toLowerCase()], buffer: readFileSync(CREATIVE) });
  else await input.first().setInputFiles({ name, mimeType: "image/png", buffer: makePng(n) });
  await page.waitForTimeout(500);
  const chosen = await page.locator(`label[for="${await input.first().getAttribute("id")}"]`).innerText().catch(() => "");
  if (!chosen.includes(name)) {
    const alert = await page.locator('[role="alert"]').allInnerTexts().catch(() => []);
    throw new Error(`the file was not taken by the uploader (label shows "${chosen.replace(/\s+/g, " ").slice(0, 80)}"${alert.length ? `; alert: ${alert.join(" | ").slice(0, 120)}` : ""})`);
  }
  const btn = page.getByRole("button", { name: /^Upload (file|V\d+)$/ });
  if (!(await btn.count())) return blocked("no Upload button after choosing the file");
  if (await btn.first().isDisabled()) throw new Error("Upload button stayed disabled after the file was chosen");
  // Trace the upload's requests (token request, Blob API, the save action) so a
  // failure says where it stopped. Hosts, paths and statuses only: no query strings.
  const trace = [];
  const pagePath = new URL(page.url()).pathname;
  const interesting = (u) => /\/api\/creatives\/upload|vercel\.com\/api\/blob|blob\.vercel-storage\.com/.test(u) || new URL(u).pathname === pagePath;
  const describe = (req) => { const u = new URL(req.url()); return `${req.method()} ${u.hostname}${u.pathname.replace(/\/creatives\/[^/]+/, "/creatives/<id>").slice(0, 70)}`; };
  const onResponse = (r) => { if (interesting(r.url())) trace.push(`${r.status()} ${describe(r.request())}`); };
  const onFailed = (req) => { if (interesting(req.url())) trace.push(`FAILED ${describe(req)} (${req.failure()?.errorText ?? "network error"})`); };
  page.on("response", onResponse);
  page.on("requestfailed", onFailed);
  let onScreen = "";
  try {
    await btn.first().click();
    // Wait until the uploader is no longer busy: the "Uploading…" status is gone
    // and either an alert (failure) or the saved notice (success) is shown.
    await page.waitForFunction(() => {
      const t = document.body.innerText;
      return !/Uploading/.test(t) && (document.querySelector('[role="alert"]') !== null || /uploaded|saved|ready for the client|can review it now|\bV\d+\b/i.test(t));
    }, null, { timeout: 150000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const alerts = await page.locator('[role="alert"]').allInnerTexts().catch(() => []);
    const statuses = await page.locator('[role="status"]').allInnerTexts().catch(() => []);
    onScreen = [...alerts.map((a) => `alert: ${a}`), ...statuses.filter((x) => /upload|saved|progress|stopped|try again/i.test(x)).map((x) => `status: ${x}`)].map((x) => x.replace(/\s+/g, " ").trim().slice(0, 160)).join(" | ");
    if (alerts.length) throw new Error(`upload failed on screen: ${onScreen}; requests: ${trace.join(", ") || "none seen"}`);
  } finally {
    page.off("response", onResponse);
    page.off("requestfailed", onFailed);
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await settle(page);
  const t = await text(page);
  if (!new RegExp(`\\bV${n}\\b|Version ${n}`).test(t)) throw new Error(`V${n} not shown after upload; on screen before reload: ${onScreen || "no message"}; requests: ${trace.join(", ") || "none seen"}`);
  const urls = await mediaUrls(page);
  if (!urls.length) throw new Error("no /api/media preview after upload");
  await page.waitForTimeout(1000);
  if (!(await imagesLoaded(page))) throw new Error("preview image did not load");
  return { urls, text: `V${n} uploaded to the private store; preview loads` };
}

async function mediaStatus(actor, url) {
  const r = await actor.page.request.get(`${BASE}${url}`, { maxRedirects: 0 });
  return r.status();
}

// ---------------------------------------------------------------- run
const found = { team: {}, client: {}, client2: {}, fx: {} };

async function readOnly(browser, anon, team, c1, c2) {
  // A. Anonymous
  await step("A Public", anon, "Public pages and closed sign-up", "home 200; sign-in has no demo buttons; sign-up closed", async (page) => {
    const home = await goto(page, "/");
    if (home?.status() !== 200) throw new Error(`home ${home?.status()}`);
    await goto(page, "/auth/login");
    await expectNoText(page, /Login as Team|Login as Client/, "demo login buttons");
    await goto(page, "/auth/signup");
    if (await page.locator('input[name="password"]').count()) throw new Error("sign-up form is open (a password field is shown)");
    return "home 200, no demo buttons, sign-up closed";
  });
  await step("A Public", anon, "Signed-in areas refuse visitors", "/admin, /dashboard redirect to sign-in; media and upload APIs 401", async (page) => {
    for (const p of ["/admin", "/dashboard", "/admin/messages", "/dashboard/messages"]) {
      await goto(page, p);
      if (!/\/auth\/login/.test(page.url())) throw new Error(`${p} -> ${safePath(page.url())}`);
    }
    const media = await page.request.get(`${BASE}/api/media/x`, { maxRedirects: 0 });
    const upload = await page.request.post(`${BASE}/api/creatives/upload`, { maxRedirects: 0, data: {} });
    if (media.status() !== 401 || upload.status() !== 401) throw new Error(`media ${media.status()}, upload ${upload.status()}`);
    return "redirects to sign-in; media 401; upload 401";
  });

  // B. Team
  const tl = await step("B Team", team, "Team sign-in", "lands on /admin", () => signIn(team, ACCOUNTS.team, "/admin"));
  if (tl.status === "PASS") {
    await step("B Team", team, "Existing projects visible", `${EXPECT_PROJECTS} projects listed`, async (page) => {
      await goto(page, "/admin/projects");
      found.team.projects = await ids(page, "/admin/projects");
      const n = found.team.projects.length;
      if (n !== EXPECT_PROJECTS) return { status: "FAIL", text: `${n} projects listed, expected ${EXPECT_PROJECTS} (check whether projects were added or are paginated)` };
      return `${n} projects listed`;
    }, { existing: true });
    await step("B Team", team, "Existing submissions visible", "submitted creatives listed; each opens", async (page) => {
      await goto(page, "/admin/creatives");
      found.team.creatives = await ids(page, "/admin/creatives");
      if (!found.team.creatives.length) return { status: "FAIL", text: "no submissions listed" };
      return `${found.team.creatives.length} submission(s) listed (client drafts are not shown to the Team by design)`;
    }, { existing: true });
    await step("B Team", team, "Open an existing submission: versions and image", "versions listed; preview image loads from private media", async (page) => {
      const id = found.team.creatives?.[0];
      if (!id) return blocked("no submission to open");
      await goto(page, `/admin/creatives/${id}`);
      await expectNoText(page, /Application error|Internal Server Error/i, "error page");
      const urls = await mediaUrls(page);
      found.team.media = urls[0];
      await openTab(page, "History");
      const t = await text(page);
      const versions = new Set(t.match(/\bV\d+\b/g) ?? []).size;
      if (!urls.length) return blocked(`opened; ${versions} version label(s); no image preview on this submission`);
      const status = await mediaStatus(team, urls[0]);
      if (status !== 200) return { status: "FAIL", text: `media for the Team -> ${status}` };
      return `opened; ${versions} version label(s); preview media 200`;
    }, { existing: true });
    await step("B Team", team, "AI tab on an existing submission (no new scan)", "no approval claim; scan history entries say coverage is missing", async (page) => {
      const id = found.team.creatives?.[0];
      if (!id) return blocked("no submission");
      await goto(page, `/admin/creatives/${id}`);
      await openTab(page, "AI Compliance");
      const t = await expectNoText(page, APPROVAL_CLAIM, "approval claim");
      const hist = t.includes("Scan history") ? t.slice(t.indexOf("Scan history")) : "";
      const coverage = (hist.match(/No verified rules covered this scope/g) ?? []).length;
      const passLike = /\b(Passed|No issues found|Compliant)\b/.test(hist);
      if (passLike) return { status: "FAIL", text: "scan history reads as a pass with no verified rules" };
      return hist ? `scan history present; ${coverage} run(s) marked "No verified rules covered this scope"; no approval claim` : "no scans run on this submission yet; no approval claim";
    }, { existing: true });
    await step("B Team", team, "Review record of an existing submission", "internal-review disclaimer and Print/PDF; no approval claim", async (page) => {
      const id = found.team.creatives?.[0];
      if (!id) return blocked("no submission");
      await goto(page, `/admin/creatives/${id}/record`);
      await expectText(page, RECORD_DISCLAIMER, "record disclaimer");
      await expectNoText(page, APPROVAL_CLAIM, "approval claim");
      if (!(await page.getByRole("button", { name: /Print/i }).count())) throw new Error("Print button missing");
      return "disclaimer and Print/PDF present";
    }, { existing: true });
    await step("B Team", team, "Messages inbox, policy library, impact page", "all load (threads not opened, to keep unread state)", async (page) => {
      for (const p of ["/admin/messages", "/admin/policy-library", "/admin/policy-library/impact", "/admin/review", "/admin/activity"]) {
        const r = await goto(page, p);
        if ((r?.status() ?? 0) >= 400) throw new Error(`${p} -> ${r?.status()}`);
        await expectNoText(page, /Application error|Internal Server Error|not available on this environment/i, `error on ${p}`);
      }
      return "inbox, policy library, impact, review queue and activity load";
    }, { existing: true });
    await step("B Team", team, "Team cannot use the client area", "/dashboard redirects to /admin", async (page) => {
      await goto(page, "/dashboard");
      if (!/\/admin(\/|$)/.test(page.url())) throw new Error(`landed on ${safePath(page.url())}`);
      return "redirected to /admin";
    });
  }

  // C. Clients
  for (const [key, actor] of [["client", c1], ["client2", c2]]) {
    if (!actor) continue;
    const label = key === "client" ? "Client 1" : "Client 2";
    const l = await step(`C ${label}`, actor, `${label} sign-in`, "lands on /dashboard", () => signIn(actor, ACCOUNTS[key], "/dashboard"));
    if (l.status !== "PASS") continue;
    await step(`C ${label}`, actor, `${label} sees own projects and submissions`, "lists load", async (page) => {
      await goto(page, "/dashboard/projects");
      found[key].projects = await ids(page, "/dashboard/projects");
      await goto(page, "/dashboard/creatives");
      found[key].creatives = await ids(page, "/dashboard/creatives");
      return `${found[key].projects.length} project(s), ${found[key].creatives.length} submission(s) incl. drafts`;
    }, { existing: true });
    await step(`C ${label}`, actor, `${label} opens own submissions; private media loads`, "each opens; images load for the owner", async (page) => {
      found[key].media = [];
      found[key].drafts = [];
      for (const id of found[key].creatives ?? []) {
        await goto(page, `/dashboard/creatives/${id}`);
        await expectNoText(page, /Application error|Internal Server Error/i, "error page");
        if (await page.getByRole("button", { name: /^Submit for review$/ }).count()) found[key].drafts.push(id);
        found[key].media.push(...(await mediaUrls(page)));
      }
      if (!found[key].media.length) return blocked(`opened ${found[key].creatives?.length ?? 0} submission(s); none has an image preview`);
      const status = await mediaStatus(actor, found[key].media[0]);
      if (status !== 200) return { status: "FAIL", text: `own media -> ${status}` };
      return `opened ${found[key].creatives.length}; ${found[key].media.length} image(s); own media 200; ${found[key].drafts.length} draft(s)`;
    }, { existing: true });
    await step(`C ${label}`, actor, `${label} cannot open Team pages`, "/admin and /admin/policy-library redirect to /dashboard", async (page) => {
      for (const p of ["/admin", "/admin/policy-library", "/admin/creatives"]) {
        await goto(page, p);
        if (!/\/dashboard(\/|$)/.test(page.url())) throw new Error(`${p} -> ${safePath(page.url())}`);
      }
      return "all redirect to /dashboard";
    });
  }

  // D. Isolation (critical: any leak stops the run)
  const pairs = [[c1, "client", "client2"], [c2, "client2", "client"]].filter(([a, , other]) => a?.signedIn && found[other].creatives);
  for (const [actor, , other] of pairs) {
    await step("D Isolation", actor, `Opens the other client's submissions and records by address`, "not found, no data", async (page) => {
      const theirs = found[other].creatives ?? [];
      const mine = new Set(found[actor === c1 ? "client" : "client2"].creatives ?? []);
      const foreign = theirs.filter((id) => !mine.has(id));
      if (!foreign.length) return blocked("the other client has no submissions to try");
      for (const id of foreign) {
        for (const p of [`/dashboard/creatives/${id}`, `/dashboard/creatives/${id}/record`]) {
          await goto(page, p);
          const t = await text(page);
          if (!NOT_FOUND.test(t) || (await page.locator('img[src*="/api/media/"]').count())) throw new Error(`${p.replace(id, "<id>")} did not show not-found`);
        }
      }
      return `${foreign.length} foreign submission(s): submission and record pages show not-found`;
    }, { critical: true });
    await step("D Isolation", actor, "Fetches the other client's media", "404 for every file", async () => {
      const urls = found[other].media ?? [];
      if (!urls.length) return blocked("no media captured from the other client");
      for (const u of urls) {
        const s = await mediaStatus(actor, u);
        if (s !== 404) throw new Error(`foreign media -> ${s}`);
      }
      return `${urls.length} file(s) -> 404`;
    }, { critical: true });
  }
  if (team.signedIn) {
    await step("D Isolation", team, "Client drafts stay private from the Team", "Team gets not-found for every client draft", async (page) => {
      const drafts = [...(found.client.drafts ?? []), ...(found.client2.drafts ?? [])];
      if (!drafts.length) return blocked("no client drafts exist to try");
      for (const id of drafts) {
        await goto(page, `/admin/creatives/${id}`);
        if (!NOT_FOUND.test(await text(page))) throw new Error("a client draft opened for the Team");
      }
      return `${drafts.length} draft(s) -> not-found for the Team`;
    }, { critical: true });
  }
  await step("D Isolation", anon, "Signed-out visitor fetches private media", "401 for every captured file", async () => {
    const urls = [...(found.client.media ?? []), ...(found.client2.media ?? [])];
    if (!urls.length) return blocked("no media captured");
    for (const u of urls) {
      const s = await mediaStatus(anon, u);
      if (s !== 401) throw new Error(`anonymous media -> ${s}`);
    }
    return `${urls.length} file(s) -> 401`;
  }, { critical: true });
}

async function phoneChecks(browser) {
  const m = await newRole(browser, "PHONE 390px", { width: 390, height: 844 });
  const l = await step("E Phone", m, "Client sign-in at 390px", "lands on /dashboard", () => signIn(m, ACCOUNTS.client, "/dashboard"));
  if (l.status !== "PASS") return;
  for (const [p, what] of [["/dashboard", "dashboard"], ["/dashboard/creatives", "submissions"], ["/dashboard/messages", "messages"]]) {
    await step("E Phone", m, `Client ${what} at 390px`, "no horizontal overflow", async (page) => {
      await goto(page, p);
      return overflow(page);
    }, { existing: true });
  }
  const id = found.client.creatives?.[0];
  if (id) {
    await step("E Phone", m, "Client submission page at 390px", "tabs fit, no horizontal overflow", async (page) => {
      await goto(page, `/dashboard/creatives/${id}`);
      return overflow(page);
    }, { existing: true });
  }
  await m.context.close();
}

async function fixtures(browser, anon, team, c1, c2) {
  if (!team.signedIn || !c1.signedIn) {
    results.push({ phase: "F Fixtures", role: "-", action: "Lifecycle on [SMOKE TEST] records", expected: "", actual: "Team or Client 1 sign-in failed", status: "BLOCKED", screenshot: null, url: "" });
    return;
  }
  const fx = found.fx;
  const project = `${TAG} Production smoke project`;
  const creative = `${TAG} Smoke reminder — Feed post`;

  if (REUSE_DRAFT) {
    const r = await step("F Fixtures", c1, `Reuse the existing [SMOKE TEST] draft (${REUSE_DRAFT === "latest" ? "newest in the list" : "given id"})`, "draft opens in Draft state for Client 1", async (page) => {
      let id = REUSE_DRAFT;
      if (id === "latest") {
        await goto(page, "/dashboard/creatives");
        const links = page.locator('a[href*="/dashboard/creatives/"]', { hasText: /SMOKE TEST/ });
        if (!(await links.count())) throw new Error("no [SMOKE TEST] submission in Client 1's list");
        id = new URL(await links.first().getAttribute("href"), BASE).pathname.split("/").filter(Boolean).pop();
      }
      if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("the draft id must be the last part of its /dashboard/creatives/<id> address");
      await goto(page, `/dashboard/creatives/${id}`);
      const t = await text(page);
      if (NOT_FOUND.test(t)) throw new Error("the draft was not found for Client 1");
      if (!/SMOKE TEST/.test(t)) throw new Error("the submission is not labelled [SMOKE TEST]; refusing to touch it");
      if (!/Draft/.test(t)) throw new Error("the submission is not in Draft state; refusing to touch it");
      fx.creative = id;
      return `reusing draft <id>; no new project or draft created`;
    });
    if (r.status !== "PASS") return;
  }

  const p1 = REUSE_DRAFT ? { status: "PASS" } : await step("F Fixtures", team, "Create the [SMOKE TEST] project for Client 1", "project created and assigned", async (page) => {
    await goto(page, "/admin/projects/new");
    await page.locator('input[name="name"]').fill(project);
    if (!(await selectIfPresent(page, 'select[name="clientId"]', ACCOUNTS.client.email))) throw new Error("client not offered in the project form");
    await fillIfPresent(page, 'textarea[name="description"]', `${TAG} Synthetic project for the Production smoke test. Not client work.`);
    await page.getByRole("button", { name: /^Create project$/ }).click();
    await page.waitForURL(/\/admin\/projects\/[^/]+$/, { timeout: 30000 });
    await settle(page);
    fx.project = new URL(page.url()).pathname.split("/").pop();
    return "project created";
  });
  if (p1.status !== "PASS") return;

  const d1 = REUSE_DRAFT ? { status: "PASS" } : await step("F Fixtures", c1, "Create a draft submission", "draft opens in Draft state", async (page) => {
    await goto(page, "/dashboard/submissions/new");
    await page.locator('input[name="name"]').fill(creative);
    await selectIfPresent(page, 'select[name="projectId"]', project);
    const radio = page.locator('input[type="radio"][name="format"]');
    if (await radio.count()) await page.locator("label").filter({ has: radio.first() }).first().click();
    // The industry decides which verified policies apply; Submit stays disabled until one is chosen.
    const industry = page.locator('input[type="radio"][name="industry"]');
    if (await industry.count()) {
      const healthcare = page.locator('input[type="radio"][name="industry"][value="HEALTHCARE"]');
      await page.locator("label").filter({ has: (await healthcare.count()) ? healthcare : industry.first() }).first().click();
    }
    for (const name of ["markets", "platforms"]) {
      const box = page.locator(`input[type="checkbox"][name="${name}"]`);
      if ((await box.count()) && !(await box.first().isChecked())) await page.locator("label").filter({ has: box.first() }).first().click();
    }
    await fillIfPresent(page, 'textarea[name="description"]', `${TAG} Synthetic creative. Not a real advertisement.`);
    await page.getByRole("button", { name: /^Create draft$/ }).click();
    await page.waitForURL(/\/dashboard\/creatives\/[^/]+$/, { timeout: 30000 });
    await settle(page);
    fx.creative = new URL(page.url()).pathname.split("/").pop();
    await expectText(page, /Draft/, "Draft state");
    return "draft created";
  });
  if (d1.status !== "PASS") return;

  await step("F Fixtures", team, "Draft is private to the client", "Team gets not-found for the new draft", async (page) => {
    await goto(page, `/admin/creatives/${fx.creative}`);
    if (!NOT_FOUND.test(await text(page))) throw new Error("the draft opened for the Team");
    return "not-found for the Team";
  }, { critical: true });

  const up1 = await step("F Fixtures", c1, CREATIVE ? `Upload V1: labelled creative ${basename(CREATIVE)} (Production Blob, private)` : "Upload V1 (Production Blob, private)", "V1 listed; preview loads from /api/media", async (page) => {
    const r = await uploadVersion(page, 1);
    if (r.urls) fx.media = r.urls;
    return r;
  });
  if (up1.status === "PASS") {
    await step("F Fixtures", anon, "Signed-out visitor fetches the new file", "401", async () => {
      const s = await mediaStatus(anon, fx.media[0]);
      if (s !== 401) throw new Error(`-> ${s}`);
      return "401";
    }, { critical: true });
  }
  const sub = await step("F Fixtures", c1, "Submit for review", "status leaves Draft", async (page) => {
    await goto(page, `/dashboard/creatives/${fx.creative}`);
    const btn = page.getByRole("button", { name: /^Submit for review$/ });
    if (!(await btn.count())) return blocked("no Submit button");
    if (await btn.first().isDisabled()) return blocked("Submit is disabled: the readiness checklist is incomplete (usually no uploaded file; see screenshot)");
    await btn.first().click();
    await page.waitForTimeout(2500);
    await settle(page);
    await expectText(page, /Submitted|With Clyntique|In review|Round 1/i, "submitted state");
    return "submitted (round 1)";
  });
  if (sub.status !== "PASS") return;

  await step("F Fixtures", c1, "Chat with the reviewer about this submission", "message appears in the thread", async (page) => {
    await openTab(page, "Messages");
    const ta = page.locator('textarea[name="body"]');
    if (!(await ta.count())) return blocked("no message box");
    await ta.first().fill(`${TAG} Question from the client (synthetic).`);
    await page.getByRole("button", { name: /^Send$/ }).first().click();
    await page.waitForTimeout(1500);
    await settle(page);
    await expectText(page, "Question from the client (synthetic)", "sent message");
    return "message sent";
  });

  await step("F Fixtures", team, "Team sees the submission; media 200", "listed, opens, image loads", async (page) => {
    await goto(page, `/admin/creatives/${fx.creative}`);
    await expectText(page, creative, "submission title");
    if (!fx.media) return blocked("no V1 media (upload did not run)");
    const s = await mediaStatus(team, fx.media[0]);
    if (s !== 200) throw new Error(`media -> ${s}`);
    return "opens; media 200";
  });
  await step("F Fixtures", team, "Run AI scan (0 verified rules)", "'Insufficient policy coverage — manual review required'; never an approval", async (page) => {
    await openTab(page, "AI Compliance");
    const btn = page.getByRole("button", { name: /Run AI Scan|Re-run AI Scan/i });
    if (!(await btn.count())) return blocked("no Run AI Scan button in this state");
    await btn.first().click();
    await page.waitForFunction(() => !/Scanning Creative/.test(document.body.innerText), null, { timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const t = await text(page);
    if (APPROVAL_CLAIM.test(t)) throw new Error("approval claim shown");
    if (!COVERAGE.test(t)) return { status: "FAIL", text: `coverage warning not shown: ${t.slice(t.search(/AI Compliance/i), t.search(/AI Compliance/i) + 160)}` };
    const hist = t.includes("Scan history") ? t.slice(t.indexOf("Scan history")) : "";
    if (!/No verified rules covered this scope/.test(hist)) return { status: "FAIL", text: "warning shown, but the run is not in Scan history without a reload" };
    return "insufficient coverage reported; run listed in Scan history without reload";
  });
  await step("F Fixtures", team, "Start review, add a finding, request changes", "Waiting on the client", async (page) => {
    await goto(page, `/admin/creatives/${fx.creative}`);
    await page.getByRole("button", { name: /^Start review$/ }).first().click();
    await page.waitForTimeout(2000);
    await settle(page);
    await openTab(page, "Findings");
    await page.getByRole("button", { name: /\+ Add finding/ }).first().click();
    await page.locator('input[name="issue"]').fill(`${TAG} Clarify the offer wording`);
    await page.locator('textarea[name="explanation"]').fill(`${TAG} Synthetic finding for the smoke test.`);
    await page.locator("label", { hasText: /^Low/ }).first().click();
    await selectIfPresent(page, 'select[name="requiredAction"]', "CLARIFY");
    await fillIfPresent(page, 'textarea[name="actionDetails"]', `${TAG} Reword the offer.`);
    await page.getByRole("button", { name: /Save draft finding/ }).click();
    await page.waitForTimeout(2000);
    await settle(page);
    await page.locator("summary", { hasText: "Request changes" }).first().click();
    await page.locator('form:has(button:has-text("Request changes")) textarea[name="summary"]').fill(`${TAG} Please clarify the offer.`);
    await page.getByRole("button", { name: /^Request changes$/ }).last().click();
    await page.waitForTimeout(2500);
    await settle(page);
    await expectText(page, /Waiting on the client/, "waiting state");
    return "changes requested with 1 finding";
  });
  await step("F Fixtures", c1, "Respond to the finding", "response saved", async (page) => {
    await goto(page, `/dashboard/creatives/${fx.creative}`);
    await openTab(page, "Findings");
    await expectText(page, "Clarify the offer wording", "finding");
    await page.getByRole("button", { name: /^Respond$/ }).first().click();
    await page.locator('textarea[name="message"]').first().fill(`${TAG} Offer reworded (synthetic).`);
    await page.getByRole("button", { name: /Send response/ }).first().click();
    await page.waitForTimeout(2000);
    await settle(page);
    await expectText(page, "Offer reworded (synthetic)", "response");
    return "response visible";
  });
  await step("F Fixtures", c1, "Add evidence (link)", "evidence listed", async (page) => {
    await openTab(page, "Evidence");
    const add = page.getByRole("button", { name: /^\+?\s*Add evidence$/i });
    if (await add.count()) await add.first().click();
    if (!(await page.locator('input[name="title"]').count())) return blocked("no evidence form");
    await page.locator('input[name="title"]').first().fill(`${TAG} Offer terms page`);
    await selectIfPresent(page, 'select[name="type"]', "SOURCE");
    await fillIfPresent(page, 'input[name="url"]', "https://example.com/offer-terms");
    await fillIfPresent(page, 'textarea[name="description"]', `${TAG} Synthetic evidence.`);
    await page.getByRole("button", { name: /^Add evidence$/i }).last().click();
    await page.waitForTimeout(2000);
    await settle(page);
    await expectText(page, "Offer terms page", "evidence");
    return "evidence listed";
  });
  await step("F Fixtures", c1, "Upload V2", "V2 listed; preview loads", async (page) => {
    await goto(page, `/dashboard/creatives/${fx.creative}`);
    const r = await uploadVersion(page, 2);
    if (r.urls) fx.media = [...new Set([...(fx.media ?? []), ...r.urls])];
    return r;
  });
  await step("F Fixtures", c1, "Resubmit for review (round 2)", "back with Clyntique", async (page) => {
    await goto(page, `/dashboard/creatives/${fx.creative}`);
    const btn = page.getByRole("button", { name: /Resubmit for review/ });
    if (!(await btn.count())) return blocked("no Resubmit button");
    if (await btn.first().isDisabled()) return blocked("Resubmit disabled (needs a new version)");
    await btn.first().click();
    await page.waitForTimeout(2500);
    await settle(page);
    await expectText(page, /With Clyntique|Resubmitted|round 2/i, "resubmitted");
    return "resubmitted";
  });
  await step("F Fixtures", team, "Review round 2: response, evidence, resolve, complete", "Review complete with the internal-review disclaimer", async (page) => {
    await goto(page, `/admin/creatives/${fx.creative}`);
    await page.getByRole("button", { name: /^Start review$/ }).first().click();
    await page.waitForTimeout(2000);
    await settle(page);
    await openTab(page, "Findings");
    await expectText(page, "Offer reworded (synthetic)", "client response");
    await openTab(page, "Evidence");
    await expectText(page, "Offer terms page", "client evidence");
    await openTab(page, "Findings");
    await page.getByRole("button", { name: /^Resolve$/ }).first().click();
    await page.locator('textarea[name="note"]').first().fill(`${TAG} Accepted.`);
    await page.getByRole("button", { name: /Resolve finding/ }).first().click();
    await page.waitForTimeout(2000);
    await settle(page);
    await page.locator("summary", { hasText: "Complete review" }).first().click();
    await page.locator("label", { hasText: /^Issues resolved/ }).first().click();
    await page.locator('form:has(button:has-text("Complete review")) textarea[name="summary"]').fill(`${TAG} Resolved.`);
    await page.getByRole("button", { name: /^Complete review$/ }).last().click();
    await page.waitForTimeout(2500);
    await settle(page);
    const t = await expectText(page, /Review complete/, "complete state");
    if (!/Internal human review only|not (a )?(legal|regulatory|government|platform)/i.test(t)) return { status: "FAIL", text: "complete, but the internal-review disclaimer is missing" };
    return "complete; disclaimer shown";
  });
  await step("F Fixtures", team, "History shows both rounds and versions", "round 2 and V2 in History", async (page) => {
    await openTab(page, "History");
    const t = await text(page);
    if (!/round 2|R2/i.test(t) || !/\bV2\b/.test(t)) return { status: "FAIL", text: "round 2 or V2 missing from History" };
    return "round 2 and V2 present";
  });
  await step("F Fixtures", team, "Reply in the chat", "reply sent; client message visible", async (page) => {
    await goto(page, "/admin/messages");
    const link = page.locator('a[href*="/admin/messages/"]', { hasText: /SMOKE TEST|Smoke reminder/ });
    if (!(await link.count())) return { status: "FAIL", text: "the smoke conversation is not in the Team inbox" };
    fx.conversation = (await link.first().getAttribute("href"))?.split("/").pop();
    await link.first().click();
    await settle(page);
    await expectText(page, "Question from the client (synthetic)", "client message");
    await page.locator('textarea[name="body"]').first().fill(`${TAG} Reply from the reviewer (synthetic).`);
    await page.getByRole("button", { name: /^Send$/ }).click();
    await page.waitForTimeout(1500);
    await settle(page);
    await expectText(page, "Reply from the reviewer (synthetic)", "reply");
    return "reply sent";
  });
  await step("F Fixtures", c1, "Client receives the reply", "reply visible", async (page) => {
    await goto(page, `/dashboard/creatives/${fx.creative}`);
    await openTab(page, "Messages");
    await expectText(page, "Reply from the reviewer (synthetic)", "reply");
    return "reply visible to the client";
  });
  await step("F Fixtures", team, "Review record", "disclaimer, Print/PDF, record code", async (page) => {
    await goto(page, `/admin/creatives/${fx.creative}/record`);
    await expectText(page, RECORD_DISCLAIMER, "disclaimer");
    await expectNoText(page, APPROVAL_CLAIM, "approval claim");
    if (!(await page.getByRole("button", { name: /Print/i }).count())) throw new Error("Print button missing");
    return "record renders";
  });
  await step("F Fixtures", team, "Record an external submission and outcome", "labelled 'Recorded manually…' with the basis", async (page) => {
    let form = page.locator("form").filter({ has: page.locator('select[name="destinationType"]') });
    if (!(await form.count())) {
      const toggle = page.getByRole("button", { name: /^Record external submission$/i });
      if (await toggle.count()) await toggle.first().click();
      form = page.locator("form").filter({ has: page.locator('select[name="destinationType"]') });
    }
    if (!(await form.count())) return blocked("external submission form not offered");
    await selectIfPresent(form, 'select[name="destinationType"]', "AD_PLATFORM");
    await fillIfPresent(form, 'input[name="destinationName"]', `${TAG} Ad platform (synthetic)`);
    await selectIfPresent(form, 'select[name="platformCode"]', "META");
    await fillIfPresent(form, 'input[name="submittedOn"]', new Date().toISOString().slice(0, 10));
    await fillIfPresent(form, 'textarea[name="note"]', `${TAG} Nothing was really submitted.`);
    await form.getByRole("button", { name: /Record external submission/i }).click();
    await page.waitForTimeout(1500);
    await settle(page);
    await expectText(page, EXTERNAL_DISCLAIMER, "manual-record disclaimer");
    const toggle = page.getByRole("button", { name: /^Record outcome$/i });
    if (await toggle.count()) await toggle.first().click();
    const out = page.locator("form").filter({ has: page.locator('select[name="kind"]') });
    if (!(await out.count())) return blocked("submission recorded; outcome form not offered");
    await selectIfPresent(out, 'select[name="kind"]', "APPROVED");
    await fillIfPresent(out, 'input[name="outcomeOn"]', new Date().toISOString().slice(0, 10));
    await fillIfPresent(out, 'textarea[name="note"]', `${TAG} Synthetic outcome.`);
    await selectIfPresent(out, 'select[name="basis"]', "TEAM_VERIFIED");
    await out.first().getByRole("button", { name: /^Record outcome/i }).click();
    await page.waitForTimeout(1500);
    await settle(page);
    const t = await text(page);
    const label = t.match(/Approved by external authority\/platform \([^)]+\)/)?.[0];
    if (!label) throw new Error("qualified outcome label not shown");
    return `recorded; label "${label}"`;
  });
  await step("F Fixtures", team, "Open a re-review", "cycle 2 opens; cycle 1 kept", async (page) => {
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: /Open re-review/i }) });
    if (!(await form.count())) return blocked("re-review form not offered");
    await selectIfPresent(form, 'select[name="reason"]', "TEAM_REQUEST");
    await fillIfPresent(form, 'textarea[name="note"]', `${TAG} Synthetic re-review.`);
    await form.first().getByRole("button", { name: /Open re-review/i }).click();
    await page.waitForTimeout(1500);
    await settle(page);
    await expectText(page, /Cycle 2|cycle 2/, "cycle 2");
    return "cycle 2 opened";
  });
  await step("F Fixtures", c1, "Client view of the review record", "disclaimer; external status with its basis", async (page) => {
    await goto(page, `/dashboard/creatives/${fx.creative}/record`);
    await expectText(page, RECORD_DISCLAIMER, "disclaimer");
    await expectNoText(page, APPROVAL_CLAIM, "approval claim");
    return "record visible to the client";
  });
  if (c2?.signedIn) {
    await step("F Isolation", c2, "Client 2 tries the smoke submission, record, media and chat", "not-found / 404 everywhere", async (page) => {
      for (const p of [`/dashboard/creatives/${fx.creative}`, `/dashboard/creatives/${fx.creative}/record`, ...(fx.conversation ? [`/dashboard/messages/${fx.conversation}`] : [])]) {
        await goto(page, p);
        const t = await text(page);
        if (/SMOKE TEST|synthetic/i.test(t) || !NOT_FOUND.test(t)) throw new Error(`${p.replace(fx.creative, "<id>")} did not show not-found`);
      }
      for (const u of fx.media ?? []) {
        const s = await mediaStatus(c2, u);
        if (s !== 404) throw new Error(`media -> ${s}`);
      }
      await goto(page, "/dashboard/projects");
      await expectNoText(page, /SMOKE TEST/, "smoke project in Client 2's list");
      return "nothing visible to Client 2";
    }, { critical: true });
  }
}

async function main() {
  log(`Clyntique Production smoke test against ${BASE}; mode: ${FIXTURES ? `read-only + fixtures labelled "${TAG}"${CREATIVE ? ` with V1 from ${basename(CREATIVE)}` : ""}${REUSE_DRAFT ? ` reusing draft ${REUSE_DRAFT}` : ""}` : "read-only"}; output ${OUT}`);
  const browser = await chromium.launch({ headless: !argv.includes("--headed"), ...(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}) });
  const anon = await newRole(browser, "ANONYMOUS");
  const team = await newRole(browser, "TEAM");
  const c1 = await newRole(browser, "CLIENT 1");
  const c2 = ACCOUNTS.client2 ? await newRole(browser, "CLIENT 2") : null;
  let stopped = null;
  try {
    await readOnly(browser, anon, team, c1, c2);
    await phoneChecks(browser);
    if (FIXTURES) await fixtures(browser, anon, team, c1, c2);
  } catch (e) {
    if (!(e instanceof CriticalStop)) throw e;
    stopped = scrub(e.message);
    log(`\nCRITICAL: ${stopped}\nTesting stopped. Report this before doing anything else.`);
  } finally {
    await browser.close();
  }
  if (!FIXTURES) {
    results.push({ phase: "F Fixtures", role: "-", action: "Uploads, submission, review loop, chat, AI scan, external outcome, re-review on [SMOKE TEST] records", expected: "", actual: "not run: needs --fixtures after approval", status: "BLOCKED", screenshot: null, url: "" });
  }

  const counts = { PASS: 0, FAIL: 0, BLOCKED: 0 };
  for (const r of results) counts[r.status] += 1;
  const md = [
    `# Clyntique Production smoke test`,
    ``,
    `Target ${BASE} · run ${STAMP} UTC · mode ${FIXTURES ? `read-only + fixtures (records labelled "${TAG}")` : "read-only (no data changed)"}`,
    stopped ? `\n**CRITICAL: testing stopped.** ${stopped}\n` : ``,
    `**${counts.PASS} PASS · ${counts.FAIL} FAIL · ${counts.BLOCKED} BLOCKED** (${results.length} checks). BLOCKED means not executed or not possible, never passed.`,
    ``,
    `| # | Part | Role | Check | Expected | Result | Detail | Screenshot |`,
    `|---|---|---|---|---|---|---|---|`,
    ...results.map((r, i) => `| ${i + 1} | ${r.phase} | ${r.role} | ${r.action} | ${r.expected} | **${r.status}** | ${r.actual.replace(/\|/g, "/")} | ${r.screenshot ?? ""} |`),
    ``,
    `## Browser errors`,
    ...Object.entries(diagnostics).flatMap(([role, d]) => [
      `- ${role}: ${d.serverErrors.length} server error(s), ${d.pageErrors.length} page error(s), ${d.consoleErrors.length} console error(s)`,
      ...[...new Set([...d.serverErrors, ...d.pageErrors, ...d.consoleErrors])].slice(0, 10).map((e) => `  - ${e.replace(/\|/g, "/")}`),
    ]),
    ``,
    `Screenshots of pages with existing client data have the page content masked. No passwords, cookies or tokens are stored.`,
  ];
  writeFileSync(join(OUT, "report.md"), scrub(md.join("\n")));
  writeFileSync(join(OUT, "results.json"), scrub(JSON.stringify({ base: BASE, stamp: STAMP, fixtures: FIXTURES, tag: FIXTURES ? TAG : null, stopped, counts, results, diagnostics }, null, 2)));
  log(`\n${counts.PASS} PASS, ${counts.FAIL} FAIL, ${counts.BLOCKED} BLOCKED. Report: ${join(OUT, "report.md")}`);
  process.exitCode = stopped ? 3 : counts.FAIL ? 1 : 0;
}

main().catch((e) => {
  console.error(scrub(e?.stack ?? e));
  process.exitCode = 2;
});
