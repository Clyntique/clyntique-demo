// Creates ONE client account (e.g. a YC reviewer) without opening public sign-up.
//
// Dry run by default: it checks everything, reports what it would do and writes nothing.
//   npm run db:create-client                 # dry run
//   npm run db:create-client -- --apply      # create the account
//
// Input comes only from the environment (never from arguments, so nothing lands
// in shell history): ACCOUNT_NAME, ACCOUNT_EMAIL, ACCOUNT_PASSWORD, and for
// --apply ACCOUNT_CONFIRM_DATABASE=<database name in DATABASE_URL>.
// The account is always CLIENT and never a policy administrator; an existing
// email is refused, never updated. The rules live in prisma/client-account-plan.ts.
// Never prints the password, its hash or the connection string.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { normalizeEmail } from "../src/lib/auth/registration";
import { describe, parseArgs, planClientAccount } from "./client-account-plan";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const email = normalizeEmail(process.env.ACCOUNT_EMAIL ?? "");
    const existing = email ? await prisma.user.findUnique({ where: { email }, select: { role: true } }) : null;

    const plan = planClientAccount({ env: process.env, options, existing });
    if (!plan.ok) {
      for (const error of plan.errors) console.error(`create-client: ${error}`);
      process.exitCode = 1;
      return;
    }

    console.log(`create-client: ${options.apply ? "" : "[dry run] "}${describe(plan)}`);
    if (!plan.writes) {
      console.log("create-client: dry run only. Nothing was written. Add --apply with ACCOUNT_CONFIRM_DATABASE to create it.");
      return;
    }

    const passwordHash = await bcrypt.hash(plan.account.password, 12);
    // create (not upsert): if the email appeared meanwhile, the unique index makes this fail instead of overwriting.
    const user = await prisma.user.create({
      data: { name: plan.account.name, email: plan.account.email, role: plan.account.role, passwordHash },
      select: { id: true, role: true, isPolicyAdmin: true },
    });
    if (user.role !== "CLIENT" || user.isPolicyAdmin) throw new Error("Created account is not a plain CLIENT. Investigate before use.");
    console.log(`create-client: done: CLIENT account created (id ${user.id}). It sees nothing until the Team assigns it a project.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // Prisma's unique-constraint error names the field, never the value or the URL.
  const code = (error as { code?: string })?.code;
  // Belt and braces: strip anything that looks like a connection string from driver messages.
  const message = error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, "<connection string>") : "failed.";
  console.error(code === "P2002" ? "create-client: an account with this email already exists. Nothing was changed." : `create-client: ${message}`);
  process.exitCode = 1;
});
