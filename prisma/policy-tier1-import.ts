// One-time, guarded, idempotent import of the Tier 1 Meta/Google healthcare
// policies (docs/p0-policy-evidence/research/tier1-meta-google-pack.json) as
// UNVERIFIED sources and DRAFT / UNVERIFIED rules, for the two policy admins
// to verify and approve by hand in the Policy Library.
//
// Dry run by default: prints every record it would create and writes nothing.
//   npx tsx prisma/policy-tier1-import.ts --author <policy-admin-email>
// To write (only after the CEO's approval, from a GT shell whose DATABASE_URL
// targets the intended database):
//   IMPORT_CONFIRM_DATABASE=<database name> npx tsx prisma/policy-tier1-import.ts --author <email> --production-approved --apply
//
// Guarantees:
// - Runs only against "cyntique_demo" (Production) or a local p0_local* database
//   used to rehearse. Any other database is refused.
// - Writes need --apply AND --production-approved AND IMPORT_CONFIRM_DATABASE
//   equal to the database name. Any one missing: dry run or refusal.
// - Only creates: a source whose official URL is not stored yet, a rule whose
//   code is not stored yet. Stored sources, rules, versions, events, accounts
//   and every unrelated table are never read for writing and never changed, so
//   human edits survive and re-running creates nothing new (idempotent).
// - Everything created is UNVERIFIED (sources) or DRAFT / UNVERIFIED (rule
//   versions). The script cannot verify, submit, approve or activate anything.
// - One transaction: after writing, the created rows are counted and the
//   pre-existing sources are checked for change; any mismatch rolls everything
//   back. TIER1_IMPORT_TEST_ROLLBACK=1 forces that failure, to prove it.
// - Never prints connection strings or secrets.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { planResearchImport, type ImportPlan, type ResearchPack } from "../src/lib/policy/research-import";
import { databaseNameOf } from "./seed-plan";

const PRODUCTION_DATABASE = "cyntique_demo";
const PACK = resolve(__dirname, "../docs/p0-policy-evidence/research/tier1-meta-google-pack.json");

function arg(argv: string[], name: string) {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1]?.trim() : undefined;
}

function show(label: string, value: unknown) {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : Array.isArray(value) ? (value.length ? value.map((v) => `\n        - ${v}`).join("") : "(none)") : value === null || value === undefined || value === "" ? "(empty)" : String(value);
  console.log(`      ${label}: ${text}`);
}

