// READ-ONLY check of the demo accounts' passwords, using the same bcrypt
// comparison as the login action. Prints PASS/FAIL only, never a password.
//
//   npx tsx --env-file=.env.seed.local prisma/verify-demo-logins.ts
//
// Reads SEED_TEAM_PASSWORD, SEED_CLIENT_PASSWORD, SEED_CLIENT2_PASSWORD (new,
// must match) and optional OLD_TEAM_PASSWORD, OLD_CLIENT_PASSWORD (previously
// published, must NOT match) from the environment.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const CHECKS = [
  { email: "team@clyntique.demo", role: "TEAM", next: "SEED_TEAM_PASSWORD", old: "OLD_TEAM_PASSWORD" },
  { email: "client@clyntique.demo", role: "CLIENT", next: "SEED_CLIENT_PASSWORD", old: "OLD_CLIENT_PASSWORD" },
  { email: "client2@clyntique.demo", role: "CLIENT", next: "SEED_CLIENT2_PASSWORD", old: undefined },
] as const;

async function main() {
  let ok = true;
  for (const c of CHECKS) {
    const user = await prisma.user.findUnique({ where: { email: c.email }, select: { role: true, passwordHash: true } });
    if (!user || user.role !== c.role) {
      ok = false;
      console.log(`FAIL  ${c.email}: account missing or wrong role`);
      continue;
    }
    const next = process.env[c.next];
    if (!next) {
      ok = false;
      console.log(`FAIL  ${c.email}: ${c.next} not set`);
    } else {
      const match = await bcrypt.compare(next, user.passwordHash);
      ok &&= match;
      console.log(`${match ? "PASS" : "FAIL"}  ${c.email}: new password ${match ? "accepted" : "REJECTED"}`);
    }
    const old = c.old ? process.env[c.old] : undefined;
    if (c.old && old) {
      const stillWorks = await bcrypt.compare(old, user.passwordHash);
      ok &&= !stillWorks;
      console.log(`${stillWorks ? "FAIL" : "PASS"}  ${c.email}: old published password ${stillWorks ? "STILL WORKS" : "rejected"}`);
    } else if (c.old) {
      console.log(`SKIP  ${c.email}: ${c.old} not set (old password not checked)`);
    }
  }
  console.log(ok ? "All login checks passed." : "LOGIN CHECKS FAILED");
  process.exitCode = ok ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.name : "Check failed.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
