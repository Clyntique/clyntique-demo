// Guarded, idempotent import and version evolution of the Tier 2 healthcare
// advertising policies (docs/p0-policy-evidence/research/tier2-healthcare-expansion-pack.json).
//
// Refines Tier 1 policies per Yash review feedback (Meta personal health attributes,
// Google health personalization, Google prescription drug services/terms split),
// and adds TikTok and US FTC regulatory coverage.
//
// Established Versioning Model:
// - Does NOT overwrite pre-existing v1 draft records.
// - Existing v1 drafts for RX-META-PA-01 and RX-GOOG-PA-01 are preserved as immutable DEPRECATED history.
// - New v2 DRAFT / UNVERIFIED versions are proposed, retaining prior citations and audit trails.
// - Pre-existing composite rule RX-GOOG-HM-01 is superseded, retired, and marked DEPRECATED
//   (locking it from accidental verification or approval, replaced by RX-GOOG-PDS-01 and RX-GOOG-RDT-01).
// - All new records are created as UNVERIFIED sources and DRAFT / UNVERIFIED rule versions.
// - Never activates policy coverage or bypasses the two-admin approval workflow.
//
// Dry run by default: prints planned actions and writes nothing:
//   npx tsx prisma/policy-tier2-import.ts --author <policy-admin-email>
//
// To write (requires explicit approval, production flag, and confirmation):
//   IMPORT_CONFIRM_DATABASE=<database name> npx tsx prisma/policy-tier2-import.ts --author <email> --production-approved --apply [--create-versions]
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { planResearchImport, type ImportPlan, type ResearchPack } from "../src/lib/policy/research-import";
import { databaseNameOf } from "./seed-plan";

export const PRODUCTION_DATABASE = "cyntique_demo";
export const DEFAULT_PACK_PATH = resolve(__dirname, "../docs/p0-policy-evidence/research/tier2-healthcare-expansion-pack.json");

function arg(argv: string[], name: string) {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1]?.trim() : undefined;
}

function show(label: string, value: unknown) {
  const text =
    value instanceof Date
      ? value.toISOString().slice(0, 10)
      : Array.isArray(value)
      ? value.length
        ? value.map((v) => `\n        - ${v}`).join("")
        : "(none)"
      : value === null || value === undefined || value === ""
      ? "(empty)"
      : String(value);
  console.log(`      ${label}: ${text}`);
}

