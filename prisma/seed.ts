// Development-only seed for the fictional demo accounts.
//
// Dry run by default: it reports what it would do and writes nothing.
//   npx tsx prisma/seed.ts                     # dry run (also what `npm run db:seed` does)
//   npx tsx prisma/seed.ts --apply             # create missing demo accounts only
//   npx tsx prisma/seed.ts --apply --rotate    # also replace demo account passwords
//
// Writes need SEED_CONFIRM_DATABASE=<database name in DATABASE_URL>. Passwords
// come only from SEED_TEAM_PASSWORD, SEED_CLIENT_PASSWORD and (optional)
// SEED_CLIENT2_PASSWORD. Existing accounts are never changed without --rotate.
// The rules live in prisma/seed-plan.ts. Never prints passwords or connection strings.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEMO_ACCOUNTS, describeStep, parseArgs, planSeed } from "./seed-plan";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const existing = await prisma.user.findMany({
      where: { email: { in: DEMO_ACCOUNTS.map((a) => a.email) } },
      select: { email: true, role: true },
    });

    const plan = planSeed({ env: process.env, options, existing });
    if (!plan.ok) {
      for (const error of plan.errors) console.error(`seed: ${error}`);
      process.exitCode = 1;
      return;
    }

    for (const step of plan.steps) console.log(`seed: ${options.apply ? "" : "[dry run] "}${describeStep(step)}`);
    if (!options.apply) {
      console.log("seed: dry run only. Nothing was written. See README.md for --apply.");
      return;
    }

    for (const step of plan.steps) {
      if (step.kind === "skip") continue;
      const passwordHash = await bcrypt.hash(step.password, 12);
      if (step.kind === "create") {
        // create (not upsert): if the account appeared meanwhile, this fails instead of overwriting it.
        await prisma.user.create({
          data: { name: step.account.name, email: step.account.email, role: step.account.role, passwordHash },
        });
      } else {
        const { count } = await prisma.user.updateMany({
          where: { email: step.account.email, role: step.account.role },
          data: { passwordHash },
        });
        if (count !== 1) throw new Error(`Password rotation did not match exactly one account for ${step.account.email}.`);
      }
      console.log(`seed: done: ${describeStep(step)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Seed failed.");
  process.exitCode = 1;
});
