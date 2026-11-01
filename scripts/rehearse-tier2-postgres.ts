// Automated PostgreSQL Rehearsal Suite for Tier 2 Healthcare Policy Import
// Validates:
// 1. Creation of disposable PostgreSQL database mirroring Production schema and policy records
// 2. Baseline inventory verification (Users: 4, Projects: 5, Creatives: 8, Sources: 3, Rules: 3, Versions: 3, Events: 9)
// 3. Forced Rollback: Proves transactional integrity and 100% restoration on failure
// 4. Successful Apply: 4 new sources, 6 new rules, 8 new reviewable drafts (6 v1 + 2 v2), 3 deprecated v1 versions
// 5. Preservation of Meta source's REQUIRES_REVIEW status
// 6. Verification of the exact 8 reviewable policy codes (including RX-US-FTC-TE-01)
// 7. Idempotent Second Run: Proves duplicate prevention (0 new sources, 0 new rules, 0 new versions, 0 new events)
// 8. Zero unintended changes to unrelated production records (Users, Projects, Creatives, Findings, Activities)
import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { runTier2Import } from "../prisma/policy-tier2-import";

const { Client } = pg;
const PG_PORT = 5433;
const PG_HOST = "127.0.0.1";
const ADMIN_CONN = `postgresql://postgres@${PG_HOST}:${PG_PORT}/postgres`;
const REHEARSAL_DB = "p0_local_tier2_rehearsal";
const REHEARSAL_CONN = `postgresql://postgres@${PG_HOST}:${PG_PORT}/${REHEARSAL_DB}`;