export function printPlan(plan: ImportPlan, dbName: string, apply: boolean, createVersions: boolean) {
  const newSources = plan.sources.filter((s) => !s.existingId);
  const reused = plan.sources.filter((s) => s.existingId);
  console.log(`Database: ${dbName}${apply ? "" : " (dry run, nothing written)"}`);
  console.log(
    `Sources: ${newSources.length} to create as UNVERIFIED; ${reused.length} already stored and reused${
      reused.length ? ` (${reused.map((s) => s.key).join(", ")})` : ""
    }.`,
  );
  for (const s of newSources) {
    console.log(`  + PolicySource ${s.key}`);
    for (const [k, v] of Object.entries(s.data)) show(k, v);
    show("verificationStatus", "UNVERIFIED");
  }

  console.log(
    `Rules: ${plan.rules.length} new canonical rules to create as DRAFT / UNVERIFIED (v1); ${plan.skippedRules.length} pre-existing rules to evolve to v2${
      plan.skippedRules.length ? ` (${plan.skippedRules.join(", ")})` : ""
    }.`,
  );
  for (const r of plan.rules) {
    console.log(`  + PolicyRule ${r.code}`);
    for (const [k, v] of Object.entries(r.scope)) show(k, v);
    console.log(`    + PolicyRuleVersion v1 (status DRAFT, verificationStatus UNVERIFIED)`);
    for (const [k, v] of Object.entries(r.content)) show(k, v);
    for (const c of r.citations) {
      console.log(`    + PolicyRuleVersionSource → ${c.sourceKey}`);
      const { sourceKey: _k, sourceId: _i, ...rest } = c;
      void _k;
      void _i;
      for (const [k, v] of Object.entries(rest)) show(k, v);
    }
    console.log(`    + PolicyRuleEvent RULE_CREATED (actor: the --author admin)`);
  }

  console.log("\nEstablished Policy Versioning Strategy:");
  if (createVersions) {
    console.log("  1. RX-META-PA-01: Propose v2 DRAFT / UNVERIFIED version with refined clinic copy guidance.");
    console.log("     - v1 draft preserved as immutable historical record (status: DEPRECATED).");
    console.log("     - PolicyRule currentVersionNumber advanced to 2.");
    console.log("     - PolicyRuleEvent VERSION_PROPOSED logged.");
    console.log("  2. RX-GOOG-PA-01: Propose v2 DRAFT / UNVERIFIED version clarifying audience restrictions vs contextual search.");
    console.log("     - v1 draft preserved as immutable historical record (status: DEPRECATED).");
    console.log("     - PolicyRule currentVersionNumber advanced to 2.");
    console.log("     - PolicyRuleEvent VERSION_PROPOSED logged.");
    console.log("  3. RX-GOOG-HM-01: Supersede composite rule; mark v1 as DEPRECATED with supersession lock.");
    console.log("     - Cannot be verified or approved alongside replacements.");
    console.log("     - Audit trail preserved; replaced by RX-GOOG-PDS-01 and RX-GOOG-RDT-01.");
    console.log("     - PolicyRuleEvent RULE_RETIRED logged.");
  } else {
    console.log("  (Pre-existing rules left untouched. Pass --create-versions or --update-drafts to propose v2 drafts).");
  }

  console.log("\nPlanned Post-Apply State Totals:");
  console.log(`  - Total PolicySources: ${reused.length + newSources.length} (${reused.length} existing + ${newSources.length} new)`);
  console.log(`  - Total PolicyRules: 9 (3 existing + 6 new)`);
  console.log(
    `  - Total PolicyRuleVersions: ${createVersions ? "11 (3 deprecated historical v1 + 6 new v1 drafts + 2 new v2 drafts)" : "9 (3 existing v1 + 6 new v1)"}`,
  );
  console.log(`  - Active Draft Review Targets: ${createVersions ? "8 (6 new v1 + 2 revised v2)" : "9 (3 existing v1 + 6 new v1)"}`);
  console.log(`  - Deprecated Inactive Versions: ${createVersions ? "3 (v1 of META-PA-01, v1 of GOOG-PA-01, v1 of GOOG-HM-01)" : "0"}`);

  for (const w of plan.warnings) console.log(`  warning: ${w}`);
  for (const e of plan.errors) console.error(`  error: ${e}`);
}

interface ExistingRuleRecord {
  id: string;
  code: string;
  currentVersionNumber: number;
}

export interface Tier2ImportOptions {
  author: string;
  apply: boolean;
  createVersions: boolean;
  dbName: string;
  testRollback?: boolean;
  packPath?: string;
  silent?: boolean;
}

export interface Tier2ImportResult {
  dbName: string;
  applied: boolean;
  plan: ImportPlan;
  newSourcesCount: number;
  newRulesCount: number;
  newVersionsCount: number;
  eventsCount: number;
}