function printPlan(plan: ImportPlan, dbName: string, apply: boolean) {
  const newSources = plan.sources.filter((s) => !s.existingId);
  const reused = plan.sources.filter((s) => s.existingId);
  console.log(`Database: ${dbName}${apply ? "" : " (dry run, nothing written)"}`);
  console.log(`Sources: ${newSources.length} to create as UNVERIFIED; ${reused.length} already stored and left unchanged${reused.length ? ` (${reused.map((s) => s.key).join(", ")})` : ""}.`);
  for (const s of newSources) {
    console.log(`  + PolicySource ${s.key}`);
    for (const [k, v] of Object.entries(s.data)) show(k, v);
    show("verificationStatus", "UNVERIFIED");
  }
  console.log(`Rules: ${plan.rules.length} to create as DRAFT / UNVERIFIED; ${plan.skippedRules.length} already stored and left unchanged${plan.skippedRules.length ? ` (${plan.skippedRules.join(", ")})` : ""}.`);
  for (const r of plan.rules) {
    console.log(`  + PolicyRule ${r.code}`);
    for (const [k, v] of Object.entries(r.scope)) show(k, v);
    console.log(`    + PolicyRuleVersion v1 (status DRAFT, verificationStatus UNVERIFIED)`);
    for (const [k, v] of Object.entries(r.content)) show(k, v);
    for (const c of r.citations) {
      console.log(`    + PolicyRuleVersionSource → ${c.sourceKey}`);
      const { sourceKey: _k, sourceId: _i, ...rest } = c;
      void _k; void _i;
      for (const [k, v] of Object.entries(rest)) show(k, v);
    }
    console.log(`    + PolicyRuleEvent RULE_CREATED (actor: the --author admin)`);
  }
  for (const w of plan.warnings) console.log(`  warning: ${w}`);
  for (const e of plan.errors) console.error(`  error: ${e}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const approved = argv.includes("--production-approved");
  const author = arg(argv, "--author")?.toLowerCase();
  if (!author) throw new Error("Usage: npx tsx prisma/policy-tier1-import.ts --author <policy-admin-email> [--production-approved --apply]");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const dbName = databaseNameOf(connectionString);
  const local = ["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname) && Boolean(dbName?.startsWith("p0_local"));
  if (dbName !== PRODUCTION_DATABASE && !local) throw new Error(`Refusing: this script only runs against "${PRODUCTION_DATABASE}" or a local p0_local* rehearsal database (DATABASE_URL points to "${dbName}").`);
  if (apply && !approved) throw new Error("Writing needs --production-approved (only after the CEO's approval). Nothing was changed.");
  if (apply && process.env.IMPORT_CONFIRM_DATABASE !== dbName) throw new Error(`To write, set IMPORT_CONFIRM_DATABASE=${dbName}. Nothing was changed.`);

  const pack = JSON.parse(readFileSync(PACK, "utf8")) as ResearchPack;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const user = await prisma.user.findUnique({ where: { email: author }, select: { id: true, role: true, isPolicyAdmin: true } });
    if (!user || user.role !== "TEAM" || !user.isPolicyAdmin) throw new Error(`'${author}' is not a TEAM policy admin in "${dbName}".`);

    const [markets, platforms, sources, rules] = await Promise.all([
      prisma.market.findMany({ select: { code: true } }),
      prisma.adPlatform.findMany({ select: { code: true } }),
      prisma.policySource.findMany({ select: { id: true, officialUrl: true, updatedAt: true } }),
      prisma.policyRule.findMany({ select: { code: true } }),
    ]);
    const plan = planResearchImport(pack, {
      jurisdictions: markets.map((m) => m.code),
      platforms: platforms.map((p) => p.code),
      existingSourceUrls: new Map(sources.map((s) => [s.officialUrl, s.id])),
      existingRuleCodes: new Set(rules.map((r) => r.code)),
    });
    printPlan(plan, dbName as string, apply);
    if (plan.errors.length) throw new Error("The pack has errors; nothing was written.");
    const newSources = plan.sources.filter((s) => !s.existingId);
    if (!apply) return;
    if (newSources.length === 0 && plan.rules.length === 0) {
      console.log("Nothing to create: every source and rule in the pack is already stored. No change.");
      return;
    }

    const before = { sources: await prisma.policySource.count(), rules: await prisma.policyRule.count(), versions: await prisma.policyRuleVersion.count(), citations: await prisma.policyRuleVersionSource.count(), events: await prisma.policyRuleEvent.count() };
    const touched = new Map(sources.map((s) => [s.id, s.updatedAt.getTime()]));

    await prisma.$transaction(async (tx) => {
      const ids = new Map(plan.sources.filter((s) => s.existingId).map((s) => [s.key, s.existingId as string]));
      for (const s of newSources) {
        const row = await tx.policySource.create({ data: { ...s.data, verificationStatus: "UNVERIFIED" } });
        await tx.policyRuleEvent.create({ data: { sourceId: row.id, kind: "SOURCE_CREATED", actorId: user.id, note: `${row.name} imported from the Tier 1 pack as UNVERIFIED; a policy admin must verify it against the official page.` } });
        ids.set(s.key, row.id);
      }
      for (const r of plan.rules) {
        const c = r.content;
        const rule = await tx.policyRule.create({ data: { code: r.code, title: c.title, ...r.scope, currentVersionNumber: 1 } });
        const version = await tx.policyRuleVersion.create({
          data: {
            ruleId: rule.id,
            versionNumber: 1,
            title: c.title,
            summary: c.summary,
            legalExplanation: c.legalExplanation,
            remediationAction: c.remediationAction,
            applicabilityConditions: c.applicabilityConditions,
            exceptions: c.exceptions,
            restrictionLevel: c.restrictionLevel,
            restrictedClaims: c.restrictedClaims,
            substantiationRequirements: c.substantiationRequirements,
            officialEffectiveDate: c.officialEffectiveDate,
            effectiveTo: c.effectiveTo,
            reviewNote: c.reviewNote,
            status: "DRAFT",
            verificationStatus: "UNVERIFIED",
            changeSummary: "Imported from the Tier 1 Meta/Google pack as a draft for human verification.",
            createdById: user.id,
          },
        });
        for (const { sourceKey, ...cite } of r.citations) {
          await tx.policyRuleVersionSource.create({ data: { versionId: version.id, ...cite, sourceId: ids.get(sourceKey)! } });
        }
        await tx.policyRuleEvent.create({ data: { ruleId: rule.id, versionId: version.id, kind: "RULE_CREATED", actorId: user.id, note: "v1 imported from the Tier 1 pack as DRAFT / UNVERIFIED; not active until verified and approved by two different admins." } });
      }

      // Verify inside the transaction; any mismatch rolls everything back.
      const expected = {
        sources: before.sources + newSources.length,
        rules: before.rules + plan.rules.length,
        versions: before.versions + plan.rules.length,
        citations: before.citations + plan.rules.reduce((n, r) => n + r.citations.length, 0),
        events: before.events + newSources.length + plan.rules.length,
      };
      const after = { sources: await tx.policySource.count(), rules: await tx.policyRule.count(), versions: await tx.policyRuleVersion.count(), citations: await tx.policyRuleVersionSource.count(), events: await tx.policyRuleEvent.count() };
      const bad = (Object.keys(expected) as Array<keyof typeof expected>).filter((k) => expected[k] !== after[k]);
      if (process.env.TIER1_IMPORT_TEST_ROLLBACK === "1") bad.push("sources");
      if (bad.length) throw new Error(`Post-write check failed for ${bad.join(", ")} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(after)}); rolled back.`);
      const stillActive = await tx.policyRuleVersion.count({ where: { OR: [{ status: "ACTIVE" }, { verificationStatus: "VERIFIED" }], rule: { code: { in: plan.rules.map((r) => r.code) } } } });
      if (stillActive) throw new Error("An imported version is not DRAFT / UNVERIFIED; rolled back.");
      const existingNow = await tx.policySource.findMany({ where: { id: { in: [...touched.keys()] } }, select: { id: true, updatedAt: true } });
      if (existingNow.some((s) => touched.get(s.id) !== s.updatedAt.getTime())) throw new Error("A pre-existing source changed during the import; rolled back.");
    });

    const now = await prisma.policyRuleVersion.findMany({ where: { rule: { code: { in: plan.rules.map((r) => r.code) } } }, select: { status: true, verificationStatus: true, rule: { select: { code: true } } } });
    console.log(`Written and verified: ${newSources.length} source(s), ${plan.rules.length} rule(s): ${now.map((v) => `${v.rule.code} ${v.status}/${v.verificationStatus}`).join(", ")}.`);
    console.log("Every imported item must be checked against its official page by a policy admin, then approved by a different admin, before the AI can use it.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`[IMPORT FAILED] ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
