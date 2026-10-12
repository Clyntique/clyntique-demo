import type { Metadata } from "next";
import { Brand } from "@/components/layout/brand";
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

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section aria-label="About Clyntique" className="hidden flex-col justify-between border-r border-line bg-stage px-12 py-12 lg:flex">
        <Brand size="lg" />
        <div className="flex max-w-md flex-col gap-8">
          <h2 className="text-display text-balance text-ink">Advertising compliance review, from submission to decision.</h2>
          <ol className="flex flex-col gap-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="text-record mt-0.5 text-faint">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="text-body font-medium text-ink">{s.title}</p>
                  <p className="text-small mt-0.5 text-ink-soft">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <p className="text-caption max-w-md text-muted">{REVIEW_DISCLAIMER}</p>
      </section>

      <div className="flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-[380px]">
          <Brand className="mb-8 lg:hidden" />
          <h1 className="text-page-title text-ink">Sign in</h1>
          <p className="text-body mt-1 mb-6 text-muted">Use the account your Clyntique contact set up for you.</p>
          <div className="rounded-lg border border-line bg-surface p-6">
            <LoginForm />
          </div>
          <p className="text-caption mt-6 text-muted lg:hidden">{REVIEW_DISCLAIMER}</p>
        </div>
      </div>
    </main>
  );
}
