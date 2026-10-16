import Link from "next/link";
import { ArrowRightIcon, CheckCircleIcon, ShieldIcon, SparklesIcon } from "@/components/ui/icons";

export function HeroSection() {
  return (
    <section
      aria-label="Creative work hero"
      className="relative flex min-h-[85vh] sm:min-h-[90vh] w-full items-center justify-center overflow-hidden bg-[#0A111E]"
      style={{
        backgroundImage: "url('/images/hero-bg.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center 30%",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Cinematic Navy Gradient Overlay for optimal text contrast & atmospheric depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0A111E]/75 via-[#1A2C48]/55 to-[#0F172A]/90 backdrop-blur-[0.5px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1A2C48]/30 via-transparent to-black/40"
      />

      {/* Content Container */}
      <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-4 py-20 text-center sm:px-6 md:py-28 lg:px-8">
        {/* Eyebrow Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-gold-300/40 bg-[#1A2C48]/80 px-4 py-1.5 shadow-sm backdrop-blur-md">
          <SparklesIcon className="size-3.5 text-gold-300" />
          <span className="text-[11px] font-semibold tracking-[0.2em] uppercase text-gold-200">
            Creative Collaboration & Review
          </span>
        </div>

        {/* Primary Headline in Bayer TypeArchiType */}
        <h1 className="font-heading mt-6 text-balance text-4xl font-bold tracking-tight text-white drop-shadow-sm sm:text-5xl md:text-6xl lg:text-7xl leading-[1.18] sm:leading-[1.15]">
          Creative work, without the back-and-forth.
        </h1>

        {/* Supporting Copy in Poppins */}
        <p className="mt-6 max-w-2xl text-balance text-base font-normal leading-relaxed text-slate-100 sm:text-lg md:text-xl drop-shadow">
          Bring creative submissions, feedback, evidence, revisions, and approvals into one shared workspace.
        </p>

        {/* Action Buttons */}
        <div className="mt-9 flex flex-col items-center justify-center gap-3.5 sm:flex-row sm:gap-4 w-full sm:w-auto">
          <Link
            href="/auth/login?mode=signup"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl bg-gold-500 px-7 py-3.5 text-base font-semibold text-brand-900 shadow-md hover:bg-gold-600 hover:shadow-lg active:bg-gold-700 transition-all duration-200 cursor-pointer"
          >
            <span>Get Started</span>
            <ArrowRightIcon className="size-4.5" />
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3.5 text-base font-medium text-white backdrop-blur-md hover:bg-white/20 active:bg-white/30 transition-all duration-200 cursor-pointer"
          >
            <span>See How It Works</span>
          </a>
        </div>

        {/* Value Highlights Pill Row */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-y-2 gap-x-6 text-caption text-slate-200/90">
          <div className="inline-flex items-center gap-1.5">
            <CheckCircleIcon className="size-4 text-gold-400" />
            <span>Centralized Version Lineage</span>
          </div>
          <div className="hidden sm:inline-block text-white/30">·</div>
          <div className="inline-flex items-center gap-1.5">
            <ShieldIcon className="size-4 text-gold-400" />
            <span>Policy-Grounded Pre-Screening</span>
          </div>
          <div className="hidden sm:inline-block text-white/30">·</div>
          <div className="inline-flex items-center gap-1.5">
            <CheckCircleIcon className="size-4 text-gold-400" />
            <span>Clear Decision Accountability</span>
          </div>
        </div>
      </div>
    </section>
  );
}
