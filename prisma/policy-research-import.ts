// Imports the policy research pack (docs/p0-policy-evidence/research/policy-research-pack.json)
// as DRAFT rules and UNVERIFIED sources, for policy admins to check against
// the official pages, submit, verify and approve in the Policy Library.
//
// Safety rules:
// - Dry run by default: prints the plan and writes nothing.
//     npx tsx prisma/policy-research-import.ts --author <policy-admin-email>
// - To write:
//     IMPORT_CONFIRM_DATABASE=<database_name> npx tsx prisma/policy-research-import.ts --author <email> --apply
// - Always refuses the Production database (cyntique_demo) and NODE_ENV=production.
// - Refuses the Preview database (clyntique_demo_preview) unless --preview-approved
//   is passed; only use it after explicit approval for a Preview import.
// - Only creates: sources whose official URL isn't stored yet and rules whose
//   code isn't stored yet. Existing sources, rules and versions are never changed.
// - Every created version is DRAFT / UNVERIFIED and every source UNVERIFIED,
//   so nothing reaches the AI until two different admins verify and approve it.

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { planResearchImport, type ResearchPack } from "../src/lib/policy/research-import";
import { databaseNameOf } from "./seed-plan";

const PRODUCTION_DATABASES = new Set(["cyntique_demo"]);
const PREVIEW_DATABASES = new Set(["clyntique_demo_preview"]);
const PACK = resolve(__dirname, "../docs/p0-policy-evidence/research/policy-research-pack.json");

function arg(argv: string[], name: string) {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const author = arg(argv, "--author")?.trim().toLowerCase();
  if (!author) throw new Error("Usage: npx tsx prisma/policy-research-import.ts --author <policy-admin-email> [--apply]");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const dbName = databaseNameOf(connectionString);
  if (!dbName) throw new Error("Could not read the database name from DATABASE_URL.");
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run with NODE_ENV=production.");
  if (PRODUCTION_DATABASES.has(dbName)) throw new Error(`Refusing to run against "${dbName}" (Production database).`);
  if (PREVIEW_DATABASES.has(dbName) && !argv.includes("--preview-approved")) {
    throw new Error(`Refusing to run against "${dbName}" (Preview database) without --preview-approved. A Preview import needs explicit approval.`);
  }
  if (apply && process.env.IMPORT_CONFIRM_DATABASE !== dbName) {
    throw new Error(`To write, set IMPORT_CONFIRM_DATABASE=${dbName} so the import can't reach the wrong database by accident.`);
  }

  const pack = JSON.parse(readFileSync(PACK, "utf8")) as ResearchPack;
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const user = await prisma.user.findUnique({ where: { email: author }, select: { id: true, role: true, isPolicyAdmin: true } });
    if (!user || user.role !== "TEAM" || !user.isPolicyAdmin) throw new Error(`'${author}' is not a TEAM policy admin in "${dbName}".`);

    const [markets, platforms, sources, rules] = await Promise.all([
      prisma.market.findMany({ select: { code: true } }),
      prisma.adPlatform.findMany({ select: { code: true } }),
      prisma.policySource.findMany({ select: { id: true, officialUrl: true } }),
      prisma.policyRule.findMany({ select: { code: true } }),
    ]);
    const plan = planResearchImport(pack, {
      jurisdictions: markets.map((m) => m.code),
      platforms: platforms.map((p) => p.code),
      existingSourceUrls: new Map(sources.map((s) => [s.officialUrl, s.id])),
      existingRuleCodes: new Set(rules.map((r) => r.code)),
    });

    const newSources = plan.sources.filter((s) => !s.existingId);
    console.log(`Database: ${dbName}${apply ? "" : " (dry run, nothing written)"}`);
    console.log(`Sources: ${newSources.length} to add as UNVERIFIED, ${plan.sources.length - newSources.length} already stored (left unchanged).`);
    console.log(`Rules: ${plan.rules.length} to add as DRAFT / UNVERIFIED, ${plan.skippedRules.length} already stored (left unchanged)${plan.skippedRules.length ? `: ${plan.skippedRules.join(", ")}` : ""}.`);
    for (const r of plan.rules) console.log(`  + ${r.code} · ${r.content.title}`);
    for (const w of plan.warnings) console.log(`  warning: ${w}`);
    if (plan.errors.length) {
      for (const e of plan.errors) console.error(`  error: ${e}`);
      throw new Error("The research pack has errors; nothing was written.");
    }
    if (!apply) return;

    await prisma.$transaction(async (tx) => {
      const ids = new Map(plan.sources.filter((s) => s.existingId).map((s) => [s.key, s.existingId as string]));
      for (const s of newSources) {
        const row = await tx.policySource.create({ data: { ...s.data, verificationStatus: "UNVERIFIED" } });
        await tx.policyRuleEvent.create({ data: { sourceId: row.id, kind: "SOURCE_CREATED", actorId: user.id, note: `${row.name} imported from the research pack as UNVERIFIED.` } });
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
            changeSummary: "Imported from the P0 research pack as a draft for human verification.",
            createdById: user.id,
          },
        });
        for (const { sourceKey, ...cite } of r.citations) {
          await tx.policyRuleVersionSource.create({ data: { versionId: version.id, ...cite, sourceId: ids.get(sourceKey)! } });
        }
        await tx.policyRuleEvent.create({ data: { ruleId: rule.id, versionId: version.id, kind: "RULE_CREATED", actorId: user.id, note: "v1 imported from the research pack as DRAFT; not active until verified and approved." } });
      }
    });
    console.log("Written. Every imported item needs checking against its official page before it is submitted.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
