import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Brand } from "@/components/layout/brand";
import { SignupForm } from "@/components/auth/signup-form";
import { clientSignupEnabled } from "@/lib/auth/registration";

export const metadata: Metadata = { title: "Create account · Clyntique" };

/*
 * Functional client sign-up page. Layout is deliberately plain: the visual
 * design of this page belongs to the UI workstream, which can restyle it and
 * keep <SignupForm /> (or bind its own form to the `signup` action).
 */
export default function SignupPage() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center bg-canvas px-5 py-10">
      <div className="w-full max-w-[430px]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Brand size="md" className="select-none" />
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Create a client account</h1>
          <p className="text-body text-muted">For advertisers submitting creatives to Clyntique for review.</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-7 shadow-card sm:p-9">
          <Suspense fallback={null}>
            <SignupGate />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

async function SignupGate() {
  // Read the flag per request, not at build time.
  await connection();
  if (clientSignupEnabled()) return <SignupForm />;
  return (
    <div className="flex flex-col gap-4 text-center">
      <p className="text-small text-ink">Self-registration isn&apos;t open. Contact your Clyntique administrator for access.</p>
      <Link href="/auth/login" className="text-small font-medium text-brand-700 hover:text-brand-900">
        Back to sign in
      </Link>
    </div>
  );
}
