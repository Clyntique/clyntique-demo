// Sets up the TWO Production policy admins (D1 two-person control: verifier ≠ approver).
// Runs ONLY after the CEO names both admins and approves the run (P0, Oct 30).
//
// Dry run by default: reports what it would do and writes nothing.
//   npx tsx prisma/production-policy-admins.ts --admin-a <team-email> --admin-b <team-email>
// To write (from a GT shell whose DATABASE_URL targets cyntique_demo):
//   PRODUCTION_ADMIN_CONFIRM_DATABASE=cyntique_demo \
//   PRODUCTION_ADMIN_B_PASSWORD=<from the password manager, hidden prompt> \
//   npx tsx prisma/production-policy-admins.ts --admin-a <email> --admin-b <email> [--name-b "<name>"] --production-approved --apply
//
// Safety:
// - Refuses any database other than cyntique_demo (Production) or a local p0_local*
//   database used to rehearse the run.
// - Writes need BOTH --apply and --production-approved, plus the confirm variable
//   naming the database, so the Preview script's habits cannot write here by accident.
// - Both admins must be different TEAM accounts. Admin A must already exist.
//   Admin B is created (TEAM) if missing, with PRODUCTION_ADMIN_B_PASSWORD
//   (at least 14 characters); an existing account's password is never changed.
// - Never touches CLIENT accounts, projects, submissions or policy records.
// - Leaves exactly these two with isPolicyAdmin = true: any other account that
//   has the flag is listed and the run stops, so nothing is revoked silently.
// - Never prints passwords or connection strings.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { databaseNameOf } from "./seed-plan";

const PRODUCTION_DATABASE = "cyntique_demo";
const MIN_PASSWORD = 14;

function arg(argv: string[], name: string) {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1]?.trim() : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const approved = argv.includes("--production-approved");
  const emailA = arg(argv, "--admin-a")?.toLowerCase();
  const emailB = arg(argv, "--admin-b")?.toLowerCase();
  const nameB = arg(argv, "--name-b") ?? "Policy Admin B";
  if (!emailA || !emailB) throw new Error("Usage: --admin-a <team-email> --admin-b <team-email> [--name-b <name>] [--production-approved --apply]");
  if (emailA === emailB) throw new Error("The two admins must be different accounts.");
  if (!emailB.includes("@")) throw new Error("Admin B must be an email address.");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const dbName = databaseNameOf(connectionString);
  const local = ["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname) && Boolean(dbName?.startsWith("p0_local"));
  if (dbName !== PRODUCTION_DATABASE && !local) throw new Error(`Refusing: this script only runs against "${PRODUCTION_DATABASE}" or a local p0_local* rehearsal database (DATABASE_URL points to "${dbName}").`);
  if (apply && !approved) throw new Error("Writing to Production needs --production-approved (only after the CEO's approval). Nothing was changed.");
  if (apply && process.env.PRODUCTION_ADMIN_CONFIRM_DATABASE !== dbName) throw new Error(`To write, set PRODUCTION_ADMIN_CONFIRM_DATABASE=${dbName}.`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const [a, b, flagged] = await Promise.all([
      prisma.user.findUnique({ where: { email: emailA }, select: { id: true, role: true, isPolicyAdmin: true } }),
      prisma.user.findUnique({ where: { email: emailB }, select: { id: true, role: true, isPolicyAdmin: true } }),
      prisma.user.findMany({ where: { isPolicyAdmin: true }, select: { email: true } }),
    ]);
    if (!a || a.role !== "TEAM") throw new Error(`Admin A '${emailA}' must be an existing TEAM account.`);
    if (b && b.role !== "TEAM") throw new Error(`Admin B '${emailB}' exists but is not a TEAM account.`);
    const others = flagged.map((u) => u.email).filter((e) => e !== emailA && e !== emailB);
    if (others.length) throw new Error(`Other accounts already have policy-admin rights: ${others.join(", ")}. Resolve that first; nothing was changed.`);

    const password = process.env.PRODUCTION_ADMIN_B_PASSWORD ?? "";
    if (apply && !b && password.length < MIN_PASSWORD) throw new Error(`Admin B doesn't exist yet: set PRODUCTION_ADMIN_B_PASSWORD (at least ${MIN_PASSWORD} characters).`);

    console.log(`Database: ${dbName}${apply ? "" : " (dry run, nothing written)"}`);
    console.log(`Admin A: ${emailA} · TEAM · isPolicyAdmin ${a.isPolicyAdmin ? "already true" : "-> true"}`);
    console.log(`Admin B: ${emailB} · ${b ? `TEAM · isPolicyAdmin ${b.isPolicyAdmin ? "already true" : "-> true"}` : `create TEAM account "${nameB}", isPolicyAdmin true (needs PRODUCTION_ADMIN_B_PASSWORD)`}`);
    if (!apply) return;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: a.id }, data: { isPolicyAdmin: true } });
      if (b) await tx.user.update({ where: { id: b.id }, data: { isPolicyAdmin: true } });
      else await tx.user.create({ data: { email: emailB, name: nameB, role: "TEAM", passwordHash: await bcrypt.hash(password, 12), isPolicyAdmin: true } });
    });
    const now = await prisma.user.findMany({ where: { isPolicyAdmin: true }, select: { email: true } });
    console.log(`Done. Policy admins now: ${now.map((u) => u.email).join(", ")} (${now.length}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
