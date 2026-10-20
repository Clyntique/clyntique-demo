"use client";

import {
  AlertIcon,
  FolderIcon,
  LayersIcon,
  PaperclipIcon,
  ClipboardCheckIcon,
  AwardIcon,
  MessageIcon,
} from "@/components/ui/icons";
import { ScrollReveal } from "@/components/ui/scroll-reveal";

export function BeforeAfterSection() {
  return (
    <section
      id="how-it-works"
      aria-label="Workflow transformation"
      className="relative w-full border-b border-line/60 bg-white py-20 sm:py-28 overflow-hidden"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Editorial Section Header */}
        <ScrollReveal animation="fade-up" className="mb-16 text-center sm:mb-20">
          <div className="inline-flex items-center gap-3 text-caption font-semibold tracking-[0.22em] uppercase text-muted">
            <span className="h-px w-8 bg-line-strong" />
            <span>Workflow Transformation</span>
            <span className="h-px w-8 bg-line-strong" />
          </div>
          {/* Matches exact font and size of all other section titles on page */}
          <h2 className="font-heading mt-4 text-balance text-3xl font-bold tracking-tight text-ink sm:text-4xl md:text-5xl leading-[1.18]">
            From creative chaos to a <span className="text-gold-600">clear workflow</span>
          </h2>
          <p className="text-body mt-4 max-w-2xl mx-auto text-ink-soft text-balance">
            Stop losing hours in endless chat threads, mismatched files, and unverified claims.
            Transition to a single, accountable review pipeline.
          </p>
        </ScrollReveal>

        {/* Two-Column Comparison Grid */}
        <div className="relative grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-14 items-center">
          {/* Subtle Vertical Divider between columns on desktop */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-10 bottom-10 hidden -translate-x-1/2 border-l border-dashed border-line-strong/80 lg:block"
          />

          {/* LEFT: BEFORE (Creative Chaos - Clean background, floating disorganized items) */}
          <ScrollReveal animation="fade-up" delayMs={50} className="flex flex-col">
            {/* Column Label */}
            <div className="flex items-center gap-3 border-b border-line pb-3 mb-6">
              <span className="text-eyebrow font-bold uppercase tracking-widest text-critical-ink">
                BEFORE
              </span>
              <span className="text-micro text-muted">The typical review nightmare</span>
            </div>

            {/* Clean Box with Scattered Reality Elements */}
            <div className="relative rounded-3xl border border-line/80 bg-[#F7F8FA] px-4 py-6 sm:min-h-[480px] sm:p-8 overflow-hidden shadow-card">
              {/* Scattered Item 1: Message Feedback */}
              <div className="relative z-10 w-[90%] sm:w-auto sm:max-w-[310px] rounded-2xl border border-line bg-surface p-4 shadow-sm -rotate-2 hover:rotate-0 transition-transform animate-float-1">
                <div className="flex items-center gap-2 text-caption font-semibold text-critical-ink">
                  <MessageIcon className="size-4 text-critical-solid" />
                  <span>Slack / Email thread #42</span>
                </div>
                <p className="text-small mt-2 font-medium text-ink">
                  Feedback scattered across messages.
                </p>
                <p className="text-caption mt-1 text-muted">
                  &ldquo;Wait, did legal approve the revised claim on WhatsApp or Gmail?&rdquo;
                </p>
              </div>

              {/* Scattered Item 2: Version Confusion */}
              <div className="relative z-10 ml-auto w-[90%] sm:w-auto sm:max-w-[270px] rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-sm rotate-2 hover:rotate-0 transition-transform mt-5 sm:mt-3 animate-float-2">
                <div className="flex items-center gap-1.5 text-caption font-semibold text-amber-800">
                  <LayersIcon className="size-4 text-amber-700" />
                  <span>Conflicting Assets</span>
                </div>
                <p className="text-small mt-2 font-medium text-ink">
                  Multiple creative versions.
                </p>
                <div className="mt-2 text-[11px] font-mono text-muted bg-white/80 rounded px-2 py-1 border border-amber-200">
                  ad_v2_final_REVISED_new.mp4
                </div>
              </div>

              {/* Scattered Item 3: Missing Evidence */}
              <div className="relative z-10 w-[90%] sm:w-auto sm:max-w-[300px] rounded-2xl border border-critical-line bg-critical-soft/50 p-4 shadow-sm -rotate-2 hover:rotate-0 transition-transform mt-5 sm:mt-3 animate-float-3">
                <div className="flex items-center gap-1.5 text-caption font-semibold text-critical-strong">
                  <AlertIcon className="size-4 text-critical-solid" />
                  <span>Unsubstantiated Claim</span>
                </div>
                <p className="text-small mt-2 font-medium text-ink">
                  Missing supporting evidence.
                </p>
                <p className="text-caption mt-1 text-muted">
                  No source doc attached for &ldquo;Top Rated in 2026&rdquo;.
                </p>
              </div>

              {/* Scattered Item 4: Unclear Approval Status */}
              <div className="relative z-10 ml-auto w-[90%] sm:w-auto sm:max-w-[280px] rounded-2xl border border-line bg-surface p-4 shadow-sm rotate-1 hover:rotate-0 transition-transform mt-5 sm:mt-3 animate-float-1">
                <div className="flex items-center justify-between text-caption font-semibold text-muted">
                  <span>Sign-Off Status</span>
                  <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-ink-soft">UNKNOWN</span>
                </div>
                <p className="text-small mt-2 font-medium text-ink">
                  Unclear approval status.
                </p>
                <p className="text-caption mt-1 text-muted">
                  Nobody knows whether the campaign is greenlit to launch.
                </p>
              </div>

              {/* Scattered Item 5: Repeated Back-and-Forth */}
              <div className="relative z-10 w-[90%] sm:w-auto sm:max-w-[290px] rounded-2xl border border-line bg-surface p-3.5 shadow-sm -rotate-1 hover:rotate-0 transition-transform mt-5 sm:mt-3 animate-float-2">
                <p className="text-small font-medium text-ink">
                  Repeated back-and-forth.
                </p>
                <p className="text-caption mt-0.5 text-muted">
                  Days spent clarifying basic feedback and asking for re-uploads.
                </p>
              </div>
            </div>
          </ScrollReveal>

          {/* RIGHT: AFTER (Clear Clyntique Workflow) */}
          <ScrollReveal animation="fade-up" delayMs={150} className="flex flex-col">
            {/* Column Label */}
            <div className="flex items-center gap-3 border-b border-line pb-3 mb-6">
              <span className="text-eyebrow font-bold uppercase tracking-widest text-brand-600">
                AFTER
              </span>
              <span className="text-micro text-muted">The unified Clyntique system</span>
            </div>

            {/* Structured Connected Stacked Cards */}
            <div className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-3 sm:p-8 shadow-card">
              {/* Card 1 */}
              <div className="flex items-start gap-3 sm:gap-4 rounded-2xl border border-line/70 bg-white p-3.5 sm:p-4 shadow-2xs hover:border-brand-600/50 hover:shadow-sm transition-all duration-200">
                <div className="flex size-9 sm:size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 border border-brand-100 text-brand-600">
                  <FolderIcon className="size-5.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-body font-semibold text-ink">One organized workspace</h3>
                    <span className="mt-0.5 shrink-0 whitespace-nowrap text-[10px] font-semibold text-brand-600 uppercase tracking-wider bg-brand-50 px-2 py-0.5 rounded-full">
                      Step 1
                    </span>
                  </div>
                  <p className="text-small mt-1 text-muted leading-relaxed">
                    Single source of truth uniting review team and clients under defined project roles.
                  </p>
                </div>
              </div>

              {/* Down connector */}
              <div className="flex justify-center -my-1 text-muted">
                <span className="h-4 w-px bg-line-strong" />
              </div>

              {/* Card 2 */}
              <div className="flex items-start gap-3 sm:gap-4 rounded-2xl border border-line/70 bg-white p-3.5 sm:p-4 shadow-2xs hover:border-brand-600/50 hover:shadow-sm transition-all duration-200">
                <div className="flex size-9 sm:size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 border border-brand-100 text-brand-600">
                  <LayersIcon className="size-5.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-body font-semibold text-ink">Centralized submissions</h3>
                    <span className="mt-0.5 shrink-0 whitespace-nowrap text-[10px] font-semibold text-brand-600 uppercase tracking-wider bg-brand-50 px-2 py-0.5 rounded-full">
                      Step 2
                    </span>
                  </div>
                  <p className="text-small mt-1 text-muted leading-relaxed">
                    Client uploads creatives with target platforms (Meta, TikTok, Google) and version lineage.
                  </p>
                </div>
              </div>

              {/* Down connector */}
              <div className="flex justify-center -my-1 text-muted">
                <span className="h-4 w-px bg-line-strong" />
              </div>

              {/* Card 3 */}
              <div className="flex items-start gap-3 sm:gap-4 rounded-2xl border border-line/70 bg-white p-3.5 sm:p-4 shadow-2xs hover:border-brand-600/50 hover:shadow-sm transition-all duration-200">
                <div className="flex size-9 sm:size-11 shrink-0 items-center justify-center rounded-xl bg-gold-50 border border-gold-200 text-gold-700">
                  <PaperclipIcon className="size-5.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-body font-semibold text-ink">Evidence attached to creatives</h3>
                    <span className="mt-0.5 shrink-0 whitespace-nowrap text-[10px] font-semibold text-gold-700 uppercase tracking-wider bg-gold-100/70 px-2 py-0.5 rounded-full">
                      Step 3
                    </span>
                  </div>
                  <p className="text-small mt-1 text-muted leading-relaxed">
                    Supporting studies, disclaimers, and competitor benchmarks stay permanently bound to assets.
                  </p>
                </div>
              </div>

              {/* Down connector */}
              <div className="flex justify-center -my-1 text-muted">
                <span className="h-4 w-px bg-line-strong" />
              </div>

              {/* Card 4 */}
              <div className="flex items-start gap-3 sm:gap-4 rounded-2xl border border-line/70 bg-white p-3.5 sm:p-4 shadow-2xs hover:border-brand-600/50 hover:shadow-sm transition-all duration-200">
                <div className="flex size-9 sm:size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 border border-brand-100 text-brand-600">
                  <ClipboardCheckIcon className="size-5.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-body font-semibold text-ink">Clear review and revision stages</h3>
                    <span className="mt-0.5 shrink-0 whitespace-nowrap text-[10px] font-semibold text-brand-600 uppercase tracking-wider bg-brand-50 px-2 py-0.5 rounded-full">
                      Step 4
                    </span>
                  </div>
                  <p className="text-small mt-1 text-muted leading-relaxed">
                    Granular findings, severity ratings, and remediation notes replace ambiguous comments.
                  </p>
                </div>
              </div>

              {/* Down connector */}
              <div className="flex justify-center -my-1 text-muted">
                <span className="h-4 w-px bg-line-strong" />
              </div>

              {/* Card 5 */}
              <div className="flex items-start gap-3 sm:gap-4 rounded-2xl border border-positive-line bg-positive-soft/40 p-3.5 sm:p-4 shadow-2xs hover:border-positive-strong/60 transition-all duration-200">
                <div className="flex size-9 sm:size-11 shrink-0 items-center justify-center rounded-xl bg-positive-soft border border-positive-line text-positive-strong">
                  <AwardIcon className="size-5.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-body font-semibold text-positive-ink">Traceable approvals and progress</h3>
                    <span className="mt-0.5 shrink-0 whitespace-nowrap text-[10px] font-semibold text-positive-strong uppercase tracking-wider bg-positive-soft px-2 py-0.5 rounded-full border border-positive-line">
                      Resolved
                    </span>
                  </div>
                  <p className="text-small mt-1 text-ink-soft leading-relaxed">
                    Complete audit trail with timestamped reviewer sign-offs and full decision history.
                  </p>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
