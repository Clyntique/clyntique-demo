import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PUBLISHED_PASSWORD_HASHES, databaseNameOf, planSeed, type ExistingUser, type SeedOptions } from "../prisma/seed-plan";

// Fictional connection string; nothing here connects anywhere.
const DB = "postgresql://user:secret@db.example.invalid:5432/clyntique_dev";
const strong = { SEED_TEAM_PASSWORD: "a-new-team-password-1", SEED_CLIENT_PASSWORD: "a-new-client-password-1" };
const confirmed = { DATABASE_URL: DB, SEED_CONFIRM_DATABASE: "clyntique_dev" };
const existingDemo: ExistingUser[] = [
  { email: "team@clyntique.demo", role: "TEAM" },
  { email: "client@clyntique.demo", role: "CLIENT" },
];
const dry: SeedOptions = { apply: false, rotate: false };
const apply: SeedOptions = { apply: true, rotate: false };
const rotate: SeedOptions = { apply: true, rotate: true };

describe("seed safety", () => {
  it("is a dry run by default and never writes", () => {
    expect(planSeed({ env: { DATABASE_URL: DB, ...strong }, options: dry, existing: [] })).toMatchObject({ ok: true, writes: false });
  });

  it("refuses to write without the database confirmation", () => {
    expect(planSeed({ env: { DATABASE_URL: DB, ...strong }, options: apply, existing: [] }).ok).toBe(false);
  });

  it("refuses to write when the confirmation names another database", () => {
    const env = { DATABASE_URL: DB, SEED_CONFIRM_DATABASE: "other", ...strong };
    expect(planSeed({ env, options: apply, existing: [] }).ok).toBe(false);
  });

  it("never changes existing accounts without --rotate", () => {
    const plan = planSeed({ env: { ...confirmed, ...strong }, options: apply, existing: existingDemo });
    expect(plan.ok && plan.steps.every((s) => s.kind === "skip")).toBe(true);
    expect(plan.ok && plan.writes).toBe(false);
  });

  it("leaves existing accounts alone when no password is given, even with --rotate", () => {
    const plan = planSeed({ env: confirmed, options: rotate, existing: existingDemo });
    expect(plan.ok && plan.steps.map((s) => s.kind)).toEqual(["skip", "skip", "skip"]);
  });

  it("rotates only with --apply --rotate, confirmation and new strong passwords", () => {
    const plan = planSeed({ env: { ...confirmed, ...strong }, options: rotate, existing: existingDemo });
    expect(plan.ok && plan.steps.filter((s) => s.kind === "rotate").length).toBe(2);
    expect(planSeed({ env: { DATABASE_URL: DB, ...strong }, options: { apply: false, rotate: true }, existing: existingDemo }).ok).toBe(false);
  });

  it("rejects short and previously published passwords", () => {
    const blockedPasswordHashes = new Set([createHash("sha256").update("leaked-password-123").digest("hex")]);
    for (const bad of ["short", "leaked-password-123"]) {
      const env = { DATABASE_URL: DB, SEED_TEAM_PASSWORD: bad, SEED_CLIENT_PASSWORD: strong.SEED_CLIENT_PASSWORD };
      expect(planSeed({ env, options: dry, existing: [], blockedPasswordHashes }).ok).toBe(false);
    }
  });

  it("blocks the two previously published demo passwords by default", () => {
    expect(PUBLISHED_PASSWORD_HASHES.size).toBe(2);
  });

  it("refuses to touch an existing account whose role differs", () => {
    const plan = planSeed({ env: { ...confirmed, ...strong }, options: rotate, existing: [{ email: "team@clyntique.demo", role: "CLIENT" }] });
    expect(plan.ok).toBe(false);
  });

  it("creates the optional second client only when its password is set", () => {
    const without = planSeed({ env: { ...confirmed, ...strong }, options: apply, existing: existingDemo });
    expect(without.ok && without.steps.some((s) => s.kind === "create")).toBe(false);
    const withIt = planSeed({
      env: { ...confirmed, ...strong, SEED_CLIENT2_PASSWORD: "a-second-client-pass" },
      options: apply,
      existing: existingDemo,
    });
    expect(withIt.ok && withIt.steps.filter((s) => s.kind === "create").map((s) => s.account.email)).toEqual(["client2@clyntique.demo"]);
  });

  it("refuses production", () => {
    expect(planSeed({ env: { NODE_ENV: "production", DATABASE_URL: DB, ...strong }, options: dry, existing: [] }).ok).toBe(false);
  });

  it("reads only the database name from a connection string", () => {
    expect(databaseNameOf(DB)).toBe("clyntique_dev");
    expect(databaseNameOf("not a url")).toBeNull();
    expect(databaseNameOf(undefined)).toBeNull();
  });
});
