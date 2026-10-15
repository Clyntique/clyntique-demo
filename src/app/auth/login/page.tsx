import type { Metadata } from "next";
import { BrandLogo } from "@/components/layout/brand";
import { REVIEW_DISCLAIMER } from "@/lib/workflow/labels";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Clyntique" };

// What the product does, in the order a client meets it. Descriptive only:
// internal workflow terminology, no claims the app cannot back up.
const STEPS = [
  {
    number: "01",
    title: "Submit Creative Assets",
    text: "Upload advertising files and specify target platforms (Meta, TikTok, Google) and jurisdictions (US, UAE).",
  },
  {
    number: "02",
    title: "AI & Human Review",
    text: "Grounded policy pre-screening paired with human reviewer findings, severity ratings, and exact remediation notes.",
  },
  {
    number: "03",
    title: "Remediate & Resolve",
    text: "Provide client responses, attach substantiating evidence or revised version files, and resubmit until review completes.",
  },
];

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] bg-canvas">
      {/* Left Brand Panel (Desktop) */}
      <section
        aria-label="About Clyntique"
        className="relative hidden flex-col justify-between border-r border-line bg-surface px-12 py-14 lg:flex xl:px-16"
      >
        <div className="flex flex-col gap-8">
          <BrandLogo width={180} className="select-none" />

          <div className="max-w-md flex flex-col gap-3 pt-4">
            <span className="text-eyebrow">Enterprise Advertising Compliance</span>
            <h2 className="text-brand-display text-balance text-ink">
              Internal review workflow, from initial submission to final decision.
            </h2>
            <p className="text-body text-ink-soft leading-relaxed">
              A single authoritative platform for advertising review, policy grounding, version tracking, and client remediation.
            </p>
          </div>

          <ol className="flex flex-col gap-5 pt-4 max-w-md">
            {STEPS.map((s) => (
              <li key={s.number} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3.5 items-start">
                <span className="text-record pt-0.5 font-semibold text-gold-700 bg-gold-50 size-8 rounded-lg flex items-center justify-center border border-gold-200">
                  {s.number}
                </span>
                <div>
                  <p className="text-body font-semibold text-ink">{s.title}</p>
                  <p className="text-small mt-0.5 text-muted leading-relaxed">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="pt-8 border-t border-line/60 max-w-md">
          <p className="text-caption text-muted leading-relaxed">{REVIEW_DISCLAIMER}</p>
        </div>
      </section>

      {/* Right Login Form Pane */}
      <div className="flex flex-col justify-center">
        {/* Mobile / Tablet Header Banner */}
        <div className="flex items-center justify-between border-b border-line bg-surface px-6 py-5 lg:hidden">
          <BrandLogo width={128} className="select-none" />
          <span className="text-micro font-semibold uppercase tracking-wider text-muted">Sign In</span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-5 py-12 sm:px-8">
          <div className="w-full max-w-[420px]">
            <div className="mb-6">
              <h1 className="text-brand-title text-ink">Sign in to your workspace</h1>
              <p className="text-body mt-2 text-muted leading-relaxed">
                Enter the credentials for your authorized Clyntique account.
              </p>
            </div>

            <div className="rounded-xl border border-line bg-surface p-6 shadow-card sm:p-8">
              <LoginForm />
            </div>

            <div className="mt-6 text-center">
              <p className="text-caption text-muted">
                Need access? Contact your Clyntique compliance administrator.
              </p>
              <p className="text-caption mt-4 text-muted/80 lg:hidden leading-relaxed">
                {REVIEW_DISCLAIMER}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
