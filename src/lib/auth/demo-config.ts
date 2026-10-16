import type { Role } from "@/generated/prisma/enums";

/*
 * Quick demo login: configuration only (no Node-only APIs, so proxy.ts can use
 * it too). The sign-in itself is the server action in demo-login.ts.
 *
 * Off unless DEMO_LOGIN=enabled, and always off on a Vercel Production
 * deployment (VERCEL_ENV=production), whatever DEMO_LOGIN says. To remove it
 * after the demo, unset DEMO_LOGIN: every existing demo session stops working
 * on its next request.
 *
 * The browser only ever sends one of the three keys below. Accounts are looked
 * up by email and role on the server; no password or secret reaches the page.
 */

export type DemoAccountKey = "team" | "client1" | "client2";

export const DEMO_LOGIN_ACCOUNTS: Record<DemoAccountKey, { label: string; email: string; role: Role }> = {
  team: { label: "Login as Team", email: "team@clyntique.demo", role: "TEAM" },
  client1: { label: "Login as Client 1", email: "client@clyntique.demo", role: "CLIENT" },
  client2: { label: "Login as Client 2", email: "client2@clyntique.demo", role: "CLIENT" },
};

export function demoLoginEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.VERCEL_ENV === "production") return false;
  return env.DEMO_LOGIN === "enabled";
}

export function isDemoAccountKey(value: unknown): value is DemoAccountKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(DEMO_LOGIN_ACCOUNTS, value);
}
