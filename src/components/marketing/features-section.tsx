"use client";

import {
  UsersIcon,
  LayersIcon,
  PaperclipIcon,
  ClipboardCheckIcon,
  TrendingUpIcon,
  SparklesIcon,
} from "@/components/ui/icons";
import { ScrollReveal } from "@/components/ui/scroll-reveal";

const FEATURES = [
  {
    icon: UsersIcon,
    title: "Creative Collaboration",
    badge: "Cross-Functional",
    description:
      "Separate but synchronized TEAM and CLIENT workspaces. Reviewers and clients communicate directly inside context-aware asset views.",
  },
  {
    icon: LayersIcon,
    title: "Version & Revision Management",
    badge: "Lineage Tracking",
    description:
      "Track every creative revision from initial concept (V1) to final approved asset. Compare versions side-by-side with complete change logs.",
  },
  {
    icon: PaperclipIcon,
    title: "Evidence Management",
    badge: "Substantiation",
    description:
      "Directly attach clinical trials, competitor comparisons, and source disclosures directly to creatives so evidence is never lost.",
  },
  {
    icon: ClipboardCheckIcon,
    title: "Review & Approval Tracking",
    badge: "State Machine",
    description:
      "Structured workflow stages: Draft, Submitted, In Review, Changes Requested, and Review Complete with verifiable decision records.",
  },
  {
    icon: TrendingUpIcon,
    title: "Project Progress Visibility",
    badge: "Real Analytics",
    description:
      "Role-tailored dashboards tracking review turnaround time, queue distribution, and submission health with zero fabricated metrics.",
  },
  {
    icon: SparklesIcon,
    title: "AI-Assisted Policy Review",
    badge: "Policy Grounding",
    description:
      "Intelligent pre-screening against approved platform and regional policies to surface potential concerns early for human reviewers.",
  },
];

export function FeaturesSection() {
  return (
    <section
      id="features"
      aria-label="Clyntique Product Features"
      className="relative w-full border-b border-line/60 bg-surface py-20 sm:py-28 overflow-hidden"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <ScrollReveal animation="fade-up" className="mb-16 text-center sm:mb-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-subtle px-3.5 py-1 text-micro font-semibold uppercase tracking-wider text-muted">
            <span>Enterprise Capabilities</span>
          </div>
          <h2 className="font-heading mt-4 text-balance text-3xl font-bold tracking-tight text-ink sm:text-4xl md:text-5xl leading-[1.18]">
            Built specifically for high-velocity creative compliance.
          </h2>
          <p className="text-body mt-3 max-w-2xl mx-auto text-ink-soft text-balance">
            Every feature is engineered to eliminate ambiguity and keep marketing teams moving forward with confidence.
          </p>
        </ScrollReveal>

        {/* 6-Feature Grid with Staggered Entrance Animations */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 sm:gap-8">
          {FEATURES.map((feature, idx) => {
            const Icon = feature.icon;
            const delay = (idx % 3) * 100;
            return (
              <ScrollReveal
                key={idx}
                animation="fade-up"
                delayMs={delay}
                className="h-full"
              >
                <div className="group relative flex h-full flex-col justify-between rounded-2xl border border-line/80 bg-surface p-7 shadow-2xs hover:border-brand-600/60 hover:shadow-card hover:-translate-y-1 transition-all duration-300">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex size-11 items-center justify-center rounded-xl bg-brand-50 border border-brand-100 text-brand-600 group-hover:bg-brand-600 group-hover:text-white transition-colors duration-200">
                        <Icon className="size-5.5" />
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted bg-subtle px-2.5 py-1 rounded-full border border-line/60">
                        {feature.badge}
                      </span>
                    </div>

                    <h3 className="text-body font-semibold text-ink mt-5 group-hover:text-brand-600 transition-colors">
                      {feature.title}
                    </h3>

                    <p className="text-small mt-2 text-ink-soft leading-relaxed">
                      {feature.description}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-line/50 flex items-center gap-1.5 text-micro font-medium text-brand-600 opacity-90 group-hover:opacity-100">
                    <span>Learn more</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </div>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
