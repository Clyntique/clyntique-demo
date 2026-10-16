import {
  FolderIcon,
  LayersIcon,
  PaperclipIcon,
  ClipboardCheckIcon,
  AwardIcon,
} from "@/components/ui/icons";

export function BeforeAfterSection() {
  return (
    <section
      id="how-it-works"
      aria-label="Workflow transformation"
      className="relative w-full border-b border-line/60 bg-[#FAF9F9] py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Editorial Section Header */}
        <div className="mb-16 text-center sm:mb-20">
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
        </div>

        {/* Two-Column Comparison Grid */}
        <div className="relative grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-14 items-center">
          {/* Subtle Vertical Divider between columns on desktop */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-10 bottom-10 hidden -translate-x-1/2 border-l border-dashed border-line-strong/80 lg:block"
          />

          {/* LEFT: BEFORE (Creative Chaos with Confusing Loop Image) */}
          <div className="flex flex-col">
            {/* Column Label */}
            <div className="flex items-center gap-3 border-b border-line pb-3 mb-6">
              <span className="text-eyebrow font-bold uppercase tracking-widest text-critical-ink">
                BEFORE
              </span>
              <span className="text-micro text-muted">The typical review nightmare</span>
            </div>

            {/* Confusing Loop Illustration Container */}
            <div className="relative flex flex-col items-center justify-center rounded-3xl border border-line/80 bg-gradient-to-br from-white via-slate-50 to-amber-50/20 p-6 sm:p-8 shadow-card min-h-[480px]">
              <div className="relative w-full max-w-[340px] sm:max-w-[380px] aspect-square rounded-2xl overflow-hidden border border-line/80 shadow-xs bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/confusing-loop.jpg"
                  alt="Endless confusing review loop with conflicting feedback and chaotic revision cycles"
                  className="w-full h-full object-contain rounded-xl"
                />
              </div>

              <div className="mt-5 text-center max-w-sm">
                <p className="text-small font-semibold text-ink">The Endless Revision Loop</p>
                <p className="text-caption mt-1.5 text-muted leading-relaxed">
                  Feedback scattered across messages, conflicting file versions, missing substantiation, and repeated back-and-forth cycles.
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT: AFTER (Clear Clyntique Workflow) */}
          <div className="flex flex-col">
            {/* Column Label */}
            <div className="flex items-center gap-3 border-b border-line pb-3 mb-6">
              <span className="text-eyebrow font-bold uppercase tracking-widest text-brand-600">
                AFTER
              </span>
              <span className="text-micro text-muted">The unified Clyntique system</span>
            </div>

            {/* Structured Connected Stacked Cards */}
            <div className="flex flex-col gap-3 rounded-3xl border border-line bg-surface p-6 sm:p-8 shadow-card">
              {/* Card 1 */}
              <div className="flex items-start gap-4 rounded-2xl border border-line/70 bg-white p-4 shadow-2xs hover:border-brand-600/50 transition-colors">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 border border-brand-100 text-brand-600">
                  <FolderIcon className="size-5.5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-body font-semibold text-ink">One organized workspace</h3>
                    <span className="text-[10px] font-semibold text-brand-600 uppercase tracking-wider bg-brand-50 px-2 py-0.5 rounded-full">
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
              <div className="flex items-start gap-4 rounded-2xl border border-line/70 bg-white p-4 shadow-2xs hover:border-brand-600/50 transition-colors">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 border border-brand-100 text-brand-600">
                  <LayersIcon className="size-5.5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-body font-semibold text-ink">Centralized submissions</h3>
                    <span className="text-[10px] font-semibold text-brand-600 uppercase tracking-wider bg-brand-50 px-2 py-0.5 rounded-full">
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
              <div className="flex items-start gap-4 rounded-2xl border border-line/70 bg-white p-4 shadow-2xs hover:border-brand-600/50 transition-colors">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gold-50 border border-gold-200 text-gold-700">
                  <PaperclipIcon className="size-5.5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-body font-semibold text-ink">Evidence attached to creatives</h3>
                    <span className="text-[10px] font-semibold text-gold-700 uppercase tracking-wider bg-gold-100/70 px-2 py-0.5 rounded-full">
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
              <div className="flex items-start gap-4 rounded-2xl border border-line/70 bg-white p-4 shadow-2xs hover:border-brand-600/50 transition-colors">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 border border-brand-100 text-brand-600">
                  <ClipboardCheckIcon className="size-5.5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-body font-semibold text-ink">Clear review and revision stages</h3>
                    <span className="text-[10px] font-semibold text-brand-600 uppercase tracking-wider bg-brand-50 px-2 py-0.5 rounded-full">
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
              <div className="flex items-start gap-4 rounded-2xl border border-positive-line bg-positive-soft/40 p-4 shadow-2xs">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-positive-soft border border-positive-line text-positive-strong">
                  <AwardIcon className="size-5.5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-body font-semibold text-positive-ink">Traceable approvals and progress</h3>
                    <span className="text-[10px] font-semibold text-positive-strong uppercase tracking-wider bg-positive-soft px-2 py-0.5 rounded-full border border-positive-line">
                      Resolved
                    </span>
                  </div>
                  <p className="text-small mt-1 text-ink-soft leading-relaxed">
                    Complete audit trail with timestamped reviewer sign-offs and full decision history.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
