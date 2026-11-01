// Guarded, idempotent import and draft update of the Tier 2 healthcare
// advertising policies (docs/p0-policy-evidence/research/tier2-healthcare-expansion-pack.json).
//
// Refines Tier 1 policies per Yash review feedback (Meta personal health attributes,
// Google health personalization, Google prescription drug services/terms split),
// and adds TikTok and US FTC regulatory coverage.
//
// All imported and updated records remain UNVERIFIED sources and DRAFT / UNVERIFIED
// rule versions. Never activates policy coverage or bypasses the two-admin approval workflow.
//
// Dry run by default: prints planned actions and writes nothing:
//   npx tsx prisma/policy-tier2-import.ts --author <policy-admin-email>
//
// To write (requires explicit approval, production flag, and confirmation):
//   IMPORT_CONFIRM_DATABASE=<database name> npx tsx prisma/policy-tier2-import.ts --author <email> --production-approved --apply [--update-drafts]
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { planResearchImport, type ImportPlan, type ResearchPack } from "../src/lib/policy/research-import";
import { databaseNameOf } from "./seed-plan";

const PRODUCTION_DATABASE = "cyntique_demo";
const PACK = resolve(__dirname, "../docs/p0-policy-evidence/research/tier2-healthcare-expansion-pack.json");

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

