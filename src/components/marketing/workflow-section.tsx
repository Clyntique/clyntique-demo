"use client";

import React, { useEffect, useRef, useState } from "react";
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

interface ConnectorProps {
  isLeftToRight: boolean;
  isExposed: boolean;
}

function WorkflowConnector({ isLeftToRight, isExposed }: ConnectorProps) {
  // Left column center-right is ~28%; Right column center-left is ~72%
  const startX = isLeftToRight ? 28 : 72;
  const endX = isLeftToRight ? 72 : 28;
  const pathD = `M ${startX} 0 C ${startX} 60, ${endX} 40, ${endX} 100`;

  return (
    <div
      aria-hidden
      className="relative w-full h-24 my-[-3px] pointer-events-none overflow-visible"
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-full overflow-visible"
      >
        {/* Soft Ambient Depth Trace */}
        <path
          d={pathD}
          fill="none"
          stroke="#DCA858"
          strokeWidth="3.5"
          strokeOpacity={isExposed ? 0.15 : 0}
          className="blur-[2px] transition-opacity duration-1000"
        />

        {/* Dynamic Animated Path: stroke-width: 1.5px; stroke-dasharray: 2, 0 */}
        <path
          d={pathD}
          fill="none"
          stroke="#DCA858"
          pathLength={100}
          style={{
            strokeWidth: "1.5px",
            strokeDasharray: isExposed ? "2, 0" : "100, 100",
            strokeDashoffset: isExposed ? 0 : 100,
            transition:
              "stroke-dashoffset 950ms cubic-bezier(0.4, 0, 0.2, 1), stroke-dasharray 250ms ease 950ms",
          }}
        />
      </svg>

      {/* Downward pointing gold arrow touching down into the top of destination card */}
      <div
        className="absolute bottom-0 -translate-x-1/2 translate-y-1/2 pointer-events-none transition-all duration-300"
        style={{
          left: `${endX}%`,
          opacity: isExposed ? 1 : 0,
          transform: isExposed
            ? "translate(-50%, 50%) scale(1)"
            : "translate(-50%, 20%) scale(0.4)",
          transitionDelay: isExposed ? "850ms" : "0ms",
        }}
      >
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
          <path
            d="M 7 10 L 1.5 2 C 0.8 1 1.4 0 2.4 0 L 11.6 0 C 12.6 0 13.2 1 12.5 2 Z"
            fill="#DCA858"
          />
        </svg>
      </div>
    </div>
  );
}

export function WorkflowSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [exposedSteps, setExposedSteps] = useState<boolean[]>(() =>
    new Array(WORKFLOW_STEPS.length).fill(false)
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("IntersectionObserver" in window)) {
      setExposedSteps(new Array(WORKFLOW_STEPS.length).fill(true));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const stepIdxStr = entry.target.getAttribute("data-step-idx");
            if (stepIdxStr !== null) {
              const idx = parseInt(stepIdxStr, 10);
              setExposedSteps((prev) => {
                if (prev[idx]) return prev;
                const next = [...prev];
                next[idx] = true;
                return next;
              });
            }
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    const stepElements = containerRef.current?.querySelectorAll("[data-step-idx]");
    stepElements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

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
            <span className="size-2 rounded-full bg-gold-500 animate-pulse" />
            <span>Structured Process</span>
          </div>
          <h2 className="font-heading mt-4 text-balance text-3xl font-bold tracking-tight text-ink sm:text-4xl md:text-5xl leading-[1.18]">
            A seamless, accountable review journey.
          </h2>
          <p className="text-body mt-3 max-w-2xl mx-auto text-ink-soft text-balance">
            From initial project setup to final decision sign-off, every participant knows their exact role and status.
          </p>
        </div>

        {/* Desktop Alternating Snake Workflow with Animated Grid-Anchored Connectors */}
        <div ref={containerRef} className="hidden lg:block relative max-w-4xl mx-auto">
          {WORKFLOW_STEPS.map((step, idx) => {
            const isLeft = idx % 2 === 0;
            const Icon = step.icon;
            const hasNext = idx < WORKFLOW_STEPS.length - 1;
            const isStepExposed = exposedSteps[idx];
            // Connector draws when current step is visible
            const isConnectorExposed = isStepExposed;

            return (
              <div
                key={step.step}
                data-step-idx={idx}
                className="w-full"
              >
                {/* 2-Column Row for the Card with Scroll Entrance */}
                <div className="grid grid-cols-2 gap-x-12 items-start">
                  <div className={isLeft ? "col-start-1" : "col-start-2"}>
                    <div
                      className={`w-full rounded-3xl border border-line/80 bg-surface p-7 shadow-card transition-all duration-700 ease-out hover:shadow-card-hover hover:border-gold-400/60 ${
                        isStepExposed
                          ? "opacity-100 translate-y-0"
                          : "opacity-0 translate-y-7"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        {/* Category Icon */}
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-subtle border border-line/80 text-brand-600 shadow-2xs transition-colors group-hover:bg-gold-50 group-hover:text-gold-600">
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
                  <WorkflowConnector
                    isLeftToRight={isLeft}
                    isExposed={isConnectorExposed}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Mobile / Tablet Vertical Connected Timeline with Scroll Entrance */}
        <div className="block lg:hidden relative max-w-xl mx-auto">
          {/* Vertical connecting line with solid gold stroke */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-6 top-8 bottom-8 w-[1.5px] bg-gold-400"
            style={{
              strokeDasharray: "2, 0",
            }}
          />

          <div className="flex flex-col gap-6">
            {WORKFLOW_STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isStepExposed = exposedSteps[idx];

              return (
                <div
                  key={step.step}
                  data-step-idx={idx}
                  className={`relative flex items-start gap-4 transition-all duration-700 ease-out ${
                    isStepExposed
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 translate-y-6"
                  }`}
                >
                  {/* Clean Icon Marker */}
                  <div className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-2xl border border-line bg-surface text-brand-600 shadow-2xs">
                    <Icon className="size-5" />
                  </div>

                  {/* Card Content */}
                  <div className="flex-1 rounded-2xl border border-line bg-surface p-5 shadow-2xs hover:border-gold-400/60 transition-colors">
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
