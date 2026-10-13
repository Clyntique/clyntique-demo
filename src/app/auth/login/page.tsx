import type { Metadata } from "next";
import { BrandLogo } from "@/components/layout/brand";
import { REVIEW_DISCLAIMER } from "@/lib/workflow/labels";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · Clyntique" };

// What the product does, in the order a client meets it. Descriptive only:
// no metrics or claims the app can't back up.
const STEPS = [
  { title: "Submit", text: "Upload the ad and choose the markets and platforms it will run on." },
  { title: "Review", text: "A Clyntique reviewer checks it and records each finding with what's needed." },
  { title: "Resolve", text: "Respond, add evidence or a revised version, and resubmit until the review is complete." },
];

/*
 * Approved visual direction (13 Oct 2026): a cream brand panel with the
 * official logo beside the form on wide screens; below 1024 px a slim cream
 * band with the logo sits above the form. The logo always stays on a light
 * surface.
 */
export default function LoginPage() {
  return (
    <main className="grid min-h-dvh flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section
        aria-label="About Clyntique"
        className="relative hidden flex-col justify-between gap-12 overflow-hidden border-r border-line bg-cream px-14 py-14 lg:flex xl:px-16"
      >
        <GlobeLines className="pointer-events-none absolute -right-52 -bottom-60 size-[560px] opacity-35 xl:-right-44 xl:-bottom-52 xl:size-[620px]" />
        <BrandLogo width={200} className="relative" />
        <div className="relative flex max-w-md flex-col gap-7">
          <h2 className="text-display text-balance text-ink">Advertising compliance review, from submission to decision.</h2>
          <ol className="flex flex-col gap-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3">
                <span className="text-record pt-0.5 text-gold-700">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="text-body font-semibold text-ink">{s.title}</p>
                  <p className="text-small mt-0.5 text-ink-soft">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-caption relative max-w-md text-muted">{REVIEW_DISCLAIMER}</p>
      </section>

      <div className="flex flex-col">
        {/* Phones and tablets: the brand panel becomes a slim band above the form. */}
        <div className="relative overflow-hidden border-b border-line bg-cream px-6 py-6 sm:px-10 lg:hidden">
          <GlobeLines className="pointer-events-none absolute -top-24 -right-24 size-64 opacity-45" />
          <BrandLogo width={112} className="relative" />
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-6 sm:py-14">
          <div className="w-full max-w-[400px]">
            <h1 className="text-page-title text-ink">Sign in</h1>
            <p className="text-body mt-1.5 mb-6 text-muted">Use the account your Clyntique contact set up for you.</p>
            <div className="rounded-xl border border-line bg-surface p-6 shadow-card sm:p-7">
              <LoginForm />
            </div>
            <p className="text-caption mt-6 text-muted lg:hidden">{REVIEW_DISCLAIMER}</p>
          </div>
        </div>
      </div>
    </main>
  );
}

// Thin meridians and parallels, taken from the globe grid behind the logo's mark. Decorative.
function GlobeLines({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 600 600" fill="none" className={className}>
      <g className="stroke-gold-500" strokeWidth="1">
        <circle cx="300" cy="300" r="290" />
        <ellipse cx="300" cy="300" rx="200" ry="290" />
        <ellipse cx="300" cy="300" rx="105" ry="290" />
        <path d="M300 10v580M10 300h580" />
        <path d="M40 160q260-40 520 0M40 440q260 40 520 0" />
      </g>
    </svg>
  );
}
