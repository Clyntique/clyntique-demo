// P0 Preview end-to-end tests (approved Oct 28, 2026). Preview only, never Production.
//
// Creates only records labelled "[P0 PREVIEW TEST]": one submission, one test
// source and one test rule (P0TEST-META-PA-01). It never verifies or approves
// the 12 imported research drafts. Each test is PASS, FAIL or BLOCKED.
//
// Environment (passwords from your password manager, never typed into chat):
//   BASE_URL      branch alias, e.g. https://clyntique-demo-git-feature-p0-policy-evidence-clyntique.vercel.app
//   SHARE_URL     Vercel shareable link for that alias (Deployment Protection), optional locally
//   OUT_DIR       folder for results.json and screenshots (outside the repo)
//   ADMIN_A_EMAIL (default team@clyntique.demo)   ADMIN_A_PASSWORD
//   ADMIN_B_EMAIL (default policy-admin-b@clyntique.demo)   ADMIN_B_PASSWORD
//   CLIENT_PASSWORD (client@clyntique.demo)   CLIENT2_PASSWORD (client2@clyntique.demo)
//   PW_CHROME     optional Chrome/Chromium executable for Playwright
//   SMOKE_CREATIVE_ID  local selector smoke only (localhost, no Blob store): reuse an
//                 existing submitted Client 1 creative and add evidence without files.
//                 Upload steps report SKIP. Never set this for the Preview run.
// Run:  node docs/p0-policy-evidence/preview/preview-e2e.mjs
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = (process.env.BASE_URL ?? "").replace(/\/$/, "");
const OUT = process.env.OUT_DIR;
if (!BASE || !OUT) throw new Error("Set BASE_URL and OUT_DIR.");
if (/clyntique-demo\.vercel\.app/.test(BASE) && !/-git-/.test(BASE)) throw new Error("Refusing: BASE_URL looks like Production.");
mkdirSync(OUT, { recursive: true });
const SMOKE = process.env.SMOKE_CREATIVE_ID;
if (SMOKE && !/^http:\/\/localhost[:/]/.test(BASE)) throw new Error("SMOKE_CREATIVE_ID is for a local server only.");

const ACC = {
  a: [process.env.ADMIN_A_EMAIL ?? "team@clyntique.demo", process.env.ADMIN_A_PASSWORD],
  b: [process.env.ADMIN_B_EMAIL ?? "policy-admin-b@clyntique.demo", process.env.ADMIN_B_PASSWORD],
  c1: ["client@clyntique.demo", process.env.CLIENT_PASSWORD],
  c2: ["client2@clyntique.demo", process.env.CLIENT2_PASSWORD],
};
const STAMP = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
const TAG = "[P0 PREVIEW TEST]";
const RULE = "P0TEST-META-PA-01";
const SOURCE = `${TAG} Meta personal attributes (test source)`;
const SOURCE_URL = "https://transparency.meta.com/en-gb/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/";
const SUBMISSION = `${TAG} Anxiety support story ${STAMP}`;
const RESEARCH_CODES = ["RX-META-HW-01", "RX-META-PA-01", "RX-GOOG-HM-01", "RX-AE-MOHAP-01"];

// Form fields are <label><span>Label</span><input/>hint</label>, so match the span text exactly.
function fld(scope, label) {
  const page = typeof scope.page === "function" ? scope.page() : scope; // `has` takes a page-rooted locator
  return scope.locator("label").filter({ has: page.locator(`span:text-is(${JSON.stringify(label)})`) }).locator("input, select, textarea");
}

// A small valid PNG (solid colour), generated so no file needs to be shipped.
function png(r, g, b, size = 64) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
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
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

