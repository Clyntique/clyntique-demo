// Concurrency check for the submission workflow against a REAL Postgres
// database: races the app's own workflow commands (the code the UI calls)
// against each other and checks the invariants the row locks guarantee.
//
// For an ISOLATED test database only. It creates a "[TEST] Concurrency check"
// project for the Client 1 demo account with placeholder file records.
//   SEED_CONFIRM_DATABASE=<db name> npm run db:concurrency-check
//
// Safety: refuses the shared Production/Preview database (cyntique_demo),
// NODE_ENV=production, and runs only when SEED_CONFIRM_DATABASE names the
// target database. Needs the demo accounts (prisma/seed.ts).
//
// How a race is forced: a separate transaction holds the submission's row lock
// (SELECT … FOR UPDATE) while the competing commands start. They pass their
// read-only checks, then queue on the lock; releasing it lets them run in turn
// on the committed state, the same interleaving as two people clicking at once.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import type { CurrentUser } from "../src/lib/auth/dal";
import { completeReview, createDraft, recordFinding, requestChanges, startReview, submitForReview } from "../src/lib/workflow/commands";
import { databaseNameOf } from "./seed-plan";

const REFUSED_DATABASES = new Set(["cyntique_demo"]);
const ROUNDS = Number(process.env.CONCURRENCY_ROUNDS ?? 5);
const HOLD_MS = 1500;

function fail(message: string): never {
  console.error(`concurrency-check: ${message}`);
  process.exit(1);
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const outcome = (r: { ok: boolean }) => (r.ok ? "ok" : `refused: ${(r as { error?: string }).error}`);

/** Holds the submission's row lock for HOLD_MS while `race` starts its commands. */
async function underLock<T>(creativeId: string, race: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  let locked!: () => void;
  const isLocked = new Promise<void>((r) => (locked = r));
  const holder = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Creative" WHERE id = ${creativeId} FOR UPDATE`;
      locked();
      await released;
    },
    { timeout: 20_000 },
  );
  await isLocked;
  const result = race();
  await sleep(HOLD_MS);
  release();
  await holder;
  return result;
}

/**
 * The upload finalisation transaction from src/lib/review/actions.ts
 * (finalizeVersion), minus the session and Blob checks around it: lock the
 * submission while it accepts uploads, then add the next version.
 */
async function finalizeUpload(creativeId: string, client: CurrentUser) {
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.creative.findUniqueOrThrow({ where: { id: creativeId }, select: { updatedAt: true } });
      const lockedRow = await tx.creative.updateMany({
        where: { id: creativeId, workflow: "SUBMISSION_REVIEW", status: { in: ["DRAFT", "CHANGES_REQUESTED"] }, updatedAt: row.updatedAt },
        data: { updatedAt: row.updatedAt },
      });
      if (!lockedRow.count) return { ok: false as const, error: "uploads closed" };
      const last = await tx.creativeVersion.findFirst({ where: { creativeId }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
      const versionNumber = (last?.versionNumber ?? 0) + 1;
      const v = await tx.creativeVersion.create({ data: placeholderVersion(creativeId, client, versionNumber), select: { id: true } });
      return { ok: true as const, versionId: v.id, versionNumber };
    });
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.name : "error" };
  }
}

function placeholderVersion(creativeId: string, client: CurrentUser, versionNumber: number) {
  const filePathname = `creatives/${creativeId}/placeholder-${randomUUID()}.png`;
  return {
    creativeId,
    versionNumber,
    fileUrl: `https://placeholder.private.blob.vercel-storage.com/${filePathname}`,
    filePathname,
    fileName: `test-v${versionNumber}.png`,
    mimeType: "image/png",
    sizeBytes: 100,
    mediaType: "IMAGE" as const,
    createdById: client.id,
  };
}

function must<T extends { ok: boolean }>(label: string, result: T): Extract<T, { ok: true }> {
  if (!result.ok) fail(`${label}: ${(result as unknown as { error: string }).error}`);
  return result as Extract<T, { ok: true }>;
}

