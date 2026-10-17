"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/icons";
import { ScrollReveal } from "@/components/ui/scroll-reveal";

export function FinalCTASection() {
  return (
    <section
      aria-label="Get started call to action"
      className="relative w-full border-b border-line/60 bg-[#1A2C48] py-20 sm:py-28 overflow-hidden text-white"
    >
      {/* Decorative Brand Accent Gradients with Subtle Animation */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-gold-500/15 blur-3xl animate-pulse"
        style={{ animationDuration: "6s" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -bottom-24 size-96 rounded-full bg-brand-400/15 blur-3xl animate-pulse"
        style={{ animationDuration: "8s" }}
      />

      <div className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <ScrollReveal animation="fade-up">
          <h2 className="font-heading text-balance text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl leading-[1.18]">
            Ready to make creative collaboration simpler?
          </h2>

          <p className="mt-5 text-balance text-base text-slate-200 sm:text-lg md:text-xl max-w-2xl mx-auto leading-relaxed">
            Bring creative submissions, feedback, evidence, revisions, and approvals into one shared workspace.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3.5 sm:flex-row sm:gap-4">
            <Link
              href="/auth/login?mode=signup"
              className="group inline-flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl bg-gold-500 px-8 py-3.5 text-base font-semibold text-brand-900 shadow-md hover:bg-gold-600 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 active:bg-gold-700 transition-all duration-200 cursor-pointer"
            >
              <span>Get Started</span>
              <ArrowRightIcon className="size-4.5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-7 py-3.5 text-base font-medium text-white backdrop-blur-md hover:bg-white/20 hover:border-white/50 hover:-translate-y-0.5 active:translate-y-0 active:bg-white/30 transition-all duration-200 cursor-pointer"
            >
              <span>Sign In to Workspace</span>
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
