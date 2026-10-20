import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { describe as describePlan, parseArgs, planClientAccount, type AccountOptions } from "../prisma/client-account-plan";

// Fictional connection string; nothing here connects anywhere.
const DB = "postgresql://user:secret@db.example.invalid:5432/cyntique_demo";
const PASSWORD = "Reviewer-pass-2026";
const account = { ACCOUNT_NAME: "YC Reviewer", ACCOUNT_EMAIL: "  YC-Reviewer@Example.com ", ACCOUNT_PASSWORD: PASSWORD };
const dry: AccountOptions = { apply: false };
const apply: AccountOptions = { apply: true };
const confirmed = { DATABASE_URL: DB, ACCOUNT_CONFIRM_DATABASE: "cyntique_demo", ...account };

function errorsOf(plan: ReturnType<typeof planClientAccount>) {
  return plan.ok ? [] : plan.errors;
}

describe("create-client-account safety", () => {
  it("is a dry run by default and never writes", () => {
    const plan = planClientAccount({ env: { DATABASE_URL: DB, ...account }, options: dry, existing: null });
    expect(plan).toMatchObject({ ok: true, writes: false, database: "cyntique_demo" });
    expect(parseArgs([])).toEqual({ apply: false });
    expect(parseArgs(["--apply"])).toEqual({ apply: true });
  });

  it("refuses to write without the database confirmation", () => {
    const plan = planClientAccount({ env: { DATABASE_URL: DB, ...account }, options: apply, existing: null });
    expect(plan.ok).toBe(false);
    expect(errorsOf(plan).join(" ")).toMatch(/ACCOUNT_CONFIRM_DATABASE/);
  });

  it("refuses to write when the confirmation names another database", () => {
    const env = { ...confirmed, ACCOUNT_CONFIRM_DATABASE: "clyntique_demo_preview" };
    expect(planClientAccount({ env, options: apply, existing: null }).ok).toBe(false);
  });

  it("writes only with --apply and a matching confirmation", () => {
    expect(planClientAccount({ env: confirmed, options: apply, existing: null })).toMatchObject({ ok: true, writes: true });
  });

  it("always creates a CLIENT, whatever the environment says", () => {
    const env = { ...confirmed, ACCOUNT_ROLE: "TEAM", ROLE: "TEAM", ACCOUNT_POLICY_ADMIN: "true" };
    const plan = planClientAccount({ env, options: apply, existing: null });
    expect(plan.ok && plan.account.role).toBe("CLIENT");
    expect(plan.ok && Object.keys(plan.account).sort()).toEqual(["email", "name", "password", "role"]);
  });

  it("normalizes the email and name", () => {
    const plan = planClientAccount({ env: { ...confirmed, ACCOUNT_NAME: "  YC   Reviewer " }, options: apply, existing: null });
    expect(plan.ok && plan.account.email).toBe("yc-reviewer@example.com");
    expect(plan.ok && plan.account.name).toBe("YC Reviewer");
  });

  it("never touches an existing account, CLIENT or TEAM", () => {
    for (const role of ["CLIENT", "TEAM"] as const) {
      const plan = planClientAccount({ env: confirmed, options: apply, existing: { role } });
      expect(plan.ok).toBe(false);
      expect(errorsOf(plan).join(" ")).toMatch(/already exists/);
    }
  });

  it("refuses Clyntique's own email domains", () => {
    for (const email of ["yc@clyntique.demo", "yc@clyntique.com", "x@staff.clyntique.internal"]) {
      expect(planClientAccount({ env: { ...confirmed, ACCOUNT_EMAIL: email }, options: apply, existing: null }).ok).toBe(false);
    }
  });

  it("requires name, valid email and a strong password", () => {
    expect(planClientAccount({ env: { ...confirmed, ACCOUNT_NAME: "" }, options: dry, existing: null }).ok).toBe(false);
    expect(planClientAccount({ env: { ...confirmed, ACCOUNT_EMAIL: "not-an-email" }, options: dry, existing: null }).ok).toBe(false);
    for (const weak of ["", "short1", "onlyletterslong", "password1234", "yc-reviewer-2026x"]) {
      expect(planClientAccount({ env: { ...confirmed, ACCOUNT_PASSWORD: weak }, options: dry, existing: null }).ok).toBe(false);
    }
  });

  it("refuses previously published passwords", () => {
    const blocked = new Set([createHash("sha256").update(PASSWORD).digest("hex")]);
    const plan = planClientAccount({ env: confirmed, options: apply, existing: null, blockedPasswordHashes: blocked });
    expect(plan.ok).toBe(false);
  });

  it("requires a database name", () => {
    expect(planClientAccount({ env: { ...account }, options: dry, existing: null }).ok).toBe(false);
    expect(planClientAccount({ env: { ...account, DATABASE_URL: "postgresql://h:5432/" }, options: dry, existing: null }).ok).toBe(false);
  });

  it("never puts the password or the connection string in its output", () => {
    const plan = planClientAccount({ env: confirmed, options: apply, existing: null });
    const line = plan.ok ? describePlan(plan) : "";
    expect(line).toMatch(/create CLIENT yc-reviewer@example.com/);
    expect(line).toMatch(/policy administrator: no/);
    expect(line).not.toContain(PASSWORD);
    expect(line).not.toContain("secret");
    const failed = planClientAccount({ env: { ...confirmed, ACCOUNT_PASSWORD: "Weak1" }, options: apply, existing: { role: "CLIENT" } });
    for (const e of errorsOf(failed)) {
      expect(e).not.toContain("Weak1");
      expect(e).not.toContain("secret");
    }
  });
});
