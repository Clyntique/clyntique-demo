import {
  FolderIcon,
  UploadIcon,
  PaperclipIcon,
  ClipboardCheckIcon,
  RefreshCwIcon,
  AwardIcon,
} from "@/components/ui/icons";

const WORKFLOW_STEPS = [
  {
    step: "1",
    title: "Create a Project",
    icon: FolderIcon,
    summary:
      "TEAM sets up a dedicated project container, defines brand parameters, and invites authorized client stakeholders to the workspace.",
    detail: "Scoped client isolation guarantees that brand assets remain private to authorized users only.",
  },
  {
    step: "2",
    title: "Submit Creatives",
    icon: UploadIcon,
    summary:
      "CLIENT uploads advertising image or video files, defines target platforms (Meta, TikTok, Google), and declares intended claims.",
    detail: "Every upload automatically creates Version 1 in an immutable lineage tree.",
  },
  {
    step: "3",
    title: "Attach Evidence",
    icon: PaperclipIcon,
    summary:
      "Supporting documentation, clinical studies, and substantiation links remain permanently bound to the creative version.",
    detail: "Eliminates detached PDF attachments and keeps legal justification alongside the creative.",
  },
  {
    step: "4",
    title: "Review & Give Feedback",
    icon: ClipboardCheckIcon,
    summary:
      "TEAM reviewers inspect the creative against policy guidelines, run assistive AI pre-screening, and record structured findings.",
    detail: "Findings include severity levels (High, Medium, Low) and exact actionable remediation steps.",
  },
  {
    step: "5",
    title: "Revise & Resubmit",
    icon: RefreshCwIcon,
    summary:
      "CLIENT responds directly to findings, attaches revised creative files (Version 2+), and resubmits for immediate re-evaluation.",
    detail: "Side-by-side visual comparison allows reviewers to verify fixes instantly without friction.",
  },
  {
    step: "6",
    title: "Approve & Track",
    icon: AwardIcon,
    summary:
      "Final internal review decisions and complete audit records remain accessible to authorized team and client stakeholders.",
    detail: "Timestamped decision logs provide permanent compliance traceability for future audits.",
  },
];

export function WorkflowSection() {
  return (
    <section
      id="workflow"
      aria-label="Product Workflow Journey"
      className="relative w-full border-b border-line/60 bg-canvas py-20 sm:py-28 overflow-hidden"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mb-16 text-center sm:mb-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1 text-micro font-semibold uppercase tracking-wider text-muted shadow-2xs">
            <span className="size-2 rounded-full bg-gold-500" />
            <span>Structured Process</span>
          </div>
          <h2 className="font-heading mt-4 text-balance text-3xl font-bold tracking-tight text-ink sm:text-4xl md:text-5xl leading-[1.18]">
            A seamless, accountable review journey.
          </h2>
          <p className="text-body mt-3 max-w-2xl mx-auto text-ink-soft text-balance">
            From initial project setup to final decision sign-off, every participant knows their exact role and status.
          </p>
        </div>

        {/* Desktop Alternating Workflow with Thin Dotted Connecting Lines */}
        <div className="hidden lg:block relative max-w-5xl mx-auto">
          {/* Alternating Steps */}
          <div className="flex flex-col gap-14">
            {WORKFLOW_STEPS.map((step, idx) => {
              const isEven = idx % 2 === 1; // 0, 2, 4 left; 1, 3, 5 right
              const Icon = step.icon;

              return (
                <div key={step.step} className="relative">
                  {/* Step Row */}
                  <div className={`flex w-full ${isEven ? "justify-end" : "justify-start"}`}>
                    <div className="relative z-10 w-[470px] rounded-3xl border border-line/80 bg-surface p-7 shadow-card transition-all hover:shadow-card-hover">
                      <div className="flex items-start gap-4">
                        {/* Clean Round Icon Container */}
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle border border-line/80 text-brand-600 shadow-2xs">
                          <Icon className="size-5" />
                        </div>

                        {/* Card Content */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-body font-semibold text-ink">
                            {step.title}
                          </h3>

                          <p className="text-small mt-2.5 text-ink-soft leading-relaxed">
                            {step.summary}
                          </p>

                          <div className="mt-3.5 border-t border-line/60 pt-3">
                            <p className="text-caption text-muted leading-relaxed">
                              {step.detail}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SVG Dotted Connector Line between current step and next step */}
                  {idx < WORKFLOW_STEPS.length - 1 && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute left-0 right-0 top-1/2 -bottom-14 z-0"
                    >
                      <svg
                        className="w-full h-full overflow-visible"
                        viewBox="0 0 1000 140"
                        preserveAspectRatio="none"
                      >
                        <path
                          d={
                            !isEven
                              ? "M 470 30 C 660 30, 660 110, 530 110" // Left to Right curve
                              : "M 530 30 C 340 30, 340 110, 470 110" // Right to Left curve
                          }
                          fill="none"
                          stroke="#DCA858"
                          strokeWidth="2.5"
                          strokeDasharray="6 6"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile / Tablet Vertical Connected Timeline */}
        <div className="block lg:hidden relative max-w-xl mx-auto">
          {/* Vertical connecting line */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-6 top-8 bottom-8 w-0.5 border-l-2 border-dashed border-gold-300"
          />

          <div className="flex flex-col gap-6">
            {WORKFLOW_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.step} className="relative flex items-start gap-4">
                  {/* Clean Icon Marker */}
                  <div className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-brand-600 shadow-2xs">
                    <Icon className="size-5" />
                  </div>

                  {/* Card Content */}
                  <div className="flex-1 rounded-2xl border border-line bg-surface p-5 shadow-2xs">
                    <h3 className="text-small font-semibold text-ink">{step.title}</h3>

                    <p className="text-caption mt-2 text-ink-soft leading-relaxed">
                      {step.summary}
                    </p>
                    <p className="text-[11px] mt-2 text-muted border-t border-line/60 pt-2 leading-relaxed">
                      {step.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
