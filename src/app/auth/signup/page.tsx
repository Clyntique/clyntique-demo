import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { Brand, BrandMark } from "@/components/layout/brand";
import { REVIEW_DISCLAIMER } from "@/lib/workflow/labels";
import { SignupForm } from "@/components/auth/signup-form";
import { clientSignupEnabled } from "@/lib/auth/registration";

export const metadata: Metadata = { title: "Create account · Clyntique" };

export default function SignupPage() {
  return (
    <main className="grid min-h-dvh flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] bg-canvas">
      {/* Left Brand Hero Panel (Desktop) */}
      <section
        aria-label="About Clyntique"
        className="relative hidden flex-col justify-between overflow-hidden border-r border-line/60 bg-cover bg-center px-10 py-12 lg:flex xl:px-14"
        style={{
          backgroundImage: "url('/images/login-desk-bg.jpg')",
          backgroundPosition: "right center",
          backgroundSize: "cover",
        }}
      >
        {/* Soft Left Gradient Overlay */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white via-white/90 to-transparent lg:w-[65%]"
        />

        {/* Top: Brand Logo */}
        <div className="relative z-10 flex flex-col gap-1.5">
          <Brand size="lg" className="select-none" />
          <div className="pl-0.5 pt-1 text-[10px] font-semibold tracking-[0.22em] uppercase text-muted/90">
            <p>Client Workspace</p>
            <p className="text-muted/70 text-[9px] tracking-[0.2em] mt-0.5">Creative Review · Approvals</p>
          </div>
        </div>

        {/* Center: Heading */}
        <div className="relative z-10 flex flex-col gap-8 max-w-sm pt-4">
          <div className="flex flex-col gap-2.5">
            <span className="text-eyebrow font-semibold">Get Started</span>
            <h1 className="text-brand-display text-balance text-ink font-heading leading-[1.38]">
              Submit creatives, attach evidence, and track approvals in one workspace.
            </h1>
          </div>
        </div>

        {/* Bottom Disclaimer */}
        <div className="relative z-10 pt-6 max-w-md">
          <p className="text-caption text-muted/90 leading-relaxed">{REVIEW_DISCLAIMER}</p>
        </div>
      </section>

      {/* Right Signup Form Pane */}
      <div className="relative flex flex-col justify-between overflow-hidden bg-[#FAF9F7]">
        {/* Soft Corner Accent */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-gradient-to-br from-rose-100/40 via-amber-100/30 to-transparent blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -left-20 size-72 rounded-full bg-gradient-to-tr from-brand-100/30 via-slate-100/40 to-transparent blur-2xl"
        />

        {/* Mobile Header */}
        <div className="relative z-10 flex items-center justify-between border-b border-line bg-surface/90 backdrop-blur px-6 py-5 lg:hidden">
          <Brand size="md" className="select-none" />
          <span className="text-micro font-semibold uppercase tracking-wider text-muted">New Account</span>
        </div>

        {/* Center: Signup Container */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[440px]">
            {/* Header */}
            <div className="mb-6 text-center">
              <span className="font-script text-4xl text-brand-600 block leading-none">
                Get Started
              </span>
              <div className="mx-auto mt-2 h-0.5 w-12 rounded-full bg-gold-500" />
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
                Create a client account
              </h2>
              <p className="text-body mt-1.5 text-muted">
                For advertisers submitting creatives for review.
              </p>
            </div>

            {/* Form Card */}
            <div className="rounded-2xl border border-line bg-surface p-7 shadow-card sm:p-9">
              <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-subtle/70" />}>
                <SignupGate />
              </Suspense>
            </div>

            <p className="text-caption mt-6 text-center text-muted/80 lg:hidden leading-relaxed">
              {REVIEW_DISCLAIMER}
            </p>
          </div>
        </div>

        {/* Bottom Security Footer */}
        <footer className="relative z-10 border-t border-line/60 py-4 text-center">
          <div className="inline-flex items-center gap-2 text-caption text-muted/80">
            <BrandMark width={18} />
            <span className="font-semibold tracking-wider text-ink-soft text-micro uppercase">Clyntique</span>
            <span className="text-faint">|</span>
            <span>Security</span>
            <span className="text-faint">·</span>
            <span>Compliance</span>
            <span className="text-faint">·</span>
            <span>Trust</span>
          </div>
        </footer>
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
      <p className="text-small text-ink">
        Self-registration isn&apos;t open. Contact your Clyntique administrator for access.
      </p>
      <Link href="/auth/login" className="text-small font-medium text-brand-700 hover:text-brand-900">
        Back to sign in
      </Link>
    </div>
  );
}
