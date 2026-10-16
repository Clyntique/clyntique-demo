// Sample data for the three demo accounts, for an ISOLATED demo or test
// database only. Every record is fictional and labelled "[SAMPLE]".
//
// Dry run by default. Run with the react-server condition so the app's own
// workflow commands (the same code the UI uses) can be imported:
//   node --conditions=react-server --import tsx prisma/demo-fixtures.ts            # dry run
//   node --conditions=react-server --import tsx prisma/demo-fixtures.ts --apply    # write
//   (npm run db:demo-fixtures -- --apply)
//
// Safety:
// - Writes need --apply and SEED_CONFIRM_DATABASE=<database name in DATABASE_URL>.
// - Refuses the shared Production/Preview database (cyntique_demo) and NODE_ENV=production.
// - Needs the demo accounts to exist first (prisma/seed.ts).
// - Idempotent: a client that already has its sample project is skipped.
// - Creative files: uploaded to the private Blob store when BLOB_READ_WRITE_TOKEN
//   is set. Without it, only draft submissions are created, unless
//   --placeholder-files is passed (local testing: the workflow works, previews don't).
// - --synthetic-policy also creates ONE clearly labelled synthetic policy rule
//   (SYNTHETIC-TEST-01) so the AI grounding path can be exercised. It is not a
//   real regulation or platform policy and must never be created in a database
//   used for real reviews.
import "dotenv/config";
import { deflateSync } from "node:zlib";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { prisma } from "../src/lib/prisma";
import type { CurrentUser } from "../src/lib/auth/dal";
import { addEvidence, completeReview, createDraft, recordFinding, requestChanges, startReview, submitForReview } from "../src/lib/workflow/commands";
import { databaseNameOf } from "./seed-plan";

const REFUSED_DATABASES = new Set(["cyntique_demo"]);
const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const PLACEHOLDER = args.has("--placeholder-files");
const SYNTHETIC_POLICY = args.has("--synthetic-policy");

function fail(message: string): never {
  console.error(`demo-fixtures: ${message}`);
  process.exit(1);
}

// A small solid-colour PNG (valid signature, so the app's file checks accept it).
function png(width: number, height: number, rgb: [number, number, number]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3).map((_, i) => rgb[i % 3])]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function addVersion(creativeId: string, client: CurrentUser, rgb: [number, number, number], versionNumber = 1) {
  const fileName = `sample-v${versionNumber}.png`;
  const body = png(1080, 1080, rgb);
  let fileUrl: string;
  let filePathname: string;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`creatives/${creativeId}/${randomUUID()}.png`, body, { access: "private", contentType: "image/png", addRandomSuffix: true });
    fileUrl = blob.url;
    filePathname = blob.pathname;
  } else {
    filePathname = `creatives/${creativeId}/placeholder-${randomUUID()}.png`;
    fileUrl = `https://placeholder.private.blob.vercel-storage.com/${filePathname}`;
  }
  await prisma.creativeVersion.create({
    data: { creativeId, versionNumber, fileUrl, filePathname, fileName, mimeType: "image/png", sizeBytes: body.length, mediaType: "IMAGE", createdById: client.id },
  });
}

function must<T extends { ok: boolean }>(label: string, result: T): Extract<T, { ok: true }> {
  if (!result.ok) fail(`${label}: ${(result as unknown as { error: string }).error}`);
  return result as Extract<T, { ok: true }>;
}

async function latestRound(creativeId: string) {
  const r = await prisma.submissionRound.findFirst({ where: { creativeId }, orderBy: { submittedAt: "desc" }, select: { id: true, versionId: true } });
  if (!r) fail("expected a submission round");
  return r;
}