function printPlan(plan: ImportPlan, dbName: string, apply: boolean, updateDrafts: boolean) {
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
    `Rules: ${plan.rules.length} to create as DRAFT / UNVERIFIED; ${plan.skippedRules.length} already stored${
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

  if (plan.skippedRules.length) {
    console.log(
      `\nExisting Rules Strategy: ${
        updateDrafts
          ? "Update existing DRAFT versions in place per Yash review feedback, logging VERSION_EDITED events."
          : "Leave existing rules unchanged (pass --update-drafts to update existing unverified drafts in place)."
      }`,
    );
  }

  for (const w of plan.warnings) console.log(`  warning: ${w}`);
  for (const e of plan.errors) console.error(`  error: ${e}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const approved = argv.includes("--production-approved");
  const updateDrafts = argv.includes("--update-drafts");
  const author = arg(argv, "--author")?.toLowerCase();
  if (!author) {
    throw new Error(
      "Usage: npx tsx prisma/policy-tier2-import.ts --author <policy-admin-email> [--production-approved --apply] [--update-drafts]",
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

  const pack = JSON.parse(readFileSync(PACK, "utf8")) as ResearchPack;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
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
      jurisdictions: markets.map((m) => m.code),
      platforms: platforms.map((p) => p.code),
      existingSourceUrls: new Map(sources.map((s) => [s.officialUrl, s.id])),
      existingRuleCodes: new Set(rules.map((r) => r.code)),
    });

    printPlan(plan, dbName as string, apply, updateDrafts);
    if (plan.errors.length) throw new Error("The pack has errors; nothing was written.");

    const newSources = plan.sources.filter((s) => !s.existingId);
    const existingRulesMap = new Map(rules.map((r) => [r.code, r]));

    if (!apply) return;

    if (newSources.length === 0 && plan.rules.length === 0 && !updateDrafts) {
      console.log("Nothing to create: every source and rule in the pack is already stored, and --update-drafts was not set. No change.");
      return;
    }

    const before = {
      sources: await prisma.policySource.count(),
      rules: await prisma.policyRule.count(),
      versions: await prisma.policyRuleVersion.count(),
      citations: await prisma.policyRuleVersionSource.count(),
      events: await prisma.policyRuleEvent.count(),
    };
    const touched = new Map(sources.map((s) => [s.id, s.updatedAt.getTime()]));

    let updatedDraftCount = 0;

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
        }

        // 2. Create new rules as DRAFT / UNVERIFIED
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
              changeSummary: "Imported from Tier 2 healthcare expansion pack as draft for human verification.",
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
        }

        // 3. Update existing draft rules in place if --update-drafts is set
        if (updateDrafts) {
          for (const code of plan.skippedRules) {
            const ruleInPack = pack.rules.find((r) => r.code === code);
            const dbRule = existingRulesMap.get(code);
            if (!ruleInPack || !dbRule) continue;

            // Find current draft version in DB
            const existingVersion = await tx.policyRuleVersion.findFirst({
              where: { ruleId: dbRule.id, versionNumber: dbRule.currentVersionNumber },
            });

            if (!existingVersion || existingVersion.status !== "DRAFT" || existingVersion.verificationStatus === "VERIFIED") {
              // Only unverified drafts can be updated
              continue;
            }

            const c = ruleInPack.version;
            await tx.policyRuleVersion.update({
              where: { id: existingVersion.id },
              data: {
                title: String(c.title),
                summary: String(c.summary),
                legalExplanation: String(c.legalExplanation),
                remediationAction: String(c.remediationAction),
                applicabilityConditions: c.applicabilityConditions as string[],
                exceptions: c.exceptions as string[],
                restrictionLevel: c.restrictionLevel as "PROHIBITED" | "RESTRICTED" | "CONDITIONAL" | "DISCLOSURE_REQUIRED",
                restrictedClaims: c.restrictedClaims as string[],
                substantiationRequirements: c.substantiationRequirements as string[],
                reviewNote: String(c.reviewNote),
              },
            });

            // Replace citations with refined citations
            await tx.policyRuleVersionSource.deleteMany({ where: { versionId: existingVersion.id } });
            for (const cite of ruleInPack.citations) {
              const srcId = ids.get(cite.sourceKey);
              if (srcId) {
                await tx.policyRuleVersionSource.create({
                  data: {
                    versionId: existingVersion.id,
                    sourceId: srcId,
                    sectionReference: String(cite.sectionReference),
                    sectionTitle: String(cite.sectionTitle),
                    directUrl: String(cite.directUrl),
                    excerpt: String(cite.excerpt || ""),
                  },
                });
              }
            }

            await tx.policyRule.update({
              where: { id: dbRule.id },
              data: { title: String(c.title), updatedAt: new Date() },
            });

            await tx.policyRuleEvent.create({
              data: {
                ruleId: dbRule.id,
                versionId: existingVersion.id,
                kind: "VERSION_EDITED",
                actorId: user.id,
                note: `v${existingVersion.versionNumber} draft refined per Yash review feedback (clearer clinic guidance, clarified audience restrictions).`,
              },
            });

            updatedDraftCount++;
          }

          // If RX-GOOG-HM-01 exists, annotate it as superseded by split
          const hmRule = existingRulesMap.get("RX-GOOG-HM-01");
          if (hmRule) {
            const hmVersion = await tx.policyRuleVersion.findFirst({
              where: { ruleId: hmRule.id, versionNumber: hmRule.currentVersionNumber },
            });
            if (hmVersion && hmVersion.status === "DRAFT") {
              const supersessionNote =
                "SUPERSEDED BY SPLIT: Pending review to supersede with RX-GOOG-PDS-01 (Prescription Drug Services) and RX-GOOG-RDT-01 (Restricted Drug Terms). Retained in draft state for historical audit preservation.";
              await tx.policyRuleVersion.update({
                where: { id: hmVersion.id },
                data: {
                  reviewNote: `${supersessionNote}\n\n${hmVersion.reviewNote || ""}`.slice(0, 1000),
                },
              });
              await tx.policyRuleEvent.create({
                data: {
                  ruleId: hmRule.id,
                  versionId: hmVersion.id,
                  kind: "VERSION_EDITED",
                  actorId: user.id,
                  note: "Annotated draft with pending supersession notice (split into RX-GOOG-PDS-01 and RX-GOOG-RDT-01).",
                },
              });
              updatedDraftCount++;
            }
          }
        }

        // Verify inside the transaction; any mismatch rolls everything back
        const expected = {
          sources: before.sources + newSources.length,
          rules: before.rules + plan.rules.length,
          versions: before.versions + plan.rules.length,
          events: before.events + newSources.length + plan.rules.length + updatedDraftCount,
        };
        const after = {
          sources: await tx.policySource.count(),
          rules: await tx.policyRule.count(),
          versions: await tx.policyRuleVersion.count(),
          events: await tx.policyRuleEvent.count(),
        };

        const bad = (Object.keys(expected) as Array<keyof typeof expected>).filter((k) => expected[k] !== after[k]);
        if (process.env.TIER2_IMPORT_TEST_ROLLBACK === "1") bad.push("sources");
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
        if (stillActive) throw new Error("An imported or updated version is not DRAFT / UNVERIFIED; rolled back.");

        const existingNow = await tx.policySource.findMany({
          where: { id: { in: [...touched.keys()] } },
          select: { id: true, updatedAt: true },
        });
        if (existingNow.some((s) => touched.get(s.id) !== s.updatedAt.getTime())) {
          throw new Error("A pre-existing source changed during the import; rolled back.");
        }
      },
      { timeout: 120_000, maxWait: 30_000 },
    );

    console.log(
      `Written and verified: ${newSources.length} new source(s), ${plan.rules.length} new rule(s), ${updatedDraftCount} draft(s) updated in place.`,
    );
    console.log("Every item remains DRAFT / UNVERIFIED. Independent verification by Admin A and independent approval by Admin B required.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`[IMPORT FAILED] ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
