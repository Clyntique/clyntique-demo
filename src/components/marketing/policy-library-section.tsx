"use client";

import { BookOpenIcon, ShieldIcon, SparklesIcon, CheckCircleIcon } from "@/components/ui/icons";
import { ScrollReveal } from "@/components/ui/scroll-reveal";

export function PolicyLibrarySection() {
  return (
    <section
      id="policy-ai"
      aria-label="AI Policy Library and Grounded Review"
      className="relative w-full border-b border-line/60 bg-[#FAF9F7] py-20 sm:py-28 overflow-hidden"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16 items-center">
          {/* Left Column: Context & Guarantees */}
          <ScrollReveal animation="fade-up" className="lg:col-span-6 flex flex-col">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold-300 bg-gold-50 px-3.5 py-1 text-micro font-semibold uppercase tracking-wider text-gold-700 w-fit">
              <SparklesIcon className="size-3.5" />
              <span>Grounded Intelligence</span>
            </div>

            <h2 className="font-heading mt-4 text-balance text-3xl font-bold tracking-tight text-ink sm:text-4xl md:text-5xl leading-[1.18]">
              AI-assisted review, anchored in your Policy Library.
            </h2>

            <p className="text-body mt-4 text-ink-soft leading-relaxed">
              Clyntique assists internal TEAM reviewers by analyzing advertising copy and imagery against verified, approved policies stored directly in your platform&apos;s Policy Library.
            </p>

            <div className="mt-8 flex flex-col gap-4">
              <div className="flex items-start gap-3.5">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 mt-0.5">
                  <CheckCircleIcon className="size-4" />
                </div>
                <div>
                  <h3 className="text-small font-semibold text-ink">Grounded in Verified Guidelines</h3>
                  <p className="text-caption mt-0.5 text-muted leading-relaxed">
                    Evaluates against platform specifications (Meta, TikTok, Google) and territorial standards (US FTC, UAE, UK ASA).
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 mt-0.5">
                  <CheckCircleIcon className="size-4" />
                </div>
                <div>
                  <h3 className="text-small font-semibold text-ink">Traceable Policy Citations</h3>
                  <p className="text-caption mt-0.5 text-muted leading-relaxed">
                    Every finding cites exact clauses and recommended remediation steps, eliminating subjective guesswork.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 mt-0.5">
                  <CheckCircleIcon className="size-4" />
                </div>
                <div>
                  <h3 className="text-small font-semibold text-ink">Human-in-the-Loop Authority</h3>
                  <p className="text-caption mt-0.5 text-muted leading-relaxed">
                    AI flags serve as assistive pre-screening. Human reviewers verify every finding before publishing decisions to clients.
                  </p>
                </div>
              </div>
            </div>

            {/* Strict Regulatory Disclaimer Notice */}
            <div className="mt-8 rounded-xl border border-line bg-surface p-4 text-caption text-muted/90 leading-relaxed shadow-2xs">
              <span className="font-semibold text-ink-soft block mb-1">Notice on Compliance & Legal Scope</span>
              Clyntique provides AI-assisted review and workflow organization for human teams. It does not provide legal advice, automatic regulatory approval, or platform acceptance guarantees.
            </div>
          </ScrollReveal>

          {/* Right Column: Visual Policy Citation UI Card Mockup */}
          <ScrollReveal animation="fade-up" delayMs={150} className="lg:col-span-6">
            <div className="rounded-3xl border border-line bg-surface p-6 sm:p-8 shadow-card hover:shadow-card-hover transition-shadow">
              <div className="flex items-center justify-between border-b border-line pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-2xs">
                    <BookOpenIcon className="size-5" />
                  </div>
                  <div>
                    <span className="text-caption font-semibold text-ink">Policy Library Reference</span>
                    <span className="text-micro block text-muted">Active Rule Database · 0 Approved (Default Seed)</span>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-positive-line bg-positive-soft px-2.5 py-0.5 text-[11px] font-semibold text-positive-strong">
                  <ShieldIcon className="size-3" />
                  <span>Rule Verified</span>
                </span>
              </div>

              {/* Sample Policy Inspection Card */}
              <div className="mt-5 rounded-2xl border border-line/80 bg-subtle/50 p-5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-micro font-semibold text-brand-600">
                    RULE-META-HEALTH-04
                  </span>
                  <span className="text-micro font-medium text-muted">Meta Ads Policy · US</span>
                </div>
                <h4 className="text-small font-semibold text-ink mt-2">
                  Health Claims & Substantiation Standards
                </h4>
                <p className="text-caption mt-1.5 text-muted leading-relaxed">
                  Ads must not claim unrealistic health or wellness outcomes without verifiable supporting evidence attached to the submission.
                </p>

                {/* Finding Callout */}
                <div className="mt-4 rounded-xl border border-gold-300 bg-gold-50/70 p-3.5">
                  <div className="flex items-center gap-2 text-micro font-semibold text-gold-700">
                    <SparklesIcon className="size-3.5" />
                    <span>AI Pre-Screening Citation</span>
                  </div>
                  <p className="text-caption mt-1.5 text-ink-soft leading-relaxed">
                    &ldquo;Copy states &lsquo;100% Guaranteed Relief&rsquo; in frame 2. Recommended action: Attach clinical documentation or modify phrasing to &lsquo;Clinically tested formulation&rsquo;.&rdquo;
                  </p>
                </div>
              </div>

              {/* Human Reviewer Action Pill */}
              <div className="mt-5 flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-micro text-muted">
                  <span className="size-2 rounded-full bg-positive-solid animate-pulse" />
                  <span>Human reviewer verification required</span>
                </div>
                <span className="text-micro font-semibold text-brand-600">
                  Reviewer Workspace View →
                </span>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
