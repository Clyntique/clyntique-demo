// Sets up the TWO Preview test policy admins (P0 Preview validation, Oct 28).
// Approved for the Preview database only; never for Production.
//
// Dry run by default: reports what it would do and writes nothing.
//   npx tsx prisma/preview-policy-admins.ts --admin-a <team-email> --admin-b <team-email>
// To write:
//   PREVIEW_ADMIN_CONFIRM_DATABASE=clyntique_demo_preview \
//   PREVIEW_ADMIN_B_PASSWORD=<from your password manager> \
//   npx tsx prisma/preview-policy-admins.ts --admin-a <email> --admin-b <email> [--name-b "Preview Policy Admin B"] --apply
//
// Safety:
// - Refuses any database other than clyntique_demo_preview or a local p0_local*
//   database, and NODE_ENV=production.
// - Both admins must be different TEAM accounts. Admin A must already exist.
//   Admin B is created (TEAM) if missing, with PREVIEW_ADMIN_B_PASSWORD
//   (at least 12 characters); an existing account's password is never changed.
// - Leaves exactly these two with isPolicyAdmin = true: any other account that
//   has the flag is listed and the run stops, so nothing is revoked silently.
// - Never prints passwords or connection strings.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { databaseNameOf } from "./seed-plan";

const PREVIEW_DATABASE = "clyntique_demo_preview";

function arg(argv: string[], name: string) {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1]?.trim() : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const emailA = arg(argv, "--admin-a")?.toLowerCase();
  const emailB = arg(argv, "--admin-b")?.toLowerCase();
  const nameB = arg(argv, "--name-b") ?? "Preview Policy Admin B";
  if (!emailA || !emailB) throw new Error("Usage: --admin-a <team-email> --admin-b <team-email> [--name-b <name>] [--apply]");
  if (emailA === emailB) throw new Error("The two admins must be different accounts.");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const dbName = databaseNameOf(connectionString);
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run with NODE_ENV=production.");
  // Also allowed: a disposable local database (free-tier local validation, Oct 29).
  const local = ["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname) && Boolean(dbName?.startsWith("p0_local"));
  if (dbName !== PREVIEW_DATABASE && !local) throw new Error(`Refusing: this script only runs against "${PREVIEW_DATABASE}" or a local p0_local* database (DATABASE_URL points to "${dbName}").`);
  if (apply && process.env.PREVIEW_ADMIN_CONFIRM_DATABASE !== dbName) throw new Error(`To write, set PREVIEW_ADMIN_CONFIRM_DATABASE=${dbName}.`);

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

    const password = process.env.PREVIEW_ADMIN_B_PASSWORD ?? "";
    if (apply && !b && password.length < 12) throw new Error("Admin B doesn't exist yet: set PREVIEW_ADMIN_B_PASSWORD (at least 12 characters).");

    console.log(`Database: ${dbName}${apply ? "" : " (dry run, nothing written)"}`);
    console.log(`Admin A: ${emailA} · TEAM · isPolicyAdmin ${a.isPolicyAdmin ? "already true" : "-> true"}`);
    console.log(`Admin B: ${emailB} · ${b ? `TEAM · isPolicyAdmin ${b.isPolicyAdmin ? "already true" : "-> true"}` : `create TEAM account "${nameB}", isPolicyAdmin true (needs PREVIEW_ADMIN_B_PASSWORD)`}`);
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
