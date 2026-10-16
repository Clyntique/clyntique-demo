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

        {/* Desktop Alternating Snake Workflow with Seamless Grid-Anchored Connectors */}
        <div className="hidden lg:block relative max-w-4xl mx-auto">
          {WORKFLOW_STEPS.map((step, idx) => {
            const isLeft = idx % 2 === 0; // 0, 2, 4 = Col 1 (Left); 1, 3, 5 = Col 2 (Right)
            const Icon = step.icon;
            const hasNext = idx < WORKFLOW_STEPS.length - 1;

            return (
              <div key={step.step} className="w-full">
                {/* 2-Column Row for the Card */}
                <div className="grid grid-cols-2 gap-x-12 items-start">
                  <div className={isLeft ? "col-start-1" : "col-start-2"}>
                    <div className="w-full rounded-3xl border border-line/80 bg-surface p-7 shadow-card transition-all hover:shadow-card-hover">
                      <div className="flex items-start gap-4">
                        {/* Category Icon */}
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
                </div>

                {/* S-Curve Connector between this step and the next step */}
                {hasNext && (
                  <div
                    aria-hidden
                    className="relative w-full h-20 my-[-2px] pointer-events-none"
                  >
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      className="w-full h-full overflow-visible"
                    >
                      {isLeft ? (
                        /* Left Card Bottom (25%) -> Right Card Top (75%) */
                        <>
                          <circle cx="25" cy="2" r="3" fill="#DCA858" />
                          <path
                            d="M 25 0 C 25 60, 75 40, 75 100"
                            stroke="#DCA858"
                            strokeWidth="2.5"
                            strokeDasharray="5 5"
                            strokeLinecap="round"
                            fill="none"
                          />
                          <circle cx="75" cy="98" r="3" fill="#DCA858" />
                        </>
                      ) : (
                        /* Right Card Bottom (75%) -> Left Card Top (25%) */
                        <>
                          <circle cx="75" cy="2" r="3" fill="#DCA858" />
                          <path
                            d="M 75 0 C 75 60, 25 40, 25 100"
                            stroke="#DCA858"
                            strokeWidth="2.5"
                            strokeDasharray="5 5"
                            strokeLinecap="round"
                            fill="none"
                          />
                          <circle cx="25" cy="98" r="3" fill="#DCA858" />
                        </>
                      )}
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Mobile / Tablet Vertical Connected Timeline */}
        <div className="block lg:hidden relative max-w-xl mx-auto">
          {/* Vertical connecting line */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-6 top-8 bottom-8 w-0.5 border-l-2 border-dashed border-gold-400"
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
