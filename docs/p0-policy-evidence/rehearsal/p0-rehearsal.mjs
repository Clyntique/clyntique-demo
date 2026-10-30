// P0 local browser rehearsal (disposable database p0_rehearsal only).
// Passwords come from the environment and are never printed.
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = process.env.OUT_DIR;
const CREATIVE = process.env.CREATIVE_ID; // "[SAMPLE] New patient welcome — Story" (client 1, US, Meta + Google)
const OTHER_CREATIVE = process.env.OTHER_CREATIVE_ID; // a client-2 creative
const RULE = "RX-META-PA-01";
const SOURCE = "Meta Advertising Standards: Privacy violations and personal attributes";
mkdirSync(OUT, { recursive: true });

const results = [];
let n = 0;
async function step(name, fn) {
  n += 1;
  try {
    await fn();
    results.push({ n, name, ok: true });
    console.log(`PASS ${n}. ${name}`);
  } catch (err) {
    results.push({ n, name, ok: false, error: String(err?.message ?? err).split("\n")[0] });
    console.log(`FAIL ${n}. ${name}: ${String(err?.message ?? err).split("\n")[0]}`);
  }
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

const browser = await chromium.launch();
async function signIn(email, password, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/auth/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/login"), { timeout: 20000 });
  return { ctx, page };
}
async function openRule(page) {
  await page.goto(`${BASE}/admin/policy-library`);
  await page.getByText(RULE, { exact: true }).first().click();
  await page.getByRole("heading", { name: "History" }).waitFor();
}
async function waitStatus(page, text) {
  await page.getByRole("status").filter({ hasText: text }).first().waitFor({ timeout: 15000 });
}

// ---- Admin A: source check, submit, verify
const a = await signIn("team@clyntique.demo", process.env.SEED_TEAM_PASSWORD);
await step("Admin A opens the Policy Library: 12 research drafts, nothing approved, coverage warning shown", async () => {
  await a.page.goto(`${BASE}/admin/policy-library`);
  await a.page.getByText("Drafts and returned").first().waitFor();
  const body = await a.page.textContent("body");
  expect(body.includes("No rule is approved yet"), "missing no-approved-rule warning");
  expect(!body.includes("100% persisted"), "old copy still present");
  expect(!/Import .*Candidate/.test(body), "candidate import button still present");
  await shot(a.page, "01-library-drafts");
});
await step("Admin A verifies the cited official source in the Sources tab", async () => {
  await a.page.getByRole("button", { name: /^Sources/ }).click();
  const item = a.page.locator("li").filter({ hasText: SOURCE });
  await item.getByRole("button", { name: "Review source" }).click();
  await item.getByRole("button", { name: "I checked it: verified" }).click();
  await waitStatus(a.page, "Source marked verified");
  await a.page.getByRole("button", { name: /^Sources/ }).click();
  await a.page.locator("li").filter({ hasText: SOURCE }).getByText("Verified", { exact: true }).waitFor();
  await shot(a.page, "02-source-verified");
});
await step("Admin A edits the draft (adds the date read) and submits it for verification", async () => {
  await openRule(a.page);
  await a.page.getByRole("button", { name: "Edit draft" }).click();
  await a.page.getByLabel("Date you read it").first().fill(new Date().toISOString().slice(0, 10));
  await shot(a.page, "03-editor");
  await a.page.getByRole("button", { name: "Submit for verification" }).last().click();
  await waitStatus(a.page, "");
  await openRule(a.page);
  await a.page.getByText("Submitted · awaiting verification").first().waitFor();
});
await step("Admin A verifies the version; approval is not offered to the verifier", async () => {
  await a.page.getByRole("button", { name: "Mark verified" }).click();
  await waitStatus(a.page, "Verified");
  await openRule(a.page);
  expect((await a.page.getByRole("button", { name: "Approve and activate" }).count()) === 0, "verifier was offered approval");
  const body = await a.page.textContent("body");
  expect(/different Policy Administrator must approve/.test(body), "two-person reason not shown");
  await shot(a.page, "04-verified-awaiting-approval");
});
await step("Before approval, the reviewer can't cite the rule on a submission", async () => {
  await a.page.goto(`${BASE}/admin/creatives/${CREATIVE}`);
  await a.page.getByRole("button", { name: "Start review" }).click();
  await a.page.getByText("Reviewing round 1").first().waitFor({ timeout: 20000 });
  await a.page.reload();
  await a.page.getByRole("button", { name: "+ Add finding" }).click();
  const options = await a.page.locator('form:has(input[name="issue"]) select[name="ruleVersionId"] option').allTextContents();
  expect(options.length > 0 && !options.some((o) => o.includes(RULE)), "unapproved rule offered: " + options.join(","));
  await shot(a.page, "05a-no-citable-rule");
});

// ---- Admin B: approve, coverage
const b = await signIn("admin-b@local.test", process.env.ADMIN_B_PASSWORD);
await step("Admin B (different admin) approves and activates the rule", async () => {
  await openRule(b.page);
  await b.page.getByRole("button", { name: "Approve and activate" }).click();
  await waitStatus(b.page, "Approved");
  await openRule(b.page);
  await b.page.getByText("Approved and in use").first().waitFor();
  const body = await b.page.textContent("body");
  expect(body.includes("Local Admin B"), "approver name missing from trail");
  await shot(b.page, "05-approved-trail");
});
await step("Coverage check: US × Meta covered by the rule, US × Google and TikTok insufficient", async () => {
  await b.page.goto(`${BASE}/admin/policy-library`);
  await b.page.getByRole("button", { name: "Coverage check" }).click();
  await b.page.getByLabel("Healthcare", { exact: true }).check();
  await b.page.getByRole("button", { name: "Check coverage" }).click();
  const rows = b.page.locator("tbody tr");
  await rows.first().waitFor();
  const text = (await rows.allTextContents()).join("\n");
  expect(/United StatesMetaCovered[^\n]*RX-META-PA-01/.test(text), "US Meta not covered: " + text.slice(0, 200));
  expect(/United StatesGoogle AdsInsufficient coverage/.test(text), "US Google should be insufficient");
  await shot(b.page, "06-coverage");
});

// ---- Reviewer (admin B) on the client's submission
await step("Reviewer records a finding citing the approved rule, with claim, location and suggested wording", async () => {
  await b.page.goto(`${BASE}/admin/creatives/${CREATIVE}`);
  await b.page.getByRole("button", { name: "+ Add finding" }).click();
  const form = b.page.locator('form:has(input[name="issue"])');
  await form.locator('input[name="issue"]').fill("Copy implies the viewer has a health condition");
  await form.locator('input[name="claimText"]').fill("Struggling with your anxiety?");
  await form.locator('input[name="claimLocation"]').fill("Headline");
  const opt = await form.locator('select[name="ruleVersionId"] option').filter({ hasText: RULE }).getAttribute("value");
  await form.locator('select[name="ruleVersionId"]').selectOption(opt);
  await form.locator('textarea[name="explanation"]').fill("Meta does not allow ads that assert or imply the viewer's health condition.");
  await form.locator('label:has(input[name="severity"][value="HIGH"])').click();
  await form.locator('select[name="requiredAction"]').selectOption({ index: 1 });
  await form.locator('textarea[name="actionDetails"]').fill("Rewrite the headline in general terms.");
  await form.locator('textarea[name="suggestedRevision"]').fill("Support for anxiety, from licensed clinicians.");
  await form.locator('button[type="submit"]').click();
  await b.page.getByText("Copy implies the viewer has a health condition").first().waitFor({ timeout: 15000 });
});
const evidenceTab = (page) => page.getByRole("tab", { name: /Evidence/ }).click();
await step("Reviewer adds shared Clyntique evidence citing the rule (link, no file)", async () => {
  await evidenceTab(b.page);
  await b.page.getByRole("button", { name: "+ Add Clyntique evidence" }).click();
  const form = b.page.locator('form:has(select[name="visibility"])');
  await form.locator('input[name="title"]').fill("Meta personal attributes policy page");
  await form.locator('select[name="type"]').selectOption({ index: 1 });
  await form.locator('select[name="visibility"]').selectOption("SHARED");
  const opt = await form.locator('select[name="ruleVersionId"] option').filter({ hasText: RULE }).getAttribute("value");
  await form.locator('select[name="ruleVersionId"]').selectOption(opt);
  await form.locator('input[name="claimText"]').fill("Struggling with your anxiety?");
  await form.locator('textarea[name="description"]').fill("The policy section that the headline conflicts with.");
  await form.locator('input[name="url"]').fill("https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/");
  await form.locator('input[name="findings"]').first().check();
  await form.locator('button[type="submit"]').click();
  await b.page.getByText("Evidence added.").first().waitFor({ timeout: 15000 });
});
await step("Reviewer also adds team-only evidence", async () => {
  await evidenceTab(b.page);
  await b.page.getByRole("button", { name: "+ Add Clyntique evidence" }).click();
  const form = b.page.locator('form:has(select[name="visibility"])');
  await form.locator('input[name="title"]').fill("INTERNAL reviewer note evidence");
  await form.locator('select[name="type"]').selectOption({ index: 1 });
  await form.locator('select[name="visibility"]').selectOption("INTERNAL");
  await form.locator('textarea[name="description"]').fill("Team-only context.");
  await form.locator('button[type="submit"]').click();
  await b.page.getByText("Evidence added.").first().waitFor({ timeout: 15000 });
});
await step("Client can't see the Team's draft finding or evidence before the decision", async () => {
  const c = await signIn("client@clyntique.demo", process.env.SEED_CLIENT_PASSWORD);
  await c.page.goto(`${BASE}/dashboard/creatives/${CREATIVE}`);
  const body = await c.page.textContent("body");
  expect(!body.includes("Copy implies the viewer"), "draft finding visible to client");
  expect(!body.includes("Meta personal attributes policy page"), "Clyntique evidence visible before decision");
  await c.ctx.close();
});
await step("Reviewer requests changes (publishes the decision)", async () => {
  await b.page.reload();
  await b.page.getByText("Request changes", { exact: true }).first().click();
  await b.page.locator('form:has-text("Summary for the client") textarea[name="summary"]').fill("One headline change needed before this can be completed.");
  await b.page.locator('form:has-text("Summary for the client") button[type="submit"]').click();
  await b.page.getByText(/Changes requested/i).first().waitFor({ timeout: 15000 });
  await shot(b.page, "07-team-after-decision");
});

// ---- Client
const c = await signIn("client@clyntique.demo", process.env.SEED_CLIENT_PASSWORD);
await step("Client sees the finding with claim, policy reference and suggested wording; reviewer masked", async () => {
  await c.page.goto(`${BASE}/dashboard/creatives/${CREATIVE}`);
  await c.page.getByText("Copy implies the viewer has a health condition").first().waitFor();
  const body = await c.page.textContent("body");
  expect(body.includes("Struggling with your anxiety?"), "claim missing");
  expect(body.includes("Support for anxiety, from licensed clinicians."), "suggested wording missing");
  expect(body.includes(RULE) || body.includes("Do not assert or imply a person's health condition"), "policy reference missing");
  expect(body.includes("Clyntique reviewer"), "masked reviewer label missing");
  expect(!body.includes("Local Admin B") && !body.includes("admin-b@local.test"), "reviewer identity leaked");
  expect(!body.includes("INTERNAL reviewer note evidence"), "team-only evidence leaked");
  expect(!body.includes("Local Admin A"), "author/verifier identity leaked");
  expect(!body.includes("Research draft (Oct 27"), "internal review note leaked");
  await shot(c.page, "08-client-finding-policy");
});
await step("Client sees the shared Clyntique evidence with the decision", async () => {
  await evidenceTab(c.page);
  const body = await c.page.textContent("body");
  expect(body.includes("Meta personal attributes policy page"), "shared Clyntique evidence missing");
  expect(body.includes("Clyntique evidence"), "Clyntique evidence badge missing");
  expect(!body.includes("INTERNAL reviewer note evidence"), "team-only evidence leaked");
  expect(!body.includes("Local Admin B"), "reviewer identity leaked on evidence");
  await shot(c.page, "08b-client-clyntique-evidence");
});
await step("Client adds evidence tied to a claim", async () => {
  await evidenceTab(c.page);
  await c.page.getByRole("button", { name: "+ Add evidence" }).first().click();
  const form = c.page.locator('form:has(input[name="claimText"])');
  await form.locator('input[name="title"]').fill("Clinician licence list");
  await form.locator('select[name="type"]').selectOption({ index: 1 });
  await form.locator('input[name="claimText"]').fill("from licensed clinicians");
  await form.locator('input[name="claimLocation"]').fill("Headline");
  await form.locator('input[name="url"]').fill("https://example.com/licences");
  await form.locator('button[type="submit"]').click();
  await c.page.getByText("Evidence added.").first().waitFor({ timeout: 15000 });
  await shot(c.page, "09-client-evidence");
});
await step("Client at phone width (390 px) has no horizontal scroll on the submission", async () => {
  const p = await signIn("client@clyntique.demo", process.env.SEED_CLIENT_PASSWORD, { width: 390, height: 844 });
  await p.page.goto(`${BASE}/dashboard/creatives/${CREATIVE}`);
  const w = await p.page.evaluate(() => document.documentElement.scrollWidth);
  await shot(p.page, "10-client-phone");
  await p.ctx.close();
  expect(w <= 392, `page is ${w}px wide`);
});
await step("Client can't open another client's submission or the Policy Library", async () => {
  const r = await c.page.goto(`${BASE}/dashboard/creatives/${OTHER_CREATIVE}`);
  const body = await c.page.textContent("body");
  expect(r.status() === 404 || /doesn't exist, or you don't have access/i.test(body), "other client's creative reachable");
  expect(!body.includes("Checkup booking reminder"), "other client's creative content shown");
  await c.page.goto(`${BASE}/admin/policy-library`);
  const lib = await c.page.textContent("body");
  expect(!lib.includes("RX-META-PA-01") && !lib.includes("Awaiting verification"), "client reached the Policy Library");
});
await step("Policy Library at phone width (390 px) has no horizontal page scroll", async () => {
  const p = await signIn("admin-b@local.test", process.env.ADMIN_B_PASSWORD, { width: 390, height: 844 });
  await p.page.goto(`${BASE}/admin/policy-library`);
  await p.page.getByText("Approved and active").first().waitFor();
  const w = await p.page.evaluate(() => document.documentElement.scrollWidth);
  await shot(p.page, "11-library-phone");
  await p.ctx.close();
  expect(w <= 392, `page is ${w}px wide`);
});

await browser.close();
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exitCode = failed ? 1 : 0;
