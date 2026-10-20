// Pure planning logic for prisma/create-client-account.ts. No database access,
// so every safety rule below is unit tested (tests/client-account-plan.test.ts).
//
// Safety rules:
// - Nothing is written unless --apply is passed. The default is a dry run.
// - Writing requires ACCOUNT_CONFIRM_DATABASE to equal the database named in
//   DATABASE_URL (for Production: cyntique_demo), so a typo or the wrong .env
//   can't reach another database.
// - Creates exactly one account, always role CLIENT, never a policy
//   administrator. Nothing on the command line or in the environment can
//   change that.
// - Never modifies an existing user: if the email already exists (any role),
//   the plan refuses; the write itself is a create, so a race fails instead of
//   overwriting.
// - Name, email and password follow the same rules as public sign-up
//   (src/lib/auth/registration.ts), including the refusal of Clyntique's own
//   email domains and of previously published demo passwords.
// - Values come only from the environment, so the password never appears in
//   shell history; describe() and the error messages never contain it.

import { createHash } from "node:crypto";
import type { Role } from "../src/generated/prisma/enums";
import { validateSignup } from "../src/lib/auth/registration";
import { PUBLISHED_PASSWORD_HASHES, databaseNameOf } from "./seed-plan";

export const ACCOUNT_ROLE: Role = "CLIENT";

export type AccountOptions = { apply: boolean };

export function parseArgs(argv: string[]): AccountOptions {
  return { apply: argv.includes("--apply") };
}

export type ExistingAccount = { role: Role } | null;

export type AccountPlan =
  | { ok: true; writes: boolean; database: string; account: { name: string; email: string; password: string; role: Role } }
  | { ok: false; errors: string[] };

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function planClientAccount(input: {
  env: Record<string, string | undefined>;
  options: AccountOptions;
  /** The user that already has this email, or null. */
  existing: ExistingAccount;
  blockedPasswordHashes?: Set<string>;
}): AccountPlan {
  const { env, options, existing, blockedPasswordHashes = PUBLISHED_PASSWORD_HASHES } = input;
  const errors: string[] = [];

  const database = databaseNameOf(env.DATABASE_URL);
  if (!database) errors.push("DATABASE_URL is missing or has no database name.");
  if (options.apply && database) {
    if (!env.ACCOUNT_CONFIRM_DATABASE) errors.push(`Set ACCOUNT_CONFIRM_DATABASE to the target database name to allow writes.`);
    else if (env.ACCOUNT_CONFIRM_DATABASE !== database) {
      errors.push("ACCOUNT_CONFIRM_DATABASE does not match the database in DATABASE_URL. Nothing was written.");
    }
  }

  const password = env.ACCOUNT_PASSWORD ?? "";
  const checked = validateSignup({
    name: env.ACCOUNT_NAME ?? "",
    email: env.ACCOUNT_EMAIL ?? "",
    password,
    confirmPassword: password,
  });
  if (!checked.ok) {
    const f = checked.fieldErrors;
    if (f.name) errors.push(`ACCOUNT_NAME: ${f.name}`);
    if (f.email) errors.push(`ACCOUNT_EMAIL: ${f.email}`);
    if (f.password) errors.push(`ACCOUNT_PASSWORD: ${f.password}`);
  } else if (blockedPasswordHashes.has(sha256(password))) {
    errors.push("ACCOUNT_PASSWORD is a previously published demo password. Choose a new one.");
  }

  if (existing) errors.push(`An account with this email already exists (role ${existing.role}). Refusing to change it.`);

  if (errors.length || !checked.ok || !database) return { ok: false, errors };
  return { ok: true, writes: options.apply, database, account: { ...checked.data, role: ACCOUNT_ROLE } };
}

/** Human-readable plan line. Never includes the password. */
export function describe(plan: Extract<AccountPlan, { ok: true }>): string {
  return `create ${plan.account.role} ${plan.account.email} ("${plan.account.name}") in database ${plan.database}; policy administrator: no`;
}