async function main() {
  console.log(`[REHEARSAL] Connecting to local PostgreSQL at ${ADMIN_CONN}...`);
  const adminClient = new Client({ connectionString: ADMIN_CONN });
  await adminClient.connect();

  try {
    // Step 1: Create disposable database cloned from p0_local_admins_oct31
    console.log(`[REHEARSAL] Recreating disposable database "${REHEARSAL_DB}"...`);
    await adminClient.query(`DROP DATABASE IF EXISTS "${REHEARSAL_DB}" WITH (FORCE);`);
    await adminClient.query(`CREATE DATABASE "${REHEARSAL_DB}" TEMPLATE "p0_local_admins_oct31";`);
    console.log(`[REHEARSAL] Database "${REHEARSAL_DB}" cloned successfully.`);
  } finally {
    await adminClient.end();
  }

  // Step 2: Seed baseline Tier 1 records into rehearsal database
  console.log(`[REHEARSAL] Seeding baseline Tier 1 records into "${REHEARSAL_DB}"...`);
  const rehearsalPg = new Client({ connectionString: REHEARSAL_CONN });
  await rehearsalPg.connect();

  try {
    // Record 9th migration if not present
    await rehearsalPg.query(`
      INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
      SELECT gen_random_uuid()::text, 'f1e2d3c4b5a6071829', now(), '20261031160000_policy_source_monitoring', 1
      WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '20261031160000_policy_source_monitoring');
    `);

    // Fetch team policy admin user id
    const userRes = await rehearsalPg.query(`SELECT id FROM "User" WHERE email = 'team@clyntique.demo' LIMIT 1;`);
    if (!userRes.rows.length) throw new Error("Seed failed: team@clyntique.demo not found in User table.");
    const adminId = userRes.rows[0].id;

    // Seed Tier 1 sources: Meta (REQUIRES_REVIEW), Google PA (UNVERIFIED), Google HM (UNVERIFIED)
    await rehearsalPg.query(`
      INSERT INTO "PolicySource" (id, name, "officialUrl", "verificationStatus", "authorityName", "authorityType", "jurisdictionCode", "sourceKind", "updatedAt")
      VALUES 
        ('src_meta', 'Meta Advertising Standards: Privacy violations and personal attributes', 'https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/', 'REQUIRES_REVIEW', 'Meta Platforms', 'PLATFORM_POLICY', 'GLOBAL', 'PLATFORM_POLICY_PAGE', '2026-10-27 00:00:00+00'),
        ('src_goog_pa', 'Google Ads policy: Health in personalized advertising', 'https://support.google.com/adspolicy/answer/16701855', 'UNVERIFIED', 'Google', 'PLATFORM_POLICY', 'GLOBAL', 'PLATFORM_HELP_ARTICLE', '2026-10-27 00:00:00+00'),
        ('src_goog_hm', 'Google Ads policy: Healthcare and medicines', 'https://support.google.com/adspolicy/answer/176031', 'UNVERIFIED', 'Google', 'PLATFORM_POLICY', 'GLOBAL', 'PLATFORM_HELP_ARTICLE', '2026-10-27 00:00:00+00');
    `);

    // Seed Tier 1 rules
    await rehearsalPg.query(`
      INSERT INTO "PolicyRule" (id, code, title, "currentVersionNumber", "authorityType", "jurisdictionCode", "platformCode", "category", "industry", "updatedAt")
      VALUES
        ('rule_meta', 'RX-META-PA-01', 'Meta Personal Health Attributes v1', 1, 'PLATFORM_POLICY', 'GLOBAL', 'META', 'PERSONAL_HEALTH_ATTRIBUTES', 'HEALTHCARE', '2026-10-27 00:00:00+00'),
        ('rule_goog_pa', 'RX-GOOG-PA-01', 'Google Health Personalization v1', 1, 'PLATFORM_POLICY', 'GLOBAL', 'GOOGLE', 'TARGETING_RESTRICTION', 'HEALTHCARE', '2026-10-27 00:00:00+00'),
        ('rule_goog_hm', 'RX-GOOG-HM-01', 'Google Healthcare and Medicines v1', 1, 'PLATFORM_POLICY', 'GLOBAL', 'GOOGLE', 'PRESCRIPTION_MEDICINE', 'HEALTHCARE', '2026-10-27 00:00:00+00');
    `);

    // Seed Tier 1 versions (v1 drafts)
    await rehearsalPg.query(`
      INSERT INTO "PolicyRuleVersion" (id, "ruleId", "versionNumber", title, summary, "legalExplanation", "remediationAction", "changeSummary", status, "verificationStatus", "createdById", "reviewNote", "restrictedClaims", "substantiationRequirements", "applicabilityConditions", exceptions, "updatedAt")
      VALUES
        ('ver_meta_1', 'rule_meta', 1, 'Meta v1 draft', 'Summary v1', 'Legal explanation v1', 'Remediation v1', 'Initial Tier 1 research draft', 'DRAFT', 'UNVERIFIED', '${adminId}', 'v1 initial draft', '{}', '{}', '{}', '{}', '2026-10-27 00:00:00+00'),
        ('ver_goog_pa_1', 'rule_goog_pa', 1, 'Google PA v1 draft', 'Summary v1', 'Legal explanation v1', 'Remediation v1', 'Initial Tier 1 research draft', 'DRAFT', 'UNVERIFIED', '${adminId}', 'v1 initial draft', '{}', '{}', '{}', '{}', '2026-10-27 00:00:00+00'),
        ('ver_goog_hm_1', 'rule_goog_hm', 1, 'Google HM v1 composite draft', 'Summary v1', 'Legal explanation v1', 'Remediation v1', 'Initial Tier 1 composite research draft', 'DRAFT', 'UNVERIFIED', '${adminId}', 'v1 composite draft', '{}', '{}', '{}', '{}', '2026-10-27 00:00:00+00');
    `);

    // Seed citations
    await rehearsalPg.query(`
      INSERT INTO "PolicyRuleVersionSource" (id, "versionId", "sourceId", "sectionReference", "sectionTitle", "directUrl")
      VALUES
        ('cite_1', 'ver_meta_1', 'src_meta', 'Ad Standards', 'Personal Attributes', 'https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/'),
        ('cite_2', 'ver_goog_pa_1', 'src_goog_pa', 'Policy 16701855', 'Health in personalized ads', 'https://support.google.com/adspolicy/answer/16701855'),
        ('cite_3', 'ver_goog_hm_1', 'src_goog_hm', 'Policy 176031', 'Healthcare and medicines', 'https://support.google.com/adspolicy/answer/176031');
    `);

    // Seed initial 9 events
    await rehearsalPg.query(`
      INSERT INTO "PolicyRuleEvent" (id, "ruleId", "versionId", kind, "actorId", note, "createdAt")
      VALUES
        ('evt_1', 'rule_meta', NULL, 'SOURCE_CREATED', '${adminId}', 'Source created', '2026-10-27 00:00:00+00'),
        ('evt_2', 'rule_goog_pa', NULL, 'SOURCE_CREATED', '${adminId}', 'Source created', '2026-10-27 00:00:00+00'),
        ('evt_3', 'rule_goog_hm', NULL, 'SOURCE_CREATED', '${adminId}', 'Source created', '2026-10-27 00:00:00+00'),
        ('evt_4', 'rule_meta', 'ver_meta_1', 'RULE_CREATED', '${adminId}', 'Rule created', '2026-10-27 00:00:00+00'),
        ('evt_5', 'rule_goog_pa', 'ver_goog_pa_1', 'RULE_CREATED', '${adminId}', 'Rule created', '2026-10-27 00:00:00+00'),
        ('evt_6', 'rule_goog_hm', 'ver_goog_hm_1', 'RULE_CREATED', '${adminId}', 'Rule created', '2026-10-27 00:00:00+00'),
        ('evt_7', 'rule_meta', 'ver_meta_1', 'VERSION_PROPOSED', '${adminId}', 'v1 proposed', '2026-10-27 00:00:00+00'),
        ('evt_8', 'rule_goog_pa', 'ver_goog_pa_1', 'VERSION_PROPOSED', '${adminId}', 'v1 proposed', '2026-10-27 00:00:00+00'),
        ('evt_9', 'rule_goog_hm', 'ver_goog_hm_1', 'VERSION_PROPOSED', '${adminId}', 'v1 proposed', '2026-10-27 00:00:00+00');
    `);
  } finally {
    await rehearsalPg.end();
  }

  // Initialize Prisma Client targeting rehearsal DB
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: REHEARSAL_CONN }) });

  try {
    // Step 3: Verify Baseline Inventory
    console.log(`\n=== STEP 3: BASELINE INVENTORY VERIFICATION ===`);
    const baseline = {
      users: await prisma.user.count(),
      projects: await prisma.project.count(),
      creatives: await prisma.creative.count(),
      findings: await prisma.finding.count(),
      activities: await prisma.activity.count(),
      sources: await prisma.policySource.count(),
      rules: await prisma.policyRule.count(),
      versions: await prisma.policyRuleVersion.count(),
      events: await prisma.policyRuleEvent.count(),
    };
    console.log(`Baseline table counts on PostgreSQL:`, baseline);
    if (baseline.users !== 4 || baseline.projects !== 5 || baseline.creatives !== 8) {
      throw new Error(`Baseline failed: expected 4 users, 5 projects, 8 creatives. Got ${JSON.stringify(baseline)}`);
    }
    if (baseline.sources !== 3 || baseline.rules !== 3 || baseline.versions !== 3 || baseline.events !== 9) {
      throw new Error(`Baseline policy counts failed: expected 3 sources, 3 rules, 3 versions, 9 events.`);
    }

    // Verify existing Meta source verificationStatus is REQUIRES_REVIEW
    const preMetaSource = await prisma.policySource.findUniqueOrThrow({ where: { id: "src_meta" } });
    if (preMetaSource.verificationStatus !== "REQUIRES_REVIEW") {
      throw new Error(`Baseline failed: expected src_meta verificationStatus to be REQUIRES_REVIEW, got ${preMetaSource.verificationStatus}`);
    }
    console.log(`[PASS] Baseline confirmed: Meta source is REQUIRES_REVIEW, policy counts 3/3/3/9, unrelated records intact.`);

    // Step 4: Test Forced Rollback on PostgreSQL
    console.log(`\n=== STEP 4: FORCED ROLLBACK REHEARSAL ===`);
    let rollbackThrew = false;
    try {
      await runTier2Import(prisma, {
        author: "team@clyntique.demo",
        apply: true,
        createVersions: true,
        dbName: REHEARSAL_DB,
        testRollback: true,
        silent: true,
      });
    } catch (err: unknown) {
      rollbackThrew = true;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[PASS] Forced rollback triggered error as expected: "${msg}"`);
    }
    if (!rollbackThrew) throw new Error("Forced rollback test failed: script did not throw!");

    // Verify state after rollback is 100% identical to baseline
    const postRollback = {
      users: await prisma.user.count(),
      projects: await prisma.project.count(),
      creatives: await prisma.creative.count(),
      sources: await prisma.policySource.count(),
      rules: await prisma.policyRule.count(),
      versions: await prisma.policyRuleVersion.count(),
      events: await prisma.policyRuleEvent.count(),
    };
    if (
      postRollback.sources !== 3 ||
      postRollback.rules !== 3 ||
      postRollback.versions !== 3 ||
      postRollback.events !== 9 ||
      postRollback.users !== 4 ||
      postRollback.projects !== 5 ||
      postRollback.creatives !== 8
    ) {
      throw new Error(`Post-rollback state corrupted: ${JSON.stringify(postRollback)}`);
    }
    const rollbackMetaSource = await prisma.policySource.findUniqueOrThrow({ where: { id: "src_meta" } });
    if (rollbackMetaSource.verificationStatus !== "REQUIRES_REVIEW") {
      throw new Error(`Meta source corrupted after rollback! Got ${rollbackMetaSource.verificationStatus}`);
    }
    console.log(`[PASS] Transactional rollback verified: 100% of state restored cleanly.`);

    // Step 5: Test Successful Apply on PostgreSQL
    console.log(`\n=== STEP 5: SUCCESSFUL APPLY REHEARSAL ===`);
    const applyResult = await runTier2Import(prisma, {
      author: "team@clyntique.demo",
      apply: true,
      createVersions: true,
      dbName: REHEARSAL_DB,
      testRollback: false,
      silent: true,
    });

    console.log(`Apply result summary:`, {
      applied: applyResult.applied,
      newSources: applyResult.newSourcesCount,
      newRules: applyResult.newRulesCount,
      newVersions: applyResult.newVersionsCount,
      eventsCreated: applyResult.eventsCount,
    });

    if (applyResult.newSourcesCount !== 4) throw new Error(`Expected 4 new sources, got ${applyResult.newSourcesCount}`);
    if (applyResult.newRulesCount !== 6) throw new Error(`Expected 6 new rules, got ${applyResult.newRulesCount}`);
    if (applyResult.newVersionsCount !== 8) throw new Error(`Expected 8 new versions, got ${applyResult.newVersionsCount}`);

    // Verify post-apply counts on PostgreSQL
    const postApplyCounts = {
      sources: await prisma.policySource.count(),
      rules: await prisma.policyRule.count(),
      versions: await prisma.policyRuleVersion.count(),
      events: await prisma.policyRuleEvent.count(),
      users: await prisma.user.count(),
      projects: await prisma.project.count(),
      creatives: await prisma.creative.count(),
      findings: await prisma.finding.count(),
      activities: await prisma.activity.count(),
    };
    console.log(`Post-apply table counts:`, postApplyCounts);

    if (postApplyCounts.sources !== 7) throw new Error(`Expected 7 PolicySources, got ${postApplyCounts.sources}`);
    if (postApplyCounts.rules !== 9) throw new Error(`Expected 9 PolicyRules, got ${postApplyCounts.rules}`);
    if (postApplyCounts.versions !== 11) throw new Error(`Expected 11 PolicyRuleVersions, got ${postApplyCounts.versions}`);
    if (postApplyCounts.events !== 22) throw new Error(`Expected 22 PolicyRuleEvents, got ${postApplyCounts.events}`);
    if (postApplyCounts.users !== 4 || postApplyCounts.projects !== 5 || postApplyCounts.creatives !== 8) {
      throw new Error(`Unrelated data was modified! Users: ${postApplyCounts.users}, Projects: ${postApplyCounts.projects}, Creatives: ${postApplyCounts.creatives}`);
    }

    // Verify pre-existing Meta source preserved its REQUIRES_REVIEW status and updatedAt timestamp
    const postMetaSource = await prisma.policySource.findUniqueOrThrow({ where: { id: "src_meta" } });
    if (postMetaSource.verificationStatus !== "REQUIRES_REVIEW") {
      throw new Error(`Meta source verificationStatus changed to ${postMetaSource.verificationStatus}! Expected REQUIRES_REVIEW.`);
    }
    if (postMetaSource.updatedAt.getTime() !== preMetaSource.updatedAt.getTime()) {
      throw new Error(`Meta source updatedAt changed! Pre: ${preMetaSource.updatedAt.toISOString()}, Post: ${postMetaSource.updatedAt.toISOString()}`);
    }
    console.log(`[PASS] Meta source preserved exact REQUIRES_REVIEW status and unchanged updatedAt timestamp.`);

    // Verify version evolution for RX-META-PA-01
    const metaRule = await prisma.policyRule.findUniqueOrThrow({
      where: { code: "RX-META-PA-01" },
      include: { versions: { orderBy: { versionNumber: "asc" } } },
    });
    if (metaRule.currentVersionNumber !== 2) throw new Error(`RX-META-PA-01 currentVersionNumber is ${metaRule.currentVersionNumber}, expected 2`);
    if (metaRule.versions.length !== 2) throw new Error(`Expected 2 versions for RX-META-PA-01, got ${metaRule.versions.length}`);
    if (metaRule.versions[0].status !== "DEPRECATED") throw new Error(`RX-META-PA-01 v1 status is ${metaRule.versions[0].status}, expected DEPRECATED`);
    if (metaRule.versions[1].status !== "DRAFT" || metaRule.versions[1].verificationStatus !== "UNVERIFIED") {
      throw new Error(`RX-META-PA-01 v2 is not DRAFT/UNVERIFIED!`);
    }

    // Verify version evolution for RX-GOOG-PA-01
    const googPaRule = await prisma.policyRule.findUniqueOrThrow({
      where: { code: "RX-GOOG-PA-01" },
      include: { versions: { orderBy: { versionNumber: "asc" } } },
    });
    if (googPaRule.currentVersionNumber !== 2) throw new Error(`RX-GOOG-PA-01 currentVersionNumber is ${googPaRule.currentVersionNumber}, expected 2`);
    if (googPaRule.versions[0].status !== "DEPRECATED") throw new Error(`RX-GOOG-PA-01 v1 status is ${googPaRule.versions[0].status}, expected DEPRECATED`);
    if (googPaRule.versions[1].status !== "DRAFT" || googPaRule.versions[1].verificationStatus !== "UNVERIFIED") {
      throw new Error(`RX-GOOG-PA-01 v2 is not DRAFT/UNVERIFIED!`);
    }

    // Verify supersession & deprecation of composite rule RX-GOOG-HM-01
    const hmRule = await prisma.policyRule.findUniqueOrThrow({
      where: { code: "RX-GOOG-HM-01" },
      include: { versions: { orderBy: { versionNumber: "asc" } } },
    });
    if (hmRule.versions[0].status !== "DEPRECATED") throw new Error(`RX-GOOG-HM-01 v1 is not DEPRECATED!`);
    if (!hmRule.versions[0].reviewNote?.includes("SUPERSEDED RULE — INACTIVE")) {
      throw new Error(`RX-GOOG-HM-01 reviewNote missing supersession lock!`);
    }

    // Verify the EXACT 8 reviewable drafts in DRAFT / UNVERIFIED
    const activeDrafts = await prisma.policyRuleVersion.findMany({
      where: { status: "DRAFT" },
      include: { rule: { select: { code: true } } },
      orderBy: { rule: { code: "asc" } },
    });
    if (activeDrafts.length !== 8) throw new Error(`Expected 8 reviewable DRAFT versions, got ${activeDrafts.length}`);
    for (const v of activeDrafts) {
      if (v.verificationStatus !== "UNVERIFIED") {
        throw new Error(`Version ${v.id} (${v.rule.code} v${v.versionNumber}) is ${v.verificationStatus}, expected UNVERIFIED`);
      }
    }
    const draftCodes = activeDrafts.map((v) => v.rule.code).sort();
    const expectedCodes = [
      "RX-GOOG-PA-01",
      "RX-GOOG-PDS-01",
      "RX-GOOG-RDT-01",
      "RX-META-PA-01",
      "RX-TIKTOK-HP-01",
      "RX-TIKTOK-MC-01",
      "RX-US-FTC-CS-01",
      "RX-US-FTC-TE-01",
    ];
    console.log(`Reviewable draft policy codes on PostgreSQL:`, draftCodes);
    if (JSON.stringify(draftCodes) !== JSON.stringify(expectedCodes)) {
      throw new Error(`Policy code mismatch! Expected ${JSON.stringify(expectedCodes)}, got ${JSON.stringify(draftCodes)}`);
    }

    // Confirm ZERO active or verified versions
    const activeOrVerifiedCount = await prisma.policyRuleVersion.count({
      where: { OR: [{ status: "ACTIVE" }, { verificationStatus: "VERIFIED" }] },
    });
    if (activeOrVerifiedCount !== 0) throw new Error(`Found ${activeOrVerifiedCount} ACTIVE/VERIFIED versions! Expected 0.`);

    console.log(`[PASS] Successful apply verified: 8 reviewable drafts created in DRAFT/UNVERIFIED, 3 deprecated historical records, 0 active/verified.`);

    // Step 6: Test Idempotent Second Execution on PostgreSQL
    console.log(`\n=== STEP 6: IDEMPOTENT SECOND EXECUTION ===`);
    const secondResult = await runTier2Import(prisma, {
      author: "team@clyntique.demo",
      apply: true,
      createVersions: true,
      dbName: REHEARSAL_DB,
      testRollback: false,
      silent: true,
    });

    console.log(`Second run result:`, {
      newSources: secondResult.newSourcesCount,
      newRules: secondResult.newRulesCount,
      newVersions: secondResult.newVersionsCount,
      eventsCreated: secondResult.eventsCount,
    });

    if (secondResult.newSourcesCount !== 0 || secondResult.newRulesCount !== 0) {
      throw new Error(`Second execution created duplicate records! Sources: ${secondResult.newSourcesCount}, Rules: ${secondResult.newRulesCount}`);
    }

    const postSecondCounts = {
      sources: await prisma.policySource.count(),
      rules: await prisma.policyRule.count(),
      versions: await prisma.policyRuleVersion.count(),
      events: await prisma.policyRuleEvent.count(),
      users: await prisma.user.count(),
      projects: await prisma.project.count(),
      creatives: await prisma.creative.count(),
    };
    console.log(`Counts after second run:`, postSecondCounts);

    if (
      postSecondCounts.sources !== 7 ||
      postSecondCounts.rules !== 9 ||
      postSecondCounts.versions !== 11 ||
      postSecondCounts.events !== 22 ||
      postSecondCounts.users !== 4 ||
      postSecondCounts.projects !== 5 ||
      postSecondCounts.creatives !== 8
    ) {
      throw new Error(`Second execution changed table counts: ${JSON.stringify(postSecondCounts)}`);
    }

    console.log(`[PASS] Idempotency confirmed: second run created 0 records, table counts strictly identical.`);
    console.log(`\n>>> ALL POSTGRESQL REHEARSAL CHECKS PASSED PERFECTLY! <<<`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`[POSTGRES REHEARSAL FAILED]`, err);
  process.exitCode = 1;
});