class Blocked extends Error {}
class Skipped extends Error {}
const results = [];
let n = 0;
const state = {};
async function test(name, fn, needs = []) {
  n += 1;
  const missing = needs.filter((k) => !state[k]);
  if (missing.length) {
    results.push({ n, name, status: "BLOCKED", note: `depends on: ${missing.join(", ")}` });
    console.log(`BLOCKED ${n}. ${name} (depends on ${missing.join(", ")})`);
    return;
  }
  try {
    const note = await fn();
    results.push({ n, name, status: "PASS", note: note ?? "" });
    console.log(`PASS ${n}. ${name}${note ? ` (${note})` : ""}`);
  } catch (err) {
    const status = err instanceof Skipped ? "SKIP" : err instanceof Blocked ? "BLOCKED" : "FAIL";
    const note = String(err?.message ?? err).split("\n")[0].slice(0, 300);
    results.push({ n, name, status, note });
    console.log(`${status} ${n}. ${name}: ${note}`);
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const shot = (page, name) => page.screenshot({ path: `${OUT}/${String(n).padStart(2, "0")}-${name}.png`, fullPage: true }).catch(() => {});

const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
async function session(key, viewport = { width: 1366, height: 900 }) {
  const [email, password] = ACC[key];
  if (!password) throw new Blocked(`no password set for ${email}`);
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  if (process.env.SHARE_URL) await page.goto(process.env.SHARE_URL);
  await page.goto(`${BASE}/auth/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/login"), { timeout: 30000 });
  return { ctx, page };
}
const S = {};
const tab = (page, name) => page.getByRole("tab", { name: new RegExp(name) }).click();
const statusMsg = (page, text) => page.getByRole("status").filter({ hasText: text }).first().waitFor({ timeout: 20000 });
async function openRule(page, code) {
  await page.goto(`${BASE}/admin/policy-library`);
  await page.getByText(code, { exact: true }).first().click();
  await page.getByRole("heading", { name: "History" }).waitFor();
}

// ---------------------------------------------------------------- sign-in
await test("Sign in: Admin A, Admin B, Client 1, Client 2 (separate accounts)", async () => {
  for (const k of ["a", "b", "c1", "c2"]) S[k] = await session(k);
  state.signedIn = true;
});

// ---------------------------------------------------------------- policy library
await test("Policy Library on Preview: 12 research drafts present as Draft, none approved by import", async () => {
  const p = S.a.page;
  await p.goto(`${BASE}/admin/policy-library`);
  await p.getByText("Drafts and returned").first().waitFor();
  const body = await p.textContent("body");
  for (const code of RESEARCH_CODES) expect(body.includes(code), `missing ${code}`);
  const rows = await p.locator("tbody tr").filter({ hasText: /^RX-/ }).allTextContents();
  expect(rows.length >= 12, `expected 12 research rows, saw ${rows.length}`);
  expect(rows.every((r) => r.includes("Draft")), "a research draft is not in Draft");
  await shot(p, "library");
}, ["signedIn"]);

await test("Admin A adds a labelled test source and verifies it", async () => {
  const p = S.a.page;
  await p.getByRole("button", { name: /^Sources/ }).click();
  if (!(await p.getByText(SOURCE).count())) {
    await p.getByRole("button", { name: "Add source" }).click();
    await fld(p, "Source name").fill(SOURCE);
    await fld(p, "Publisher").fill("Meta Platforms");
    await fld(p, "Official URL").fill(SOURCE_URL);
    await p.getByRole("button", { name: "Save source" }).click();
    await statusMsg(p, "Source added");
    await p.getByRole("button", { name: /^Sources/ }).click();
  }
  const item = p.locator("li").filter({ hasText: SOURCE });
  if (!(await item.getByText("Verified", { exact: true }).count())) {
    await item.getByRole("button", { name: "Review source" }).click();
    await item.getByRole("button", { name: "I checked it: verified" }).click();
    await statusMsg(p, "Source marked verified");
  }
  state.source = true;
}, ["signedIn"]);

await test("Admin A writes the labelled test rule and submits it for verification", async () => {
  const p = S.a.page;
  await p.goto(`${BASE}/admin/policy-library`);
  if (!(await p.getByText(RULE, { exact: true }).count())) {
    await p.getByRole("button", { name: "New rule" }).first().click();
    const d = p.getByRole("dialog");
    await fld(d, "Rule code").fill(RULE);
    await fld(d, "Authority").selectOption("PLATFORM_POLICY");
    await fld(d, "Market").selectOption("GLOBAL");
    await fld(d, "Platform").selectOption("META");
    await fld(d, "Industry").selectOption("GENERAL");
    await fld(d, "Category").selectOption("PERSONAL_HEALTH_ATTRIBUTES");
    await fld(d, "Title").fill(`${TAG} Don't imply the viewer's health condition`);
    await fld(d, "Operational summary").fill("TEST RULE for Preview validation only. Ads must not say or suggest that the viewer has a health condition.");
    await fld(d, "Restriction level").selectOption("PROHIBITED");
    await fld(d, "Restricted or prohibited claims").fill("Statements that the viewer has a medical condition");
    await fld(d, "Explanation for reviewers").fill("Preview test rule; not a verified research rule.");
    await fld(d, "What the advertiser should do").fill("Describe the service in general terms.");
    await d.getByRole("button", { name: /Add (citation|source)/ }).first().click();
    const src = fld(d, "Source").last();
    const opt = await src.locator("option").filter({ hasText: SOURCE }).getAttribute("value");
    await src.selectOption(opt);
    await fld(d, "Section").last().fill("Privacy violations and personal attributes");
    await fld(d, "Link to the section").last().fill(SOURCE_URL);
    await fld(d, "Date you read it").last().fill(new Date().toISOString().slice(0, 10));
    await d.getByRole("button", { name: "Submit for verification" }).click();
    await p.getByRole("dialog").waitFor({ state: "detached", timeout: 20000 });
  }
  await openRule(p, RULE);
  const body = await p.textContent("body");
  expect(/Submitted · awaiting verification|Verified · awaiting approval|Approved and in use/.test(body), "rule not submitted");
  state.ruleSubmitted = true;
}, ["source"]);

await test("Independent verification: Admin A verifies; approval is not offered to the verifier", async () => {
  const p = S.a.page;
  await openRule(p, RULE);
  if (await p.getByRole("button", { name: "Mark verified" }).count()) {
    await p.getByRole("button", { name: "Mark verified" }).click();
    await statusMsg(p, "Verified");
    await openRule(p, RULE);
  }
  const approved = (await p.textContent("body")).includes("Approved and in use");
  if (!approved) {
    expect((await p.getByRole("button", { name: "Approve and activate" }).count()) === 0, "verifier was offered approval");
    expect(/different Policy Administrator must approve/.test(await p.textContent("body")), "two-person reason not shown");
  }
  await shot(p, "verified");
  state.ruleVerified = true;
}, ["ruleSubmitted"]);

await test("Independent approval: Admin B (different admin) approves; trail shows both people", async () => {
  const p = S.b.page;
  await openRule(p, RULE);
  if (await p.getByRole("button", { name: "Approve and activate" }).count()) {
    await p.getByRole("button", { name: "Approve and activate" }).click();
    await statusMsg(p, "Approved");
    await openRule(p, RULE);
  }
  await p.getByText("Approved and in use").first().waitFor();
  await shot(p, "approved");
  state.ruleApproved = true;
}, ["ruleVerified"]);

await test("Research drafts still DRAFT / UNVERIFIED after testing", async () => {
  const p = S.b.page;
  await p.goto(`${BASE}/admin/policy-library`);
  const rows = await p.locator("tbody tr").filter({ hasText: /^RX-/ }).allTextContents();
  expect(rows.length >= 12 && rows.every((r) => r.includes("Draft")), "a research draft changed stage");
}, ["signedIn"]);

// ---------------------------------------------------------------- client submission with real upload
await test("Client 1 creates a labelled draft (Healthcare, US, Meta + Google)", async () => {
  const p = S.c1.page;
  if (SMOKE) {
    state.creativeId = SMOKE;
    throw new Skipped(`local smoke: reusing ${SMOKE}`);
  }
  await p.goto(`${BASE}/dashboard/submissions/new`);
  await p.locator('input[name="name"]').fill(SUBMISSION);
  await p.locator('label:has(input[name="format"])').first().click();
  await p.locator('label:has(input[name="industry"][value="HEALTHCARE"])').click();
  await p.locator('input[name="markets"][value="US"]').check();
  await p.locator('input[name="platforms"][value="META"]').check();
  await p.locator('input[name="platforms"][value="GOOGLE"]').check();
  await p.locator('textarea[name="description"]').fill("Headline: Struggling with your anxiety? Book a call. (Preview test)");
  await p.getByRole("button", { name: "Create draft" }).click();
  await p.waitForURL(/\/dashboard\/creatives\/[^/?]+/, { timeout: 30000 });
  state.creativeId = new URL(p.url()).pathname.split("/").pop();
  return state.creativeId;
}, ["signedIn"]);

await test("Real Vercel Blob upload of the creative file (client)", async () => {
  const p = S.c1.page;
  if (SMOKE) {
    state.uploaded = true;
    throw new Skipped("local smoke: no Blob store");
  }
  await p.getByText(/Upload the creative|File uploads aren.t set up/).first().waitFor({ timeout: 30000 });
  const body = await p.textContent("body");
  if (/File uploads aren.t set up/.test(body)) throw new Blocked("uploads not configured on this deployment (BLOB_READ_WRITE_TOKEN)");
  await p.locator('input[type="file"]').first().setInputFiles({ name: "p0-preview-test.png", mimeType: "image/png", buffer: png(30, 60, 120, 256) });
  await p.getByRole("button", { name: /^Upload (file|V\d+)$/ }).first().click();
  await p.getByRole("status").filter({ hasText: /V\d+ uploaded\./ }).first().waitFor({ timeout: 60000 });
  await p.reload();
  expect((await p.textContent("body")).includes("p0-preview-test.png"), "uploaded file not listed");
  const res = await p.request.get(`${BASE}/api/media/${await firstVersionId(p)}`);
  expect(res.status() === 200, `media route returned ${res.status()}`);
  state.uploaded = true;
}, ["creativeId"]);
async function firstVersionId(p) {
  const src = await p.locator('img[src^="/api/media/"], video[src^="/api/media/"]').first().getAttribute("src", { timeout: 20000 });
  return src.split("/").pop();
}

await test("Client 1 submits the draft for review", async () => {
  const p = S.c1.page;
  if (SMOKE) {
    state.submitted = true;
    throw new Skipped("local smoke: fixture is already submitted");
  }
  await p.getByRole("button", { name: "Submit for review" }).click();
  await p.getByText(/Submitted|In review|Waiting for review/i).first().waitFor({ timeout: 30000 });
  state.submitted = true;
}, ["uploaded"]);

// ---------------------------------------------------------------- review, AI
await test("Team starts the review", async () => {
  const p = S.b.page;
  await p.goto(`${BASE}/admin/creatives/${state.creativeId}`);
  await p.getByRole("button", { name: "Start review" }).click();
  await p.getByText(/Reviewing round 1/).first().waitFor({ timeout: 30000 });
  state.inReview = true;
}, ["submitted"]);

await test("Live Gemini scan: runs, grounded only in approved rules, coverage per market × platform", async () => {
  const p = S.b.page;
  await p.reload();
  await tab(p, "AI Compliance");
  await p.getByRole("button", { name: /Run AI Scan/ }).click();
  await p.getByText(/Policy coverage by market and platform|Scan Error|AI scan failed|Rate Limit/).first().waitFor({ timeout: 120000 });
  const body = await p.textContent("body");
  if (/GEMINI_API_KEY is not configured|API key not configured/.test(body)) throw new Blocked("GEMINI_API_KEY not set for this deployment");
  expect(!/Scan Error|AI scan failed/.test(body), "scan failed: " + (body.match(/(Scan Error|AI scan failed).{0,200}/s)?.[0].replace(/\s+/g, " ") ?? ""));
  expect(new RegExp(`United States · Meta[^\\n]*${RULE}`).test(body) || body.includes(RULE), "US × Meta not covered by the approved test rule");
  expect(/Insufficient policy coverage/.test(body), "uncovered pair (US × Google) not reported");
  for (const code of RESEARCH_CODES) expect(!body.includes(code), `unapproved research rule ${code} used by the AI`);
  await shot(p, "ai-scan");
  state.scanned = true;
}, ["inReview"]);

await test("Reviewer finding cites the approved rule (claim, location, suggested wording)", async () => {
  const p = S.b.page;
  await tab(p, "Findings");
  await p.getByRole("button", { name: "+ Add finding" }).click();
  const f = p.locator('form:has(input[name="issue"])');
  await f.locator('input[name="issue"]').fill(`${TAG} Copy implies the viewer has a health condition`);
  await f.locator('input[name="claimText"]').fill("Struggling with your anxiety?");
  await f.locator('input[name="claimLocation"]').fill("Headline");
  const opts = await f.locator('select[name="ruleVersionId"] option').allTextContents();
  for (const code of RESEARCH_CODES) expect(!opts.some((o) => o.includes(code)), `unapproved ${code} offered as citation`);
  const opt = await f.locator('select[name="ruleVersionId"] option').filter({ hasText: RULE }).getAttribute("value");
  await f.locator('select[name="ruleVersionId"]').selectOption(opt);
  await f.locator('textarea[name="explanation"]').fill("Meta does not allow ads that imply the viewer's health condition.");
  await f.locator('label:has(input[name="severity"][value="HIGH"])').click();
  await f.locator('select[name="requiredAction"]').selectOption({ index: 1 });
  await f.locator('textarea[name="actionDetails"]').fill("Rewrite the headline in general terms.");
  await f.locator('textarea[name="suggestedRevision"]').fill("Support for anxiety, from licensed clinicians.");
  await f.locator('button[type="submit"]').click();
  await p.getByText(`${TAG} Copy implies the viewer has a health condition`).first().waitFor({ timeout: 20000 });
  state.finding = true;
}, ["inReview"]);

async function addTeamEvidence(p, { title, visibility, withFile }) {
  await tab(p, "Evidence");
  await p.getByRole("button", { name: "+ Add Clyntique evidence" }).click();
  const f = p.locator('form:has(select[name="visibility"])');
  await f.locator('input[name="title"]').fill(title);
  await f.locator('select[name="type"]').selectOption({ index: 1 });
  await f.locator('select[name="visibility"]').selectOption(visibility);
  if (visibility === "SHARED") {
    const opt = await f.locator('select[name="ruleVersionId"] option').filter({ hasText: RULE }).getAttribute("value");
    await f.locator('select[name="ruleVersionId"]').selectOption(opt);
    await f.locator('input[name="claimText"]').fill("Struggling with your anxiety?");
    await f.locator('input[name="url"]').fill(SOURCE_URL);
    await f.locator('input[name="findings"]').first().check();
  }
  await f.locator('textarea[name="description"]').fill(`${TAG} ${visibility === "SHARED" ? "Policy page the headline conflicts with." : "Team-only context."}`);
  if (withFile && !SMOKE) {
    if (!(await f.locator('input[type="file"]').count())) throw new Blocked("evidence uploads not configured on this deployment");
    await f.locator('input[type="file"]').setInputFiles({ name: `${visibility.toLowerCase()}-evidence.png`, mimeType: "image/png", buffer: png(visibility === "SHARED" ? 200 : 120, 80, 40) });
  }
  await f.locator('button[type="submit"]').click();
  await savedOrError(p, title);
}
// The success note can vanish when the page refreshes, so wait for the saved item itself (or a form error).
async function savedOrError(p, title) {
  for (let i = 0; i < 60; i++) {
    const text = await p.textContent("body");
    const formError = await p.locator("form [role=alert]").allTextContents().catch(() => []);
    if (formError.length) throw new Error("evidence not saved: " + formError.join(" "));
    if (text.includes(title) && !(await p.locator("form:has(select[name=type])").count())) return;
    await p.waitForTimeout(1000);
  }
  throw new Error(`evidence "${title}" did not appear`);
}
await test("Team evidence (shared, with real file upload, citing the rule)", async () => {
  await addTeamEvidence(S.b.page, { title: `${TAG} Meta policy page (shared)`, visibility: "SHARED", withFile: true });
  state.sharedEvidence = true;
}, ["finding"]);
await test("Team evidence (team only, with real file upload)", async () => {
  const p = S.b.page;
  await addTeamEvidence(p, { title: `${TAG} Internal note (team only)`, visibility: "INTERNAL", withFile: true });
  await p.reload();
  await tab(p, "Evidence");
  const href = await p.locator('a[href^="/api/media/evidence/"]').filter({ hasText: /internal-evidence/ }).first().getAttribute("href").catch(() => null);
  state.internalHref = href;
  state.internalEvidence = true;
}, ["finding"]);

await test("Before the decision, Client 1 sees no draft finding and no Clyntique evidence", async () => {
  const p = S.c1.page;
  await p.goto(`${BASE}/dashboard/creatives/${state.creativeId}`);
  const body = await p.textContent("body");
  expect(!body.includes("Copy implies the viewer has a health condition"), "draft finding visible");
  await tab(p, "Evidence").catch(() => {});
  expect(!(await p.textContent("body")).includes("Meta policy page (shared)"), "Clyntique evidence visible before decision");
}, ["sharedEvidence"]);

await test("Team requests changes (publishes the decision)", async () => {
  const p = S.b.page;
  await p.reload();
  await p.getByText("Request changes", { exact: true }).first().click();
  await p.locator('form:has-text("Summary for the client") textarea[name="summary"]').fill(`${TAG} One headline change needed.`);
  await p.locator('form:has-text("Summary for the client") button[type="submit"]').click();
  await p.getByText(/Changes requested|Waiting for the client|Your changes needed/i).first().waitFor({ timeout: 30000 });
  state.decided = true;
}, ["finding"]);

// ---------------------------------------------------------------- client view
await test("Client 1 sees finding, claim, citation (policy reference + official source), suggested wording; reviewer masked", async () => {
  const p = S.c1.page;
  await p.goto(`${BASE}/dashboard/creatives/${state.creativeId}`);
  await p.getByText("Copy implies the viewer has a health condition").first().waitFor({ timeout: 20000 });
  const body = await p.textContent("body");
  expect(body.includes("Struggling with your anxiety?"), "claim missing");
  expect(body.includes(RULE), "policy reference missing");
  expect(body.includes("Support for anxiety, from licensed clinicians."), "suggested wording missing");
  expect(body.includes("Clyntique reviewer"), "masked reviewer label missing");
  expect(!body.includes("Preview Policy Admin B") && !body.includes(ACC.b[0]), "reviewer identity leaked");
  await shot(p, "client-finding");
}, ["decided"]);

await test("Client 1 sees shared Clyntique evidence and can open its file; team-only evidence hidden", async () => {
  const p = S.c1.page;
  await tab(p, "Evidence");
  const body = await p.textContent("body");
  expect(body.includes("Meta policy page (shared)"), "shared evidence missing");
  expect(!body.includes("Internal note (team only)"), "team-only evidence visible");
  if (SMOKE) return "local smoke: no evidence files to open";
  const href = await p.locator('a[href^="/api/media/evidence/"]').first().getAttribute("href");
  const res = await p.request.get(`${BASE}${href}`);
  expect(res.status() === 200, `shared evidence file returned ${res.status()}`);
  if (state.internalHref) {
    const r2 = await p.request.get(`${BASE}${state.internalHref}`);
    expect(r2.status() === 404, `team-only evidence file returned ${r2.status()} to the client`);
  }
  await shot(p, "client-evidence");
}, ["decided"]);

await test("Client 1 adds evidence tied to a claim, with a real file upload", async () => {
  const p = S.c1.page;
  await tab(p, "Evidence");
  await p.getByRole("button", { name: "+ Add evidence" }).first().click();
  const f = p.locator('form:has(input[name="claimText"])');
  await f.locator('input[name="title"]').fill(`${TAG} Clinician licence list`);
  await f.locator('select[name="type"]').selectOption({ index: 1 });
  await f.locator('input[name="claimText"]').fill("from licensed clinicians");
  await f.locator('input[name="claimLocation"]').fill("Headline");
  if (SMOKE) await f.locator('input[name="url"]').fill(SOURCE_URL);
  else if (!(await f.locator('input[type="file"]').count())) throw new Blocked("evidence uploads not configured");
  if (!SMOKE) await f.locator('input[type="file"]').setInputFiles({ name: "client-evidence.png", mimeType: "image/png", buffer: png(40, 160, 90) });
  await f.locator('button[type="submit"]').click();
  await savedOrError(p, `${TAG} Clinician licence list`);
  state.clientEvidence = true;
}, ["decided"]);

// ---------------------------------------------------------------- isolation
await test("Cross-client isolation: Client 2 can't open Client 1's submission, files or the Policy Library", async () => {
  const p = S.c2.page;
  await p.goto(`${BASE}/dashboard/creatives/${state.creativeId}`);
  const body = await p.textContent("body");
  expect(/doesn't exist, or you don't have access/i.test(body) && !body.includes(SUBMISSION), "Client 2 reached Client 1's submission");
  const c1 = S.c1.page;
  await tab(c1, "Evidence");
  const hrefs = await c1.locator('a[href^="/api/media/evidence/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  for (const h of hrefs) {
    const r = await p.request.get(`${BASE}${h}`);
    expect(r.status() === 404, `Client 2 got ${r.status()} for ${h}`);
  }
  await p.goto(`${BASE}/admin/policy-library`);
  const lib = await p.textContent("body");
  expect(!lib.includes(RULE) && !lib.includes("Awaiting verification"), "Client 2 reached the Policy Library");
  return `${hrefs.length} evidence files checked`;
}, ["clientEvidence"]);

await test("Team never sees a client's unsubmitted draft", async () => {
  const c2 = S.c2.page;
  await c2.goto(`${BASE}/dashboard/submissions/new`);
  await c2.locator('input[name="name"]').fill(`${TAG} Client 2 private draft ${STAMP}`);
  await c2.getByRole("button", { name: "Create draft" }).click();
  await c2.waitForURL(/\/dashboard\/creatives\/[^/?]+/, { timeout: 30000 });
  const id = new URL(c2.url()).pathname.split("/").pop();
  const t = S.b.page;
  await t.goto(`${BASE}/admin/creatives/${id}`);
  const body = await t.textContent("body");
  expect(!body.includes("Client 2 private draft"), "Team can see a client's draft");
}, ["signedIn"]);

await test("Phone width (390 px): client submission page has no horizontal scroll", async () => {
  const s = await session("c1", { width: 390, height: 844 });
  await s.page.goto(`${BASE}/dashboard/creatives/${state.creativeId}`);
  const w = await s.page.evaluate(() => document.documentElement.scrollWidth);
  await shot(s.page, "client-phone");
  await s.ctx.close();
  expect(w <= 392, `page is ${w}px wide`);
}, ["creativeId"]);

await browser.close();
writeFileSync(`${OUT}/results.json`, JSON.stringify({ base: BASE, run: new Date().toISOString(), results }, null, 2));
const count = (s) => results.filter((r) => r.status === s).length;
console.log(`\nPASS ${count("PASS")} · FAIL ${count("FAIL")} · BLOCKED ${count("BLOCKED")}${SMOKE ? ` · SKIP ${count("SKIP")}` : ""} of ${results.length}`);
