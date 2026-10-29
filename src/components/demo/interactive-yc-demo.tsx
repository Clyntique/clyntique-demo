"use client";

import { useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import {
  FileTextIcon,
  ShieldIcon,
  CheckCircleIcon,
  PaperclipIcon,
  SparklesIcon,
  RefreshCwIcon,
  LayersIcon,
  LockIcon,
  ChevronRightIcon,
} from "@/components/ui/icons";

type DemoRole = "CLIENT" | "TEAM";
type DemoTab = "submission" | "evidence" | "review" | "audit";

interface FindingItem {
  id: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  ruleCode: string;
  title: string;
  detail: string;
  status: "OPEN" | "RESOLVED";
  remediation: string;
}

const INITIAL_FINDINGS: FindingItem[] = [
  {
    id: "f-1",
    severity: "HIGH",
    ruleCode: "RULE-META-HEALTH-04",
    title: "Unsubstantiated 24-Hour Outcome Claim",
    detail: 'Video frame 2 voiceover asserts "Eliminates deep wrinkles in 24 hours". FTC and platform policy prohibit superlative therapeutic timelines without direct clinical substantiation attached.',
    status: "RESOLVED",
    remediation: 'Updated in V2: Revised copy to "Clinically proven smoothing in 14 days" matching Phase III study documentation.',
  },
  {
    id: "f-2",
    severity: "MEDIUM",
    ruleCode: "RULE-FTC-DISCLOSURE-01",
    title: "Required Clinical Disclaimer Sizing",
    detail: 'Bottom-third disclosure font size in frame 4 was under 12pt minimum legible requirement for mobile feed formats.',
    status: "RESOLVED",
    remediation: 'Updated in V2: Increased font size to 14pt with high-contrast semi-transparent backing banner.',
  },
];

export function InteractiveYcDemo() {
  const [role, setRole] = useState<DemoRole>("CLIENT");
  const [activeTab, setActiveTab] = useState<DemoTab>("submission");
  const [activeVersion, setActiveVersion] = useState<1 | 2>(2);
  const [findings, setFindings] = useState<FindingItem[]>(INITIAL_FINDINGS);
  const [clientComment, setClientComment] = useState("");
  const [commentSubmitted, setCommentSubmitted] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<"APPROVED" | "CHANGES_REQUESTED" | null>("APPROVED");

  const toggleFindingStatus = (id: string) => {
    setFindings((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: f.status === "OPEN" ? "RESOLVED" : "OPEN" } : f))
    );
  };

  const resetDemo = () => {
    setRole("CLIENT");
    setActiveTab("submission");
    setActiveVersion(2);
    setFindings(INITIAL_FINDINGS);
    setClientComment("");
    setCommentSubmitted(false);
    setReviewDecision("APPROVED");
  };

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col antialiased">
      {/* Top Banner: YC Evaluator Notice */}
      <div className="bg-[#0A111E] text-white border-b border-brand-900/60 px-4 py-2.5 text-caption">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-gold-400 animate-pulse" />
            <span className="font-semibold text-gold-200 uppercase tracking-wider text-[10px]">
              YC Evaluator Interactive Sandbox
            </span>
            <span className="hidden sm:inline text-white/30">|</span>
            <span className="text-slate-300 text-[11px]">
              Synthetic data · Completely isolated from Production database
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={resetDemo}
              className="text-[11px] text-slate-400 hover:text-white transition-colors underline-offset-2 hover:underline cursor-pointer"
            >
              Reset Demo State
            </button>
            <Link
              href="/auth/login"
              className="text-[11px] font-semibold text-gold-400 hover:text-gold-300 transition-colors"
            >
              Sign In to Real Account &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Main Demo Header */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center justify-between">
            <Link href="/" aria-label="Clyntique homepage" className="flex items-center gap-2">
              <Brand size="md" className="select-none" />
              <span className="rounded bg-brand-50 border border-brand-100 text-brand-700 text-[10px] font-bold px-1.5 py-0.5 uppercase tracking-wider">
                Demo
              </span>
            </Link>

            {/* Mobile Role Switcher */}
            <div className="md:hidden flex rounded-lg border border-line bg-subtle p-0.5 text-caption">
              <button
                onClick={() => setRole("CLIENT")}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  role === "CLIENT" ? "bg-surface text-ink shadow-2xs font-semibold" : "text-muted"
                }`}
              >
                Client View
              </button>
              <button
                onClick={() => setRole("TEAM")}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  role === "TEAM" ? "bg-surface text-ink shadow-2xs font-semibold" : "text-muted"
                }`}
              >
                Team View
              </button>
            </div>
          </div>

          {/* Desktop Dual-Role Persona Switcher */}
          <div className="hidden md:flex items-center gap-3">
            <span className="text-caption font-medium text-muted">Simulate Persona:</span>
            <div className="inline-flex rounded-xl border border-line bg-subtle p-1 shadow-2xs">
              <button
                type="button"
                onClick={() => setRole("CLIENT")}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-small font-medium transition-all cursor-pointer ${
                  role === "CLIENT"
                    ? "bg-surface text-ink font-semibold shadow-xs ring-1 ring-line/80"
                    : "text-muted hover:text-ink"
                }`}
              >
                <div className="size-2 rounded-full bg-emerald-500" />
                <span>Client Submitter (NovaSkin)</span>
              </button>
              <button
                type="button"
                onClick={() => setRole("TEAM")}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-small font-medium transition-all cursor-pointer ${
                  role === "TEAM"
                    ? "bg-surface text-ink font-semibold shadow-xs ring-1 ring-line/80"
                    : "text-muted hover:text-ink"
                }`}
              >
                <div className="size-2 rounded-full bg-brand-600" />
                <span>Agency Reviewer (Clyntique Team)</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 5-Stage Workflow Stepper Bar */}
      <div className="border-b border-line bg-surface px-4 py-2.5 shadow-2xs">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center gap-2 overflow-x-auto text-caption py-1 no-scrollbar">
            <span className="text-micro font-semibold uppercase tracking-wider text-muted shrink-0 mr-2">
              Workflow Lifecycle:
            </span>

            <button
              onClick={() => setActiveTab("submission")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium shrink-0 cursor-pointer transition-colors ${
                activeTab === "submission"
                  ? "bg-brand-600 text-white font-semibold shadow-xs"
                  : "bg-subtle text-muted hover:text-ink"
              }`}
            >
              <span>1. Submit Creative</span>
              <CheckCircleIcon className="size-3 text-gold-300" />
            </button>

            <ChevronRightIcon className="size-3 text-faint shrink-0" />

            <button
              onClick={() => setActiveTab("evidence")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium shrink-0 cursor-pointer transition-colors ${
                activeTab === "evidence"
                  ? "bg-brand-600 text-white font-semibold shadow-xs"
                  : "bg-subtle text-muted hover:text-ink"
              }`}
            >
              <span>2. Attach Evidence</span>
              <CheckCircleIcon className="size-3 text-gold-300" />
            </button>

            <ChevronRightIcon className="size-3 text-faint shrink-0" />

            <button
              onClick={() => setActiveTab("review")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium shrink-0 cursor-pointer transition-colors ${
                activeTab === "review"
                  ? "bg-brand-600 text-white font-semibold shadow-xs"
                  : "bg-subtle text-muted hover:text-ink"
              }`}
            >
              <span>3. AI Policy Pre-Screening</span>
              <CheckCircleIcon className="size-3 text-gold-300" />
            </button>

            <ChevronRightIcon className="size-3 text-faint shrink-0" />

            <button
              onClick={() => setActiveTab("review")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium shrink-0 cursor-pointer transition-colors ${
                activeTab === "review"
                  ? "bg-brand-600 text-white font-semibold shadow-xs"
                  : "bg-subtle text-muted hover:text-ink"
              }`}
            >
              <span>4. Feedback &amp; Revisions</span>
              <span className="size-1.5 rounded-full bg-amber-400" />
            </button>

            <ChevronRightIcon className="size-3 text-faint shrink-0" />

            <button
              onClick={() => setActiveTab("audit")}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium shrink-0 cursor-pointer transition-colors ${
                activeTab === "audit"
                  ? "bg-brand-600 text-white font-semibold shadow-xs"
                  : "bg-subtle text-muted hover:text-ink"
              }`}
            >
              <span>5. Sign-Off &amp; Audit Trail</span>
              <CheckCircleIcon className="size-3 text-emerald-400" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Workspace Simulation Area */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 py-8 sm:px-6 lg:px-8">
        {/* Project Header Card */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-line/60 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-eyebrow font-semibold uppercase text-gold-700">
                  {role === "CLIENT" ? "My Workspace" : "Agency Review Queue"}
                </span>
                <span className="text-faint">·</span>
                <span className="text-caption text-muted">Project: NovaSkin Autumn Global Launch</span>
              </div>
              <h1 className="font-heading mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                Cellular Repair Serum · 30s Hero Video
              </h1>
              <p className="text-small text-muted mt-1">
                Target Channels: Meta Ads (Reels, Feed), TikTok For You, Google YouTube Shorts · Market: US / FDA Guidelines
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {reviewDecision === "APPROVED" ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-caption font-semibold text-emerald-700">
                  <CheckCircleIcon className="size-3.5" />
                  <span>Review Complete · Approved</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-caption font-semibold text-amber-700">
                  <RefreshCwIcon className="size-3.5" />
                  <span>Changes Requested</span>
                </span>
              )}

              {role === "TEAM" && (
                <button
                  type="button"
                  onClick={() => setReviewDecision((prev) => (prev === "APPROVED" ? "CHANGES_REQUESTED" : "APPROVED"))}
                  className="rounded-lg border border-line bg-surface hover:bg-subtle px-2.5 py-1 text-micro font-medium text-brand-700 cursor-pointer transition-colors"
                >
                  Simulate {reviewDecision === "APPROVED" ? "Request Changes" : "Approve"}
                </button>
              )}

              <div className="rounded-lg border border-line bg-subtle px-3 py-1 text-caption font-medium text-ink-soft">
                <span>Version: <strong>V2 (Current)</strong></span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 pt-4 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab("submission")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-small font-medium transition-colors cursor-pointer ${
                activeTab === "submission"
                  ? "bg-brand-50 text-brand-700 font-semibold border border-brand-200"
                  : "text-muted hover:text-ink hover:bg-subtle"
              }`}
            >
              <FileTextIcon className="size-4" />
              <span>Creative Asset &amp; Version History</span>
            </button>
            <button
              onClick={() => setActiveTab("evidence")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-small font-medium transition-colors cursor-pointer ${
                activeTab === "evidence"
                  ? "bg-brand-50 text-brand-700 font-semibold border border-brand-200"
                  : "text-muted hover:text-ink hover:bg-subtle"
              }`}
            >
              <PaperclipIcon className="size-4" />
              <span>Attached Evidence (2 Documents)</span>
            </button>
            <button
              onClick={() => setActiveTab("review")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-small font-medium transition-colors cursor-pointer ${
                activeTab === "review"
                  ? "bg-brand-50 text-brand-700 font-semibold border border-brand-200"
                  : "text-muted hover:text-ink hover:bg-subtle"
              }`}
            >
              <ShieldIcon className="size-4" />
              <span>Policy Review &amp; AI Citations</span>
            </button>
            <button
              onClick={() => setActiveTab("audit")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-small font-medium transition-colors cursor-pointer ${
                activeTab === "audit"
                  ? "bg-brand-50 text-brand-700 font-semibold border border-brand-200"
                  : "text-muted hover:text-ink hover:bg-subtle"
              }`}
            >
              <LayersIcon className="size-4" />
              <span>Decision Log &amp; Audit Trail</span>
            </button>
          </div>
        </div>

        {/* TAB 1: CREATIVE ASSET & VERSION COMPARISON */}
        {activeTab === "submission" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left 7 Cols: Video Preview Frame */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              <div className="rounded-2xl border border-line bg-surface overflow-hidden shadow-card">
                <div className="flex items-center justify-between border-b border-line px-5 py-3.5 bg-subtle/40">
                  <div className="flex items-center gap-2">
                    <span className="text-small font-semibold text-ink">
                      Asset Preview: {activeVersion === 2 ? "novaskin_hero_v2_approved.mp4" : "novaskin_hero_v1_initial.mp4"}
                    </span>
                    <span className="rounded bg-brand-100 text-brand-800 text-[10px] font-bold px-2 py-0.5">
                      V{activeVersion}
                    </span>
                  </div>

                  {/* Version Toggle */}
                  <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1">
                    <button
                      onClick={() => setActiveVersion(1)}
                      className={`px-2.5 py-0.5 rounded text-caption font-medium transition-colors cursor-pointer ${
                        activeVersion === 1 ? "bg-amber-100 text-amber-800 font-semibold" : "text-muted"
                      }`}
                    >
                      V1 (Changes Requested)
                    </button>
                    <button
                      onClick={() => setActiveVersion(2)}
                      className={`px-2.5 py-0.5 rounded text-caption font-medium transition-colors cursor-pointer ${
                        activeVersion === 2 ? "bg-emerald-100 text-emerald-800 font-semibold" : "text-muted"
                      }`}
                    >
                      V2 (Approved)
                    </button>
                  </div>
                </div>

                {/* Simulated Video Canvas */}
                <div className="relative aspect-video w-full bg-[#0F172A] flex items-center justify-center p-6 text-white text-center">
                  <div className="flex flex-col items-center max-w-md">
                    <div className="size-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mb-4 text-gold-300">
                      <SparklesIcon className="size-8" />
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-gold-400">
                      NovaSkin Cellular Repair
                    </span>
                    <h3 className="text-xl font-bold mt-1 text-white">
                      {activeVersion === 2
                        ? '"Clinically Proven Smoothing in 14 Days"'
                        : '"Eliminates Deep Wrinkles in 24 Hours"'}
                    </h3>
                    <p className="text-caption text-slate-300 mt-2">
                      {activeVersion === 2
                        ? 'Includes verified FDA & Meta compliant bottom-third disclosure (14pt high contrast).'
                        : 'Flagged for superlative therapeutic claim without immediate 24-hr clinical substantiation.'}
                    </p>
                  </div>

                  {activeVersion === 1 && (
                    <div className="absolute top-4 left-4 bg-amber-500/90 text-white text-[11px] font-bold px-2.5 py-1 rounded shadow-sm">
                      Replaced in Version 2
                    </div>
                  )}
                  {activeVersion === 2 && (
                    <div className="absolute top-4 left-4 bg-emerald-600/90 text-white text-[11px] font-bold px-2.5 py-1 rounded shadow-sm flex items-center gap-1">
                      <CheckCircleIcon className="size-3" />
                      Current Approved Version
                    </div>
                  )}
                </div>

                <div className="p-5 border-t border-line/60 flex items-center justify-between text-caption text-muted">
                  <span>Duration: 0:30 · Resolution: 1080x1920 (9:16 Vertical)</span>
                  <span>Uploaded: October 2026 · H.264 MP4</span>
                </div>
              </div>
            </div>

            {/* Right 5 Cols: Version Details & Side-by-Side Diff */}
            <div className="lg:col-span-5 flex flex-col gap-5">
              <div className="rounded-2xl border border-line bg-surface p-5 shadow-2xs">
                <h3 className="text-body font-semibold text-ink">Version Lineage &amp; Evolution</h3>
                <p className="text-caption text-muted mt-1">
                  Every submission maintains an immutable history of revisions and reviewer feedback.
                </p>

                <div className="mt-4 flex flex-col gap-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-small font-semibold text-emerald-800">Version 2 (Approved)</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                        Current
                      </span>
                    </div>
                    <p className="text-caption text-emerald-900 mt-1 leading-relaxed">
                      Corrected frame 2 claim phrasing. Replaced 24-hour superlative with 14-day clinical substantiation. Enlarged legal disclaimer banner to 14pt.
                    </p>
                  </div>

                  <div className="rounded-xl border border-line bg-subtle/50 p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-small font-semibold text-ink">Version 1 (Initial Submission)</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                        Changes Requested
                      </span>
                    </div>
                    <p className="text-caption text-muted mt-1 leading-relaxed">
                      Initial draft flagged by AI policy pre-screening for unverified health claim.
                    </p>
                  </div>
                </div>
              </div>

              {/* Client Revision Interaction Simulation */}
              <div className="rounded-2xl border border-gold-300/80 bg-gold-50/50 p-5 shadow-2xs">
                <div className="flex items-center gap-2 text-gold-800 text-small font-semibold">
                  <RefreshCwIcon className="size-4 text-gold-600" />
                  <span>Interactive Client Resubmission</span>
                </div>
                <p className="text-caption text-gold-900 mt-1 leading-relaxed">
                  {role === "CLIENT"
                    ? "As the client, you can submit responses and revision notes directly to the review team."
                    : "Switch to Client view above to simulate responding to change requests."}
                </p>

                {role === "CLIENT" && (
                  <div className="mt-3 flex flex-col gap-2">
                    <textarea
                      value={clientComment}
                      onChange={(e) => setClientComment(e.target.value)}
                      placeholder="Type a revision response note to the agency team..."
                      rows={2}
                      className="w-full rounded-xl border border-gold-300 bg-white p-3 text-caption text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <button
                      onClick={() => setCommentSubmitted(true)}
                      className="self-end rounded-lg bg-brand-600 px-4 py-2 text-caption font-semibold text-white shadow-2xs hover:bg-brand-700 transition-colors cursor-pointer"
                    >
                      {commentSubmitted ? "Response Recorded (Demo)" : "Send Revision Note"}
                    </button>
                    {commentSubmitted && (
                      <p className="text-[11px] text-emerald-700 font-medium">
                        ✓ Note recorded in local demo session.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ATTACHED EVIDENCE */}
        {activeTab === "evidence" && (
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
              <div className="flex items-center justify-between border-b border-line pb-4 mb-5">
                <div>
                  <h2 className="text-body font-semibold text-ink">Two-Sided Evidence Substantiation</h2>
                  <p className="text-caption text-muted mt-0.5">
                    Supporting clinical trials, laboratory disclosures, and substantiation documentation stay permanently bound to the creative version.
                  </p>
                </div>
                <span className="text-caption text-muted">2 of 2 Required Documents Bound</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Evidence Item 1 */}
                <div className="rounded-xl border border-line p-5 bg-subtle/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50 border border-brand-100 text-brand-700">
                        <FileTextIcon className="size-5" />
                      </div>
                      <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5">
                        Verified Valid
                      </span>
                    </div>

                    <h3 className="text-small font-semibold text-ink mt-3">
                      Clinical_Trial_Phase_III_Double_Blind_2026.pdf
                    </h3>
                    <p className="text-caption text-muted mt-1 leading-relaxed">
                      120-patient double-blind clinical efficacy study substantiating the 14-day skin barrier and smoothing claims.
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-micro text-muted">
                    <span>Size: 4.2 MB · Attached to V1 &amp; V2</span>
                    <span className="text-brand-600 font-medium cursor-pointer hover:underline">View Document &rarr;</span>
                  </div>
                </div>

                {/* Evidence Item 2 */}
                <div className="rounded-xl border border-line p-5 bg-subtle/30 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50 border border-brand-100 text-brand-700">
                        <PaperclipIcon className="size-5" />
                      </div>
                      <span className="rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5">
                        Verified Valid
                      </span>
                    </div>

                    <h3 className="text-small font-semibold text-ink mt-3">
                      Dermatologist_Safety_Certification_US_FDA.pdf
                    </h3>
                    <p className="text-caption text-muted mt-1 leading-relaxed">
                      Board-certified dermatologist toxicology and hypoallergenic safety evaluation report.
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-micro text-muted">
                    <span>Size: 1.8 MB · Attached to V1 &amp; V2</span>
                    <span className="text-brand-600 font-medium cursor-pointer hover:underline">View Document &rarr;</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: POLICY REVIEW & AI CITATIONS */}
        {activeTab === "review" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left 7 Cols: Policy Findings */}
            <div className="lg:col-span-7 flex flex-col gap-5">
              <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
                <div className="flex items-center justify-between border-b border-line pb-4 mb-5">
                  <div className="flex items-center gap-2">
                    <ShieldIcon className="size-5 text-brand-600" />
                    <h2 className="text-body font-semibold text-ink">Structured Compliance Findings</h2>
                  </div>
                  <span className="text-caption text-muted">
                    {findings.filter((f) => f.status === "OPEN").length} Open · {findings.filter((f) => f.status === "RESOLVED").length} Resolved
                  </span>
                </div>

                <div className="flex flex-col gap-4">
                  {findings.map((f) => (
                    <div
                      key={f.id}
                      className={`rounded-xl border p-4 transition-all ${
                        f.status === "RESOLVED"
                          ? "border-emerald-200 bg-emerald-50/30"
                          : "border-amber-300 bg-amber-50/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              f.severity === "HIGH" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {f.severity} SEVERITY
                          </span>
                          <span className="font-mono text-micro font-semibold text-muted">
                            {f.ruleCode}
                          </span>
                        </div>

                        {/* Interactive Resolve Toggle for Team */}
                        {role === "TEAM" ? (
                          <button
                            onClick={() => toggleFindingStatus(f.id)}
                            className="text-caption font-semibold text-brand-700 hover:text-brand-900 cursor-pointer underline"
                          >
                            {f.status === "RESOLVED" ? "Reopen Finding" : "Mark Resolved"}
                          </button>
                        ) : (
                          <span
                            className={`text-caption font-semibold ${
                              f.status === "RESOLVED" ? "text-emerald-700" : "text-amber-700"
                            }`}
                          >
                            {f.status === "RESOLVED" ? "✓ Resolved in V2" : "Action Required"}
                          </span>
                        )}
                      </div>

                      <h4 className="text-small font-semibold text-ink mt-2.5">{f.title}</h4>
                      <p className="text-caption text-muted mt-1 leading-relaxed">{f.detail}</p>

                      <div className="mt-3 rounded-lg bg-surface border border-line/70 p-2.5 text-caption text-ink-soft">
                        <span className="font-semibold text-ink block text-[11px] mb-0.5">Remediation Status:</span>
                        {f.remediation}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right 5 Cols: AI Policy Pre-Screening Guardrails */}
            <div className="lg:col-span-5 flex flex-col gap-5">
              <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-6 shadow-2xs">
                <div className="flex items-center gap-2 text-brand-800">
                  <SparklesIcon className="size-4 text-brand-600" />
                  <h3 className="text-small font-semibold">AI Policy Pre-Screening Citation</h3>
                </div>

                <div className="mt-3 rounded-xl border border-brand-200 bg-surface p-4 text-caption leading-relaxed text-ink-soft shadow-2xs">
                  <span className="font-mono text-[10px] text-muted block mb-1">
                    Grounded Rule: META-HEALTH-04 (Meta Ads US)
                  </span>
                  &ldquo;Ads promoting skincare treatments may not guarantee instant elimination of signs of aging unless rigorous 24-hr clinical proof is submitted alongside the asset.&rdquo;
                </div>

                <div className="mt-4 flex items-start gap-2.5 text-caption text-muted">
                  <LockIcon className="size-4 text-brand-700 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    <strong>Strict Safeguard:</strong> Clyntique&apos;s AI never auto-approves ads or makes legal judgments. Findings serve as assistive pre-screening for human review teams.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: DECISION LOG & AUDIT TRAIL */}
        {activeTab === "audit" && (
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
            <div className="border-b border-line pb-4 mb-6">
              <h2 className="text-body font-semibold text-ink">Immutable Review Decision Log</h2>
              <p className="text-caption text-muted mt-0.5">
                Every action is timestamped and recorded for compliance audits and legal peace of mind.
              </p>
            </div>

            <ol className="relative border-l-2 border-line ml-4 space-y-6">
              <li className="ml-6">
                <span className="absolute -left-2.5 flex size-5 items-center justify-center rounded-full bg-emerald-600 ring-4 ring-white text-white text-[10px]">
                  ✓
                </span>
                <div className="flex items-center justify-between">
                  <h4 className="text-small font-semibold text-ink">Review Complete · Campaign Approved</h4>
                  <span className="text-micro font-mono text-muted">Oct 28, 2026 · 14:32 UTC</span>
                </div>
                <p className="text-caption text-muted mt-0.5">
                  Internal compliance reviewer verified Version 2 updates and clinical substantiation. Status advanced to Approved.
                </p>
              </li>

              <li className="ml-6">
                <span className="absolute -left-2.5 flex size-5 items-center justify-center rounded-full bg-brand-600 ring-4 ring-white text-white text-[10px]">
                  2
                </span>
                <div className="flex items-center justify-between">
                  <h4 className="text-small font-semibold text-ink">Version 2 Resubmitted by Client</h4>
                  <span className="text-micro font-mono text-muted">Oct 26, 2026 · 10:15 UTC</span>
                </div>
                <p className="text-caption text-muted mt-0.5">
                  NovaSkin submitted revised creative file with corrected 14-day clinical claims and enlarged font sizes.
                </p>
              </li>

              <li className="ml-6">
                <span className="absolute -left-2.5 flex size-5 items-center justify-center rounded-full bg-amber-500 ring-4 ring-white text-white text-[10px]">
                  !
                </span>
                <div className="flex items-center justify-between">
                  <h4 className="text-small font-semibold text-ink">Changes Requested by Agency Reviewer</h4>
                  <span className="text-micro font-mono text-muted">Oct 24, 2026 · 16:45 UTC</span>
                </div>
                <p className="text-caption text-muted mt-0.5">
                  2 policy findings recorded with actionable remediation requests for health claim wording.
                </p>
              </li>

              <li className="ml-6">
                <span className="absolute -left-2.5 flex size-5 items-center justify-center rounded-full bg-slate-400 ring-4 ring-white text-white text-[10px]">
                  1
                </span>
                <div className="flex items-center justify-between">
                  <h4 className="text-small font-semibold text-ink">Initial Creative &amp; Evidence Submitted</h4>
                  <span className="text-micro font-mono text-muted">Oct 22, 2026 · 09:12 UTC</span>
                </div>
                <p className="text-caption text-muted mt-0.5">
                  NovaSkin uploaded Version 1 along with Phase III clinical study PDF and safety report.
                </p>
              </li>
            </ol>
          </div>
        )}
      </main>
    </div>
  );
}
