import { Suspense } from "react";
import { connection } from "next/server";
import { DEMO_LOGIN_ACCOUNTS, demoLoginEnabled, type DemoAccountKey } from "@/lib/auth/demo-config";
import { DemoLoginButtons } from "./demo-login-buttons";

/*
 * Server-rendered extras for the sign-in page. Renders nothing unless
 * DEMO_LOGIN=enabled (never on Vercel Production): three quick demo logins.
 * The flag is read on the server for every request; nothing here can be
 * switched on from the browser.
 *
 * The "Create a client account" link is not rendered here: the sign-in page
 * itself shows it (tab switcher and direct link), and /auth/signup checks
 * CLIENT_SIGNUP on the server before showing the form.
 */
export function AuthExtras() {
  return (
    <Suspense fallback={null}>
      <AuthExtrasAtRequestTime />
    </Suspense>
  );
}

async function AuthExtrasAtRequestTime() {
  // Read the flags per request, not at build time.
  await connection();
  if (!demoLoginEnabled()) return null;

  const accounts = (Object.keys(DEMO_LOGIN_ACCOUNTS) as DemoAccountKey[]).map((key) => ({
    key,
    label: DEMO_LOGIN_ACCOUNTS[key].label,
  }));

  return (
    <div className="mt-5 flex flex-col gap-4">
      <section aria-label="Demo accounts" className="rounded-xl border border-dashed border-line-strong bg-surface/70 p-4">
        <p className="mb-2.5 text-micro font-semibold uppercase tracking-wider text-muted">Demo environment · sample data only</p>
        <DemoLoginButtons accounts={accounts} />
      </section>
    </div>
  );
}
