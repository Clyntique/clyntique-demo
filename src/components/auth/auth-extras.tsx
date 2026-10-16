import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { DEMO_LOGIN_ACCOUNTS, demoLoginEnabled, type DemoAccountKey } from "@/lib/auth/demo-config";
import { clientSignupEnabled } from "@/lib/auth/registration";
import { DemoLoginButtons } from "./demo-login-buttons";

/*
 * Server-rendered extras for the sign-in page. Renders nothing unless the
 * deployment turns the features on:
 * - CLIENT_SIGNUP=enabled: a link to /auth/signup.
 * - DEMO_LOGIN=enabled (never on Vercel Production): three quick demo logins.
 * The flags are read on the server for every request; nothing here can be
 * switched on from the browser.
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
  const signup = clientSignupEnabled();
  const demo = demoLoginEnabled();
  if (!signup && !demo) return null;

  const accounts = (Object.keys(DEMO_LOGIN_ACCOUNTS) as DemoAccountKey[]).map((key) => ({
    key,
    label: DEMO_LOGIN_ACCOUNTS[key].label,
  }));

  return (
    <div className="mt-5 flex flex-col gap-4">
      {signup && (
        <p className="text-center text-caption text-muted">
          New client?{" "}
          <Link href="/auth/signup" className="font-medium text-brand-700 hover:text-brand-900">
            Create a client account
          </Link>
        </p>
      )}
      {demo && (
        <section aria-label="Demo accounts" className="rounded-xl border border-dashed border-line-strong bg-surface/70 p-4">
          <p className="mb-2.5 text-micro font-semibold uppercase tracking-wider text-muted">Demo environment · sample data only</p>
          <DemoLoginButtons accounts={accounts} />
        </section>
      )}
    </div>
  );
}
