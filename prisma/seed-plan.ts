// Pure planning logic for the development seed (prisma/seed.ts). It has no
// database access, so its safety rules can be unit tested.
//
// Safety rules:
// - Nothing is written unless --apply is passed. The default is a dry run.
// - Writing requires SEED_CONFIRM_DATABASE to equal the target database name,
//   so a seed can't hit the wrong (e.g. shared) database by accident.
// - Existing accounts are never modified unless --rotate is also passed, and
//   rotation only touches the demo emails listed here, with an unchanged role.
// - Passwords come only from the environment, must be long, and must not be
//   any previously published demo password.
// - The optional second client is created only when its password is set.

import { createHash } from "node:crypto";
import type { Role } from "../src/generated/prisma/enums";

export type DemoAccount = { name: string; email: string; role: Role; passwordEnv: string; optional?: boolean };

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { name: "Clyntique Team", email: "team@clyntique.demo", role: "TEAM", passwordEnv: "SEED_TEAM_PASSWORD" },
  { name: "Alex Morgan", email: "client@clyntique.demo", role: "CLIENT", passwordEnv: "SEED_CLIENT_PASSWORD" },
  {
    // Fictional second client, used only to check cross-client isolation.
    name: "Jordan Lee",
    email: "client2@clyntique.demo",
    role: "CLIENT",
    passwordEnv: "SEED_CLIENT2_PASSWORD",
    optional: true,
  },
];

export const MIN_PASSWORD_LENGTH = 12;

// SHA-256 of the passwords published in earlier versions of README.md / seed.ts
// (stored hashed so this file doesn't republish them). They are refused so a
// rotation can't reinstate them.
export const PUBLISHED_PASSWORD_HASHES = new Set([
  "61889aa6f9f486eeb08b75844451539b3f8095548c3b09fc4ec1e7d0bb9483ac",
  "87a409e0c4a80614cf0f9938987fab4e7a3c8651a4148ddbe0bfbce76e7311b1",
]);

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export type SeedOptions = { apply: boolean; rotate: boolean };

export function parseArgs(argv: string[]): SeedOptions {
  return { apply: argv.includes("--apply"), rotate: argv.includes("--rotate") };
}

/** The database name from a PostgreSQL URL, or null. Never returns credentials. */
export function databaseNameOf(connectionString: string | undefined): string | null {
  if (!connectionString) return null;
  try {
    const name = decodeURIComponent(new URL(connectionString).pathname.replace(/^\//, ""));
    return name || null;
  } catch {
    return null;
  }
}

export type ExistingUser = { email: string; role: Role };

export type SeedStep =
  | { kind: "create"; account: DemoAccount; password: string }
  | { kind: "rotate"; account: DemoAccount; password: string }
  | { kind: "skip"; account: DemoAccount; reason: string };

export type SeedPlan = { ok: true; steps: SeedStep[]; writes: boolean } | { ok: false; errors: string[] };

export function planSeed(input: {
  env: Record<string, string | undefined>;
  options: SeedOptions;
  existing: ExistingUser[];
  /** SHA-256 hashes of refused passwords. Defaults to the previously published ones. */
  blockedPasswordHashes?: Set<string>;
}): SeedPlan {
  const { env, options, existing, blockedPasswordHashes = PUBLISHED_PASSWORD_HASHES } = input;
  const errors: string[] = [];

  if (env.NODE_ENV === "production") errors.push("Refusing to seed when NODE_ENV=production.");
  if (options.rotate && !options.apply) errors.push("--rotate only works together with --apply.");

  if (options.apply) {
    const target = databaseNameOf(env.DATABASE_URL);
    if (!target) errors.push("DATABASE_URL is missing or has no database name.");
    else if (!env.SEED_CONFIRM_DATABASE) {
      errors.push("Set SEED_CONFIRM_DATABASE to the target database name to allow writes.");
    } else if (env.SEED_CONFIRM_DATABASE !== target) {
      errors.push("SEED_CONFIRM_DATABASE does not match the database in DATABASE_URL. Nothing was written.");
    }
  }

  const steps: SeedStep[] = [];
  for (const account of DEMO_ACCOUNTS) {
    const password = env[account.passwordEnv] ?? "";
    const found = existing.find((u) => u.email === account.email);

    if (!password) {
      if (account.optional) {
        steps.push({ kind: "skip", account, reason: `${account.passwordEnv} not set (optional account)` });
        continue;
      }
      if (!found) {
        errors.push(`${account.passwordEnv} must be set to create ${account.email}.`);
        continue;
      }
      steps.push({ kind: "skip", account, reason: "already exists; left unchanged" });
      continue;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.push(`${account.passwordEnv} must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      continue;
    }
    if (blockedPasswordHashes.has(sha256(password))) {
      errors.push(`${account.passwordEnv} is a previously published demo password. Choose a new one.`);
      continue;
    }

    if (!found) {
      steps.push({ kind: "create", account, password });
    } else if (found.role !== account.role) {
      errors.push(`${account.email} exists with a different role; refusing to touch it.`);
    } else if (options.rotate) {
      steps.push({ kind: "rotate", account, password });
    } else {
      steps.push({ kind: "skip", account, reason: "already exists; left unchanged (use --rotate to change its password)" });
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, steps, writes: options.apply && steps.some((s) => s.kind !== "skip") };
}

/** Human-readable plan lines. Never includes passwords. */
export function describeStep(step: SeedStep): string {
  const who = `${step.account.role} ${step.account.email}`;
  if (step.kind === "create") return `create ${who}`;
  if (step.kind === "rotate") return `rotate password for ${who}`;
  return `skip ${who}: ${step.reason}`;
}