async function main() {
  const dbName = databaseNameOf(process.env.DATABASE_URL);
  if (!dbName) fail("DATABASE_URL is missing or has no database name.");
  if (REFUSED_DATABASES.has(dbName)) fail(`refusing to write sample data to "${dbName}" (shared Production/Preview database). Use an isolated demo database.`);
  if (process.env.NODE_ENV === "production") fail("refusing to run with NODE_ENV=production.");
  if (APPLY && process.env.SEED_CONFIRM_DATABASE !== dbName) fail("set SEED_CONFIRM_DATABASE to the target database name to allow writes.");

  const users = await prisma.user.findMany({
    where: { email: { in: ["team@clyntique.demo", "client@clyntique.demo", "client2@clyntique.demo"] } },
    select: { id: true, name: true, email: true, role: true },
  });
  const byEmail = new Map(users.map((u) => [u.email, u as CurrentUser]));
  const team = byEmail.get("team@clyntique.demo");
  const client1 = byEmail.get("client@clyntique.demo");
  const client2 = byEmail.get("client2@clyntique.demo");
  if (!team || team.role !== "TEAM" || !client1 || client1.role !== "CLIENT" || !client2 || client2.role !== "CLIENT") {
    fail("the three demo accounts must exist first (run prisma/seed.ts with SEED_CLIENT2_PASSWORD set).");
  }

  const files = Boolean(process.env.BLOB_READ_WRITE_TOKEN) || PLACEHOLDER;
  console.log(`demo-fixtures: database "${dbName}", ${APPLY ? "APPLY" : "dry run"}, files: ${process.env.BLOB_READ_WRITE_TOKEN ? "Blob uploads" : PLACEHOLDER ? "placeholders (no previews)" : "none (drafts only)"}`);

  const plans = [
    { client: client1, project: "[SAMPLE] Northside Family Practice — Seasonal Clinic Campaign" },
    { client: client2, project: "[SAMPLE] Lakeview Pediatrics — Back-to-School Checkups" },
  ];
  for (const plan of plans) {
    const exists = await prisma.project.findFirst({ where: { name: plan.project, clientId: plan.client.id }, select: { id: true } });
    console.log(`demo-fixtures: ${exists ? "skip (exists)" : "create"} project for ${plan.client.email}: ${plan.project}`);
  }
  if (SYNTHETIC_POLICY) console.log("demo-fixtures: create SYNTHETIC-TEST-01 (synthetic test policy, GLOBAL, GENERAL) if missing");
  if (!APPLY) {
    console.log("demo-fixtures: dry run only. Nothing was written.");
    return;
  }

  // ---- Client 1: one awaiting the client, one awaiting the team, one draft.
  if (!(await prisma.project.findFirst({ where: { name: plans[0].project, clientId: client1.id } }))) {
    const project = await prisma.project.create({ data: { name: plans[0].project, description: "Fictional sample project for demo testing.", clientId: client1.id } });
    await prisma.activity.create({ data: { projectId: project.id, userId: team.id, type: "OTHER", message: "Project created" } });

    const changes = must("draft 1", await createDraft(client1, {
      projectId: project.id,
      name: "[SAMPLE] Clinic hours announcement — Feed post",
      description: "Announces extended weekday clinic hours.",
      context: "Objective: awareness. Audience: existing patients. Key message: longer opening hours.",
      format: "FEED",
      marketCodes: ["US"],
      platformCodes: ["META"],
    }));
    must("evidence 1", await addEvidence(client1, { creativeId: changes.creativeId, title: "[SAMPLE] Opening hours page", type: "SOURCE", source: "Clinic website (fictional)", url: "https://example.com/hours" }));
    if (files) {
      await addVersion(changes.creativeId, client1, [26, 44, 72]);
      must("submit 1", await submitForReview(client1, changes.creativeId));
      must("start 1", await startReview(team, changes.creativeId));
      must("finding 1", await recordFinding(team, {
        creativeId: changes.creativeId,
        issue: "[SAMPLE] Opening hours need a date range",
        explanation: "The post says hours are extended but not from when or until when. (Sample finding for demo testing.)",
        severity: "MEDIUM",
        requiredAction: "REVISE_CONTENT",
        actionDetails: "Add the start date (and end date, if temporary) of the new hours.",
      }));
      const r = await latestRound(changes.creativeId);
      must("request changes 1", await requestChanges(team, { creativeId: changes.creativeId, roundId: r.id, versionId: r.versionId, summary: "[SAMPLE] One change needed before this can be completed." }));

      const waiting = must("draft 2", await createDraft(client1, {
        projectId: project.id,
        name: "[SAMPLE] New patient welcome — Story",
        description: "Welcomes new patients and explains how to book.",
        format: "STORY",
        marketCodes: ["US"],
        platformCodes: ["META", "GOOGLE"],
      }));
      await addVersion(waiting.creativeId, client1, [220, 168, 88]);
      must("submit 2", await submitForReview(client1, waiting.creativeId));
    }
    must("draft 3", await createDraft(client1, {
      projectId: project.id,
      name: "[SAMPLE] Telehealth reminder (draft)",
      description: "Not submitted yet: visible to Client 1 only.",
      format: "STATIC",
      marketCodes: ["US"],
      platformCodes: ["META"],
    }));
    console.log("demo-fixtures: created Client 1 sample data");
  }

  // ---- Client 2: one completed review, one draft.
  if (!(await prisma.project.findFirst({ where: { name: plans[1].project, clientId: client2.id } }))) {
    const project = await prisma.project.create({ data: { name: plans[1].project, description: "Fictional sample project for demo testing.", clientId: client2.id } });
    await prisma.activity.create({ data: { projectId: project.id, userId: team.id, type: "OTHER", message: "Project created" } });

    if (files) {
      const done = must("draft 4", await createDraft(client2, {
        projectId: project.id,
        name: "[SAMPLE] Checkup booking reminder — Feed post",
        description: "Reminds parents to book school checkups.",
        format: "FEED",
        marketCodes: ["US"],
        platformCodes: ["META"],
      }));
      await addVersion(done.creativeId, client2, [129, 117, 102]);
      must("submit 4", await submitForReview(client2, done.creativeId));
      must("start 4", await startReview(team, done.creativeId));
      const r = await latestRound(done.creativeId);
      must("complete 4", await completeReview(team, {
        creativeId: done.creativeId,
        roundId: r.id,
        versionId: r.versionId,
        outcome: "NO_ISSUES_IDENTIFIED",
        summary: "[SAMPLE] Internal review found no issues in this version.",
        scopeNote: "Sample review for demo testing only.",
      }));
    }
    must("draft 5", await createDraft(client2, {
      projectId: project.id,
      name: "[SAMPLE] Vaccination clinic poster (draft)",
      description: "Not submitted yet: visible to Client 2 only.",
      format: "STATIC",
      marketCodes: ["US"],
      platformCodes: ["META"],
    }));
    console.log("demo-fixtures: created Client 2 sample data");
  }

  if (SYNTHETIC_POLICY && !(await prisma.policyRule.findUnique({ where: { code: "SYNTHETIC-TEST-01" } }))) {
    await prisma.$transaction(async (tx) => {
      const source = await tx.policySource.create({
        data: {
          name: "SYNTHETIC TEST FIXTURE — not a real policy source",
          authorityName: "Synthetic test fixture (no real authority)",
          authorityType: "INTERNAL_RISK",
          jurisdictionCode: "GLOBAL",
          officialUrl: "https://example.com/synthetic-test-fixture",
          verificationStatus: "VERIFIED",
        },
      });
      const rule = await tx.policyRule.create({
        data: {
          code: "SYNTHETIC-TEST-01",
          title: "SYNTHETIC TEST RULE — not a real regulation or platform policy",
          authorityType: "INTERNAL_RISK",
          jurisdictionCode: "GLOBAL",
          industry: "GENERAL",
          category: "SUBSTANTIATION",
          currentVersionNumber: 1,
        },
      });
      const version = await tx.policyRuleVersion.create({
        data: {
          ruleId: rule.id,
          versionNumber: 1,
          title: "SYNTHETIC TEST RULE — not a real regulation or platform policy",
          summary: "TEST ONLY: flag any numeric success-rate claim (e.g. '98% success') that has no supporting evidence attached.",
          legalExplanation: "Synthetic test fixture used to exercise AI grounding. It has no legal or platform authority.",
          remediationAction: "TEST ONLY: attach evidence for the claim or remove it.",
          applicabilityConditions: ["Test environments only"],
          exceptions: [],
          status: "ACTIVE",
          verificationStatus: "VERIFIED",
          changeSummary: "Synthetic test fixture created by prisma/demo-fixtures.ts",
          createdById: team.id,
          approvedById: team.id,
          approvedAt: new Date(),
        },
      });
      await tx.policyRuleVersionSource.create({
        data: { versionId: version.id, sourceId: source.id, sectionReference: "SYNTHETIC §1", sectionTitle: "Synthetic test section", directUrl: "https://example.com/synthetic-test-fixture#1", excerpt: "Synthetic test fixture. Not a real policy." },
      });
    });
    console.log("demo-fixtures: created SYNTHETIC-TEST-01");
  }
  console.log("demo-fixtures: done");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "demo-fixtures failed.");
    process.exitCode = 1;
  })
  // The pg pool keeps idle connections open for 60 s; exit once done.
  .finally(() => prisma.$disconnect().finally(() => process.exit(process.exitCode ?? 0)));
