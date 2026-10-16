import { Suspense } from "react";
import type { Metadata } from "next";
import { Brand, BrandMark } from "@/components/layout/brand";
import { REVIEW_DISCLAIMER } from "@/lib/workflow/labels";
import { FileTextIcon, ShieldIcon, CheckCircleIcon } from "@/components/ui/icons";
import { LoginForm } from "./login-form";
import { AuthExtras } from "@/components/auth/auth-extras";

export const metadata: Metadata = { title: "Sign in · Clyntique" };

// 3 clear workflow steps matching the minimal enterprise design
const STEPS = [
  {
    icon: FileTextIcon,
    title: "Submit Creative Assets",
  },
  {
    icon: ShieldIcon,
    title: "AI & Human Review",
  },
  {
    icon: CheckCircleIcon,
    title: "Remediate & Resolve",
  },
];

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] bg-canvas">
      {/* Left Brand & Lifestyle Hero Panel (Desktop) */}
      <section
        aria-label="About Clyntique"
        className="relative hidden flex-col justify-between overflow-hidden border-r border-line/60 bg-cover bg-center px-10 py-12 lg:flex xl:px-14"
        style={{
          backgroundImage: "url('/images/login-desk-bg.jpg')",
          backgroundPosition: "right center",
          backgroundSize: "cover",
        }}
      >
        {/* Soft Left Gradient Overlay for crisp typography contrast */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white via-white/90 to-transparent lg:w-[65%]"
        />

        {/* Top: Brand Logo with Luxury Subtitle */}
        <div className="relative z-10 flex flex-col gap-1.5">
          <Brand size="lg" className="select-none" />
          <div className="pl-0.5 pt-1 text-[10px] font-semibold tracking-[0.22em] uppercase text-muted/90">
            <p>Premium Business Infrastructure</p>
            <p className="text-muted/70 text-[9px] tracking-[0.2em] mt-0.5">Operations · Concierge</p>
          </div>
        </div>

        {/* Center: Minimal Hero Heading & Steps */}
        <div className="relative z-10 flex flex-col gap-8 max-w-sm pt-4">
          <div className="flex flex-col gap-2.5">
            <span className="text-eyebrow font-semibold">Enterprise Advertising Compliance</span>
            <h1 className="text-brand-display text-balance text-ink font-heading leading-[1.38]">
              Internal review workflow, from initial submission to final decision.
            </h1>
          </div>

          <ol className="flex flex-col gap-3.5 pt-1">
            {STEPS.map((s, idx) => {
              const Icon = s.icon;
              return (
                <li key={idx} className="flex items-center gap-3.5">
                  <div className="size-10 rounded-full bg-[#FCEAE8] border border-[#F8D5D0] flex items-center justify-center text-[#1A2C48] shadow-2xs shrink-0">
                    <Icon className="size-5" />
                  </div>
                  <p className="text-body font-semibold text-ink">{s.title}</p>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Bottom Disclaimer */}
        <div className="relative z-10 pt-6 max-w-md">
          <p className="text-caption text-muted/90 leading-relaxed">{REVIEW_DISCLAIMER}</p>
        </div>
      </section>

      {/* Right Login Form Pane */}
      <div className="relative flex flex-col justify-between overflow-hidden bg-[#FAF9F7]">
        {/* Soft Corner Accent Waves */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full bg-gradient-to-br from-rose-100/40 via-amber-100/30 to-transparent blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -left-20 size-72 rounded-full bg-gradient-to-tr from-brand-100/30 via-slate-100/40 to-transparent blur-2xl"
        />

        {/* Mobile / Tablet Header Banner */}
        <div className="relative z-10 flex items-center justify-between border-b border-line bg-surface/90 backdrop-blur px-6 py-5 lg:hidden">
          <Brand size="md" className="select-none" />
          <span className="text-micro font-semibold uppercase tracking-wider text-muted">Workspace Auth</span>
        </div>

        {/* Center: Sign-In Container */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[440px]">
            {/* Script "Welcome Back" Header */}
            <div className="mb-6 text-center">
              <span className="font-script text-4xl text-brand-600 block leading-none">
                Welcome Back
              </span>
              <div className="mx-auto mt-2 h-0.5 w-12 rounded-full bg-gold-500" />
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink">
                Sign in to your workspace
              </h2>
              <p className="text-body mt-1.5 text-muted">
                Enter your credentials to access your workspace.
              </p>
            </div>

            {/* Form Card */}
            <div className="rounded-2xl border border-line bg-surface p-7 shadow-card sm:p-9">
              <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-subtle/70" />}>
                <LoginForm />
              </Suspense>
            </div>

            {/* Auth extras: signup link + demo logins (render only when enabled on the server) */}
            <AuthExtras />

            <p className="text-caption mt-6 text-center text-muted/80 lg:hidden leading-relaxed">
              {REVIEW_DISCLAIMER}
            </p>
          </div>
        </div>

        {/* Bottom Security & Trust Footer */}
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