async function main() {
  const dbName = databaseNameOf(process.env.DATABASE_URL);
  if (!dbName) fail("DATABASE_URL is missing or has no database name.");
  if (REFUSED_DATABASES.has(dbName)) fail(`refusing to run against "${dbName}" (shared Production/Preview database).`);
  if (process.env.NODE_ENV === "production") fail("refusing to run with NODE_ENV=production.");
  if (process.env.SEED_CONFIRM_DATABASE !== dbName) fail("set SEED_CONFIRM_DATABASE to the target database name.");

  const users = await prisma.user.findMany({
    where: { email: { in: ["team@clyntique.demo", "client@clyntique.demo"] } },
    select: { id: true, name: true, email: true, role: true },
  });
  const team = users.find((u) => u.email === "team@clyntique.demo") as CurrentUser | undefined;
  const client = users.find((u) => u.email === "client@clyntique.demo") as CurrentUser | undefined;
  if (team?.role !== "TEAM" || client?.role !== "CLIENT") fail("the demo accounts must exist first (prisma/seed.ts).");
  console.log(`concurrency-check: database "${dbName}", ${ROUNDS} runs per scenario`);

  const project = await prisma.project.create({ data: { name: `[TEST] Concurrency check ${new Date().toISOString()}`, clientId: client.id } });
  const draft = async (name: string, versions = 1) => {
    const d = must("draft", await createDraft(client, { projectId: project.id, name: `[TEST] ${name}`, format: "STATIC", industry: "HEALTHCARE", marketCodes: ["US"], platformCodes: ["META"] }));
    for (let n = 1; n <= versions; n++) await prisma.creativeVersion.create({ data: placeholderVersion(d.creativeId, client, n) });
    return d.creativeId;
  };
  const inReview = async (name: string) => {
    const id = await draft(name);
    must("submit", await submitForReview(client, id));
    must("start review", await startReview(team, id));
    return id;
  };
  const latestRound = (creativeId: string) =>
    prisma.submissionRound.findFirstOrThrow({ where: { creativeId }, orderBy: { number: "desc" }, select: { id: true, versionId: true, version: { select: { versionNumber: true } } } });

  for (let i = 1; i <= ROUNDS; i++) {
    // A. Client uploads a new version while also clicking Submit. Whichever
    // commits first, the submitted round must be on the newest version: no
    // version may be stranded after the round's version.
    {
      const id = await draft(`upload vs submit ${i}`);
      const [submit, upload] = await underLock(id, () =>
        Promise.all([submitForReview(client, id), sleep(i % 2 ? 0 : 50).then(() => finalizeUpload(id, client))]),
      );
      const round = await prisma.submissionRound.findFirst({ where: { creativeId: id }, select: { version: { select: { versionNumber: true } } } });
      const newest = await prisma.creativeVersion.findFirst({ where: { creativeId: id }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
      check(
        `A${i} upload vs submit: round is on the newest version`,
        submit.ok && round?.version.versionNumber === newest?.versionNumber,
        `submit ${outcome(submit)}, upload ${upload.ok ? `ok V${upload.versionNumber}` : `refused: ${upload.error}`}, round V${round?.version.versionNumber}, newest V${newest?.versionNumber}`,
      );
    }

    // B. TEAM adds a finding while another reviewer completes the review.
    // Never both: no finding may land after the final decision.
    {
      const id = await inReview(`finding vs complete ${i}`);
      const r = await latestRound(id);
      const [complete, finding] = await underLock(id, () =>
        Promise.all([
          completeReview(team, { creativeId: id, roundId: r.id, versionId: r.versionId, outcome: "NO_ISSUES_IDENTIFIED", summary: "[TEST] No issues." }),
          sleep(i % 2 ? 0 : 50).then(() =>
            recordFinding(team, { creativeId: id, issue: "[TEST] Concurrent finding", explanation: "Test finding.", severity: "LOW", requiredAction: "ACKNOWLEDGE", actionDetails: "Acknowledge this test finding." }),
          ),
        ]),
      );
      const findings = await prisma.finding.count({ where: { creativeId: id } });
      const status = (await prisma.creative.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;
      check(
        `B${i} finding vs complete: exactly one succeeds, no finding after the decision`,
        complete.ok !== finding.ok && (complete.ok ? findings === 0 && status === "REVIEW_COMPLETE" : findings === 1 && status === "IN_REVIEW"),
        `complete ${outcome(complete)}, finding ${outcome(finding)}, findings ${findings}, status ${status}`,
      );
    }

    // C. Client double-clicks Submit (or retries while the first is in flight).
    {
      const id = await draft(`double submit ${i}`);
      const results = await underLock(id, () => Promise.all([submitForReview(client, id), submitForReview(client, id)]));
      const rounds = await prisma.submissionRound.count({ where: { creativeId: id } });
      check(`C${i} double submit: one round`, results.filter((r) => r.ok).length === 1 && rounds === 1, `${results.map(outcome).join(" / ")}, rounds ${rounds}`);
    }

    // D. Two reviewers decide at once: request changes vs complete review.
    {
      const id = await inReview(`request vs complete ${i}`);
      must("finding", await recordFinding(team, { creativeId: id, issue: "[TEST] Needs a change", explanation: "Test finding.", severity: "MEDIUM", requiredAction: "REVISE_CONTENT", actionDetails: "Revise the test creative." }));
      const r = await latestRound(id);
      const [request, complete] = await underLock(id, () =>
        Promise.all([
          requestChanges(team, { creativeId: id, roundId: r.id, versionId: r.versionId, summary: "[TEST] Please revise." }),
          completeReview(team, {
            creativeId: id,
            roundId: r.id,
            versionId: r.versionId,
            outcome: "COMPLETED_WITH_OPEN_ISSUES",
            summary: "[TEST] Completed with the open issue noted.",
            publishDrafts: true,
          }),
        ]),
      );
      const decisions = await prisma.reviewDecision.findMany({ where: { creativeId: id }, select: { versionId: true } });
      check(
        `D${i} request changes vs complete: one decision, on the round's version`,
        request.ok !== complete.ok && decisions.length === 1 && decisions[0].versionId === r.versionId,
        `request ${outcome(request)}, complete ${outcome(complete)}, decisions ${decisions.length}`,
      );
    }
  }

  console.log(failures ? `concurrency-check: ${failures} FAILED` : "concurrency-check: all passed");
  process.exitCode = failures ? 1 : 0;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : "concurrency-check failed.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().finally(() => process.exit(process.exitCode ?? 0)));