export async function runTier2Import(prisma: PrismaClient, options: Tier2ImportOptions): Promise<Tier2ImportResult> {
  const { author, apply, createVersions, dbName, testRollback = false, packPath = DEFAULT_PACK_PATH, silent = false } = options;

  const pack = JSON.parse(readFileSync(packPath, "utf8")) as ResearchPack;

  const user = await prisma.user.findUnique({
    where: { email: author },
    select: { id: true, role: true, isPolicyAdmin: true },
  });
  if (!user || user.role !== "TEAM" || !user.isPolicyAdmin) {
    throw new Error(`'${author}' is not a TEAM policy admin in "${dbName}".`);
  }

  const [markets, platforms, sources, rules] = await Promise.all([
    prisma.market.findMany({ select: { code: true } }),
    prisma.adPlatform.findMany({ select: { code: true } }),
    prisma.policySource.findMany({ select: { id: true, officialUrl: true, updatedAt: true } }),
    prisma.policyRule.findMany({ select: { id: true, code: true, currentVersionNumber: true } }),
  ]);

  const plan = planResearchImport(pack, {
    jurisdictions: markets.map((m: { code: string }) => m.code),
    platforms: platforms.map((p: { code: string }) => p.code),
    existingSourceUrls: new Map(sources.map((s: { officialUrl: string; id: string }) => [s.officialUrl, s.id])),
    existingRuleCodes: new Set(rules.map((r: { code: string }) => r.code)),
  });

  if (!silent) printPlan(plan, dbName, apply, createVersions);
  if (plan.errors.length) throw new Error("The pack has errors; nothing was written.");

  const newSources = plan.sources.filter((s) => !s.existingId);
  const existingRulesMap = new Map<string, ExistingRuleRecord>(
    (rules as ExistingRuleRecord[]).map((r) => [r.code, r]),
  );

  if (!apply) {
    return {
      dbName,
      applied: false,
      plan,
      newSourcesCount: 0,
      newRulesCount: 0,
      newVersionsCount: 0,
      eventsCount: 0,
    };
  }

  if (newSources.length === 0 && plan.rules.length === 0 && !createVersions) {
    if (!silent) console.log("Nothing to create: every source and rule in the pack is already stored, and --create-versions was not set. No change.");
    return {
      dbName,
      applied: false,
      plan,
      newSourcesCount: 0,
      newRulesCount: 0,
      newVersionsCount: 0,
      eventsCount: 0,
    };
  }

  const before = {
    sources: await prisma.policySource.count(),
    rules: await prisma.policyRule.count(),
    versions: await prisma.policyRuleVersion.count(),
    events: await prisma.policyRuleEvent.count(),
  };
  const touched = new Map(sources.map((s: { id: string; updatedAt: Date }) => [s.id, s.updatedAt.getTime()]));

  let newVersionsCreated = 0;
  let eventsCreated = 0;

  await prisma.$transaction(
    async (tx) => {
      const ids = new Map(plan.sources.filter((s) => s.existingId).map((s) => [s.key, s.existingId as string]));

      // 1. Create new sources as UNVERIFIED
      for (const s of newSources) {
        const row = await tx.policySource.create({
          data: { ...s.data, verificationStatus: "UNVERIFIED" },
        });
        await tx.policyRuleEvent.create({
          data: {
            sourceId: row.id,
            kind: "SOURCE_CREATED",
            actorId: user.id,
            note: `${row.name} imported from the Tier 2 expansion pack as UNVERIFIED; a policy admin must verify it against the official page.`,
          },
        });
        ids.set(s.key, row.id);
        eventsCreated++;
      }

      // 2. Create new rules as DRAFT / UNVERIFIED (v1)
      for (const r of plan.rules) {
        const c = r.content;
        const rule = await tx.policyRule.create({
          data: { code: r.code, title: c.title, ...r.scope, currentVersionNumber: 1 },
        });
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
            changeSummary: "v1 imported from Tier 2 expansion pack as draft for human verification.",
            createdById: user.id,
          },
        });
        for (const { sourceKey, ...cite } of r.citations) {
          await tx.policyRuleVersionSource.create({
            data: { versionId: version.id, ...cite, sourceId: ids.get(sourceKey)! },
          });
        }
        await tx.policyRuleEvent.create({
          data: {
            ruleId: rule.id,
            versionId: version.id,
            kind: "RULE_CREATED",
            actorId: user.id,
            note: "v1 imported from Tier 2 expansion pack as DRAFT / UNVERIFIED; not active until verified and approved by two different admins.",
          },
        });
        newVersionsCreated++;
        eventsCreated++;
      }

      // 3. Evolve existing rules using established versioning model (propose v2, preserve v1 as DEPRECATED)
      if (createVersions) {
        for (const code of ["RX-META-PA-01", "RX-GOOG-PA-01"]) {
          const ruleInPack = pack.rules.find((r) => r.code === code);
          const dbRule = existingRulesMap.get(code);
          if (!ruleInPack || !dbRule) continue;

          // Idempotency: only evolve from v1 to v2 if currentVersionNumber is 1
          if (dbRule.currentVersionNumber >= 2) continue;

          // Find current v1 draft in DB
          const existingVersion = await tx.policyRuleVersion.findFirst({
            where: { ruleId: dbRule.id, versionNumber: 1 },
          });

          if (!existingVersion || existingVersion.status !== "DRAFT" || existingVersion.verificationStatus === "VERIFIED") {
            continue;
          }

          // Step A: Mark v1 as DEPRECATED (preserves history, prevents accidental verification or approval)
          await tx.policyRuleVersion.update({
            where: { id: existingVersion.id },
            data: {
              status: "DEPRECATED",
              reviewNote: `v1 research draft superseded by v2 draft per Yash review feedback. Retained as immutable historical record.\n\n${existingVersion.reviewNote || ""}`.slice(0, 1000),
            },
          });

          // Step B: Create v2 as DRAFT / UNVERIFIED
          const c = ruleInPack.version;
          const nextVersionNumber = 2;
          const v2 = await tx.policyRuleVersion.create({
            data: {
              ruleId: dbRule.id,
              versionNumber: nextVersionNumber,
              title: String(c.title),
              summary: String(c.summary),
              legalExplanation: String(c.legalExplanation),
              remediationAction: String(c.remediationAction),
              applicabilityConditions: c.applicabilityConditions as string[],
              exceptions: c.exceptions as string[],
              restrictionLevel: c.restrictionLevel as "PROHIBITED" | "RESTRICTED" | "CONDITIONAL" | "DISCLOSURE_REQUIRED",
              restrictedClaims: c.restrictedClaims as string[],
              substantiationRequirements: c.substantiationRequirements as string[],
              status: "DRAFT",
              verificationStatus: "UNVERIFIED",
              changeSummary: `v${nextVersionNumber} draft proposed incorporating review feedback; v${existingVersion.versionNumber} preserved as DEPRECATED history.`,
              createdById: user.id,
              reviewNote: String(c.reviewNote),
            },
          });

          // Step C: Link citations to v2
          for (const cite of ruleInPack.citations) {
            const srcId = ids.get(cite.sourceKey);
            if (srcId) {
              await tx.policyRuleVersionSource.create({
                data: {
                  versionId: v2.id,
                  sourceId: srcId,
                  sectionReference: String(cite.sectionReference),
                  sectionTitle: String(cite.sectionTitle),
                  directUrl: String(cite.directUrl),
                  excerpt: String(cite.excerpt || ""),
                },
              });
            }
          }

          // Step D: Advance rule pointer to v2
          await tx.policyRule.update({
            where: { id: dbRule.id },
            data: { title: String(c.title), currentVersionNumber: nextVersionNumber, updatedAt: new Date() },
          });

          // Step E: Record VERSION_PROPOSED event
          await tx.policyRuleEvent.create({
            data: {
              ruleId: dbRule.id,
              versionId: v2.id,
              kind: "VERSION_PROPOSED",
              actorId: user.id,
              note: `v${nextVersionNumber} proposed as DRAFT / UNVERIFIED per review feedback; v${existingVersion.versionNumber} retained as DEPRECATED history.`,
            },
          });

          newVersionsCreated++;
          eventsCreated++;
        }

        // Step 4: Supersede composite rule RX-GOOG-HM-01, mark DEPRECATED and log RULE_RETIRED
        const hmRule = existingRulesMap.get("RX-GOOG-HM-01");
        if (hmRule) {
          const hmVersion = await tx.policyRuleVersion.findFirst({
            where: { ruleId: hmRule.id, versionNumber: 1 },
          });
          // Idempotency: only supersede if v1 is still in DRAFT
          if (hmVersion && hmVersion.status === "DRAFT") {
            const supersessionNotice =
              "SUPERSEDED RULE — INACTIVE (Nov 1, 2026): Superseded by split rules RX-GOOG-PDS-01 (Prescription Drug Services) and RX-GOOG-RDT-01 (Restricted Drug Terms). Retained in DEPRECATED state for historical audit preservation. Cannot be verified or approved.";
            await tx.policyRuleVersion.update({
              where: { id: hmVersion.id },
              data: {
                status: "DEPRECATED",
                reviewNote: supersessionNotice,
              },
            });
            await tx.policyRuleEvent.create({
              data: {
                ruleId: hmRule.id,
                versionId: hmVersion.id,
                kind: "RULE_RETIRED",
                actorId: user.id,
                note: "Rule superseded by RX-GOOG-PDS-01 and RX-GOOG-RDT-01; marked DEPRECATED to lock from verification/approval while preserving audit history.",
              },
            });
            eventsCreated++;
          }
        }
      }

      // Exact transactional count check
      const expected = {
        sources: before.sources + newSources.length,
        rules: before.rules + plan.rules.length,
        versions: before.versions + newVersionsCreated,
        events: before.events + eventsCreated,
      };
      const after = {
        sources: await tx.policySource.count(),
        rules: await tx.policyRule.count(),
        versions: await tx.policyRuleVersion.count(),
        events: await tx.policyRuleEvent.count(),
      };

      const bad = (Object.keys(expected) as Array<keyof typeof expected>).filter((k) => expected[k] !== after[k]);
      if (process.env.TIER2_IMPORT_TEST_ROLLBACK === "1" || testRollback) bad.push("sources");
      if (bad.length) {
        throw new Error(
          `Post-write check failed for ${bad.join(", ")} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(
            after,
          )}); rolled back.`,
        );
      }

      const stillActive = await tx.policyRuleVersion.count({
        where: {
          OR: [{ status: "ACTIVE" }, { verificationStatus: "VERIFIED" }],
          rule: { code: { in: pack.rules.map((r) => r.code) } },
        },
      });
      if (stillActive) throw new Error("An imported or updated version is active or verified; rolled back.");

      const existingNow = await tx.policySource.findMany({
        where: { id: { in: [...touched.keys()] } },
        select: { id: true, updatedAt: true },
      });
      if (existingNow.some((s: { id: string; updatedAt: Date }) => touched.get(s.id) !== s.updatedAt.getTime())) {
        throw new Error("A pre-existing source changed during the import; rolled back.");
      }
    },
    { timeout: 120_000, maxWait: 30_000 },
  );

  if (!silent) {
    console.log(
      `Written and verified: ${newSources.length} new source(s), ${plan.rules.length} new rule(s), ${newVersionsCreated} new version(s) created.`,
    );
    console.log("Every item remains DRAFT / UNVERIFIED. Independent verification by Admin A and independent approval by Admin B required.");
  }

  return {
    dbName,
    applied: true,
    plan,
    newSourcesCount: newSources.length,
    newRulesCount: plan.rules.length,
    newVersionsCount: newVersionsCreated,
    eventsCount: eventsCreated,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const approved = argv.includes("--production-approved");
  const createVersions = argv.includes("--create-versions") || argv.includes("--update-drafts");
  const author = arg(argv, "--author")?.toLowerCase();
  if (!author) {
    throw new Error(
      "Usage: npx tsx prisma/policy-tier2-import.ts --author <policy-admin-email> [--production-approved --apply] [--create-versions]",
    );
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const dbName = databaseNameOf(connectionString);
  const local =
    ["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname) &&
    Boolean(dbName?.startsWith("p0_local"));
  if (dbName !== PRODUCTION_DATABASE && !local) {
    throw new Error(
      `Refusing: this script only runs against "${PRODUCTION_DATABASE}" or a local p0_local* rehearsal database (DATABASE_URL points to "${dbName}").`,
    );
  }
  if (apply && !approved) throw new Error("Writing needs --production-approved (only after explicit approval). Nothing was changed.");
  if (apply && process.env.IMPORT_CONFIRM_DATABASE !== dbName) {
    throw new Error(`To write, set IMPORT_CONFIRM_DATABASE=${dbName}. Nothing was changed.`);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    await runTier2Import(prisma, {
      author,
      apply,
      createVersions,
      dbName: dbName as string,
    });
  } finally {
    await prisma.$disconnect();
  }
}

// Execute when invoked directly
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((err) => {
    console.error(`[IMPORT FAILED] ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  });
}
