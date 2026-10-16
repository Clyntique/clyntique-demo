import "server-only";
import { prisma } from "@/lib/prisma";
import { createSession } from "./session";
import { DEMO_LOGIN_ACCOUNTS, demoLoginEnabled, isDemoAccountKey } from "./demo-config";

export { demoLoginEnabled } from "./demo-config";

export type DemoLoginResult = { ok: true } | { ok: false; error: string };

/**
 * Signs in as one of the three fixed demo accounts. Server-controlled: the
 * feature flag, the account email and its role are all checked here. The
 * session is marked as a demo session (no policy administration, ends when
 * the flag is switched off).
 */
export async function signInAsDemoAccount(key: unknown): Promise<DemoLoginResult> {
  if (!demoLoginEnabled()) return { ok: false, error: "Demo login is not available." };
  if (!isDemoAccountKey(key)) return { ok: false, error: "Choose a demo account." };
  const account = DEMO_LOGIN_ACCOUNTS[key];
  const user = await prisma.user.findFirst({
    where: { email: account.email, role: account.role },
    select: { id: true, role: true },
  });
  if (!user) return { ok: false, error: "This demo account isn't set up in this environment." };
  await createSession({ userId: user.id, role: user.role, demo: true });
  return { ok: true };
}
