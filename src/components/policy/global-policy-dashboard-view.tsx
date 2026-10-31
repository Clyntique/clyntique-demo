"use client";

import { useState } from "react";
import Link from "next/link";
import {
  GLOBAL_POLICY_KPIS,
  MONITORED_PLATFORMS,
  MONITORED_JURISDICTIONS,
  COVERAGE_MATRIX_CELLS,
  PENDING_REVIEW_RULES,
  TRACKED_REGULATORY_AUTHORITIES,
  RECENT_REGULATORY_UPDATES,
  ALL_GLOBAL_POLICIES,
  type CellCoverage,
  type CoverageStatus,
  type PendingReviewItem,
  type GlobalPolicyRuleDetail,
} from "@/lib/policy/dashboard-data";
import {
  ShieldIcon,
  CheckIcon,
  ClockIcon,
  AlertIcon,
  LayersIcon,
  ExternalLinkIcon,
  ArrowRightIcon,
  SearchIcon,
  ChevronRightIcon,
  BookOpenIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export function GlobalPolicyDashboardView({ isStandalone = false }: { isStandalone?: boolean }) {
  const [selectedIndustry, setSelectedIndustry] = useState<"ALL" | "HEALTHCARE" | "MEDICAL_AESTHETICS">("ALL");
  const [selectedMarket, setSelectedMarket] = useState<string>("ALL");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("ALL");
  const [activeCellModal, setActiveCellModal] = useState<CellCoverage | null>(null);

  // Policy Directory state
  const [ruleSearch, setRuleSearch] = useState("");
  const [rulePlatform, setRulePlatform] = useState<string>("ALL");
  const [ruleMarket, setRuleMarket] = useState<string>("ALL");
  const [ruleIndustry, setRuleIndustry] = useState<string>("ALL");
  const [ruleVerification, setRuleVerification] = useState<"ALL" | "VERIFIED_ACTIVE" | "PENDING_VERIFICATION" | "UNVERIFIED_DRAFT">("ALL");
  const [expandedRuleCodes, setExpandedRuleCodes] = useState<Set<string>>(new Set());

  const toggleRuleExpand = (code: string) => {
    setExpandedRuleCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  // Filter policies based on user selection
  const filteredPolicies = ALL_GLOBAL_POLICIES.filter((rule) => {
    if (rulePlatform !== "ALL" && rule.platformCode !== rulePlatform) return false;
    if (ruleMarket !== "ALL" && rule.jurisdictionCode !== ruleMarket) return false;
    if (ruleIndustry !== "ALL" && rule.industry !== ruleIndustry) return false;
    if (ruleVerification !== "ALL" && rule.verificationStatus !== ruleVerification) return false;
    if (ruleSearch.trim()) {
      const q = ruleSearch.toLowerCase();
      const matches =
        rule.code.toLowerCase().includes(q) ||
        rule.title.toLowerCase().includes(q) ||
        rule.category.toLowerCase().includes(q) ||
        rule.authorityName.toLowerCase().includes(q) ||
        rule.summary.toLowerCase().includes(q);
      if (!matches) return false;
    }
    return true;
  });

  const verifiedRuleCount = filteredPolicies.filter((r) => r.verificationStatus === "VERIFIED_ACTIVE").length;
  const unverifiedDraftCount = filteredPolicies.filter((r) => r.verificationStatus === "UNVERIFIED_DRAFT").length;
  const pendingCount = filteredPolicies.filter((r) => r.verificationStatus === "PENDING_VERIFICATION").length;

  // Simulator state
  const [simPlatform, setSimPlatform] = useState("META");
  const [simMarket, setSimMarket] = useState("US");
  const [simIndustry, setSimIndustry] = useState<"HEALTHCARE" | "MEDICAL_AESTHETICS">("HEALTHCARE");

  // Filter cells based on user selection
  const filteredCells = COVERAGE_MATRIX_CELLS.filter((cell) => {
    if (selectedIndustry !== "ALL" && cell.industry !== selectedIndustry) return false;
    if (selectedMarket !== "ALL" && cell.marketCode !== selectedMarket) return false;
    if (selectedPlatform !== "ALL" && cell.platformCode !== selectedPlatform) return false;
    return true;
  });

  // Calculate simulated coverage
  const matchingSimCell = COVERAGE_MATRIX_CELLS.find(
    (c) => c.platformCode === simPlatform && c.marketCode === simMarket && c.industry === simIndustry
  );

  return (
    <div className="space-y-8 pb-16">
      {/* Disclaimer Banner */}
      <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-4 text-small text-brand-900 shadow-2xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white font-bold text-micro">
              i
            </span>
            <span>
              <strong>Global Policy Dashboard · Illustrative Prototype:</strong> Displays Clyntique&apos;s
              multi-jurisdiction regulatory tracking architecture, dual-human admin verification pipeline, and platform coverage depth.
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {isStandalone ? (
              <Link
                href="/pricing"
                className="text-caption font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2"
              >
                View Review Plans &rarr;
              </Link>
            ) : (
              <Link
                href="/admin/policy-library"
                className="text-caption font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2"
              >
                Open Policy Library &rarr;
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-brand-600 font-semibold text-small mb-1">
            <ShieldIcon className="size-5" />
            <span>Regulatory & Platform Intelligence</span>
          </div>
          <h1 className="text-display font-bold text-ink sm:text-3xl">
            Global Policy Dashboard
          </h1>
          <p className="mt-1 text-small text-ink-soft max-w-2xl">
            Real-time compliance rule tracking across platforms, statutory regulations, and dual-admin human approvals.
          </p>
        </div>

        {/* Global Coverage Index Indicator */}
        <div className="flex items-center gap-4 rounded-xl border border-line bg-surface p-3 sm:px-5 shadow-xs">
          <div>
            <div className="text-caption text-muted">Global Coverage Score</div>
            <div className="text-title font-extrabold text-ink sm:text-2xl">
              {GLOBAL_POLICY_KPIS.overallCoverageScore}%
            </div>
          </div>
          <div className="h-10 w-px bg-line" />
          <div className="text-caption text-ink-soft">
            <span className="font-semibold text-positive-ink flex items-center gap-1">
              <CheckIcon className="size-3.5" /> High Depth
            </span>
            <span>Target Scopes Protected</span>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Monitored Rules"
          value={GLOBAL_POLICY_KPIS.totalMonitoredRules}
          subtext="Total rules tracked"
          tone="default"
          icon={<LayersIcon className="size-5 text-ink" />}
        />
        <KpiCard
          title="Verified & Active"
          value={GLOBAL_POLICY_KPIS.verifiedActiveRules}
          subtext="Dual-admin approved"
          tone="positive"
          icon={<CheckIcon className="size-5 text-positive-ink" />}
        />
        <KpiCard
          title="Pending Dual Verification"
          value={GLOBAL_POLICY_KPIS.awaitingVerification}
          subtext="Awaiting 2nd sign-off"
          tone="attention"
          icon={<ClockIcon className="size-5 text-attention-ink" />}
        />
        <KpiCard
          title="Jurisdictions & Platforms"
          value={`${GLOBAL_POLICY_KPIS.monitoredJurisdictionsCount} / ${GLOBAL_POLICY_KPIS.monitoredPlatformsCount}`}
          subtext="Markets / Ad networks"
          tone="brand"
          icon={<ShieldIcon className="size-5 text-brand-600" />}
        />
      </div>

      {/* Interactive Coverage Scope Simulator */}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-line">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2 py-0.5 text-micro font-semibold text-brand-700 mb-1">
              <span>Interactive Inspector</span>
            </div>
            <h2 className="text-card-title font-bold text-ink">
              Policy Coverage Scope Simulator
            </h2>
            <p className="text-caption text-ink-soft mt-0.5">
              Simulate how Clyntique determines whether a creative receives automated AI verification or requires mandatory human escalation.
            </p>
          </div>
        </div>

        {/* Simulator Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
          <div>
            <label htmlFor="sim-platform-select" className="block text-caption font-semibold text-ink mb-1.5">
              Target Platform
            </label>
            <select
              id="sim-platform-select"
              value={simPlatform}
              onChange={(e) => setSimPlatform(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink focus:border-brand-500 focus:outline-none"
            >
              {MONITORED_PLATFORMS.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sim-market-select" className="block text-caption font-semibold text-ink mb-1.5">
              Target Market / Jurisdiction
            </label>
            <select
              id="sim-market-select"
              value={simMarket}
              onChange={(e) => setSimMarket(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink focus:border-brand-500 focus:outline-none"
            >
              {MONITORED_JURISDICTIONS.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.flag} {m.name} ({m.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sim-industry-select" className="block text-caption font-semibold text-ink mb-1.5">
              Industry Scope
            </label>
            <select
              id="sim-industry-select"
              value={simIndustry}
              onChange={(e) => setSimIndustry(e.target.value as "HEALTHCARE" | "MEDICAL_AESTHETICS")}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink focus:border-brand-500 focus:outline-none"
            >
              <option value="HEALTHCARE">Healthcare</option>
              <option value="MEDICAL_AESTHETICS">Medical Aesthetics</option>
            </select>
          </div>
        </div>

        {/* Simulator Output Box */}
        <div className="mt-5 rounded-xl border border-line bg-subtle/50 p-4 sm:p-5">
          {matchingSimCell ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CoverageBadge status={matchingSimCell.status} />
                  <span className="text-small font-bold text-ink">
                    {matchingSimCell.verifiedRuleCount} Verified Active Rules · {matchingSimCell.pendingRuleCount} Pending
                  </span>
                </div>
                <div className="text-caption text-ink-soft">
                  <strong>Authorities:</strong> {matchingSimCell.primaryAuthorities.join(", ")}
                </div>
                <div className="text-micro text-muted">
                  <strong>Core Mandates:</strong> {matchingSimCell.keyRequirements.join(" • ")}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <span className="text-micro text-muted block">Engine Routing:</span>
                <span className={cn(
                  "inline-block rounded-md px-2.5 py-1 text-caption font-semibold",
                  matchingSimCell.status === "FULL"
                    ? "bg-positive-soft text-positive-ink"
                    : matchingSimCell.status === "PARTIAL"
                    ? "bg-attention-soft text-attention-ink"
                    : "bg-critical-soft text-critical-ink"
                )}>
                  {matchingSimCell.status === "FULL"
                    ? "Automated AI Screening Permitted"
                    : matchingSimCell.status === "PARTIAL"
                    ? "AI Scan + Targeted Human Dual Check"
                    : "Mandatory Human Escalation Required"}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-caption text-ink-soft">
              <AlertIcon className="size-5 text-attention-ink shrink-0" />
              <span>
                <strong>Uncovered Scope:</strong> No verified platform rules exist yet for this specific combination.
                Clyntique&apos;s Policy Engine safely reports: <em>&ldquo;Insufficient policy coverage — manual review required.&rdquo;</em>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Multi-Jurisdictional Coverage Matrix (Heatmap) */}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-card-title font-bold text-ink">
              Multi-Jurisdictional Coverage Matrix
            </h2>
            <p className="text-caption text-ink-soft mt-0.5">
              Audit status across platforms and statutory authorities. Click any cell to inspect detailed requirements.
            </p>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIndustry("ALL")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-caption font-medium transition-colors cursor-pointer",
                selectedIndustry === "ALL"
                  ? "bg-brand-600 text-white"
                  : "bg-subtle text-ink-soft hover:bg-line"
              )}
            >
              All Industries
            </button>
            <button
              type="button"
              onClick={() => setSelectedIndustry("HEALTHCARE")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-caption font-medium transition-colors cursor-pointer",
                selectedIndustry === "HEALTHCARE"
                  ? "bg-brand-600 text-white"
                  : "bg-subtle text-ink-soft hover:bg-line"
              )}
            >
              Healthcare
            </button>
            <button
              type="button"
              onClick={() => setSelectedIndustry("MEDICAL_AESTHETICS")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-caption font-medium transition-colors cursor-pointer",
                selectedIndustry === "MEDICAL_AESTHETICS"
                  ? "bg-brand-600 text-white"
                  : "bg-subtle text-ink-soft hover:bg-line"
              )}
            >
              Medical Aesthetics
            </button>
            <select
              value={selectedMarket}
              onChange={(e) => setSelectedMarket(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-caption font-medium text-ink focus:outline-none"
              aria-label="Filter by market"
            >
              <option value="ALL">All Markets</option>
              {MONITORED_JURISDICTIONS.map((m) => (
                <option key={m.code} value={m.code}>{m.code}</option>
              ))}
            </select>
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-caption font-medium text-ink focus:outline-none"
              aria-label="Filter by platform"
            >
              <option value="ALL">All Platforms</option>
              {MONITORED_PLATFORMS.map((p) => (
                <option key={p.code} value={p.code}>{p.code}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Matrix Grid Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCells.map((cell, idx) => (
            <button
              type="button"
              key={idx}
              onClick={() => setActiveCellModal(cell)}
              className="text-left rounded-xl border border-line p-4 hover:border-brand-500 hover:shadow-xs transition-all bg-surface cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-caption font-semibold text-muted uppercase tracking-wider">
                    {cell.marketName} ({cell.marketCode})
                  </div>
                  <div className="text-small font-bold text-ink group-hover:text-brand-600 transition-colors">
                    {cell.platformName}
                  </div>
                </div>
                <CoverageBadge status={cell.status} />
              </div>

              <div className="mt-3 pt-3 border-t border-line flex items-center justify-between text-caption">
                <span className="text-ink-soft">
                  <strong>{cell.verifiedRuleCount}</strong> verified rules
                </span>
                <span className="text-micro text-muted">
                  Audited: {cell.lastAudited}
                </span>
              </div>

              <div className="mt-2 text-micro text-ink-soft line-clamp-1">
                Authorities: {cell.primaryAuthorities.join(", ")}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Policy Rules Registry & Verification Directory */}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-line mb-6">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2 py-0.5 text-micro font-semibold text-brand-700 mb-1">
              <BookOpenIcon className="size-3" />
              <span>Statutory & Platform Policy Registry</span>
            </div>
            <h2 className="text-card-title font-bold text-ink">
              Global Policy Rules & Verification Directory
            </h2>
            <p className="text-caption text-ink-soft mt-0.5">
              Inspect active compliance mandates by platform, country, industry, and verification state. Only dual-admin verified rules are active in the AI Policy Engine; research drafts remain non-operational.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-micro font-semibold text-ink-soft bg-subtle px-2.5 py-1 rounded-md border border-line">
              {filteredPolicies.length} Rules Shown ({verifiedRuleCount} Active · {pendingCount} Pending · {unverifiedDraftCount} Drafts)
            </span>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted pointer-events-none" />
              <input
                type="text"
                value={ruleSearch}
                onChange={(e) => setRuleSearch(e.target.value)}
                placeholder="Search rule code, title, authority, or keywords..."
                className="w-full rounded-lg border border-line bg-surface pl-9 pr-3 py-2 text-caption text-ink placeholder:text-muted focus:border-brand-500 focus:outline-none"
              />
              {ruleSearch && (
                <button
                  type="button"
                  onClick={() => setRuleSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-micro font-semibold text-muted hover:text-ink cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Quick status filter pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setRuleVerification("ALL")}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-micro font-semibold transition-colors cursor-pointer shrink-0",
                  ruleVerification === "ALL"
                    ? "bg-ink text-white"
                    : "bg-subtle text-ink-soft hover:bg-line"
                )}
              >
                All Statuses
              </button>
              <button
                type="button"
                onClick={() => setRuleVerification("VERIFIED_ACTIVE")}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-micro font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1",
                  ruleVerification === "VERIFIED_ACTIVE"
                    ? "bg-positive-soft text-positive-ink border border-positive-ink/30 font-bold"
                    : "bg-subtle text-ink-soft hover:bg-line"
                )}
              >
                <CheckIcon className="size-3" />
                Active in AI Engine ({ALL_GLOBAL_POLICIES.filter(r => r.verificationStatus === "VERIFIED_ACTIVE").length})
              </button>
              <button
                type="button"
                onClick={() => setRuleVerification("PENDING_VERIFICATION")}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-micro font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1",
                  ruleVerification === "PENDING_VERIFICATION"
                    ? "bg-attention-soft text-attention-ink border border-attention-ink/30 font-bold"
                    : "bg-subtle text-ink-soft hover:bg-line"
                )}
              >
                <ClockIcon className="size-3" />
                Pending Verification ({ALL_GLOBAL_POLICIES.filter(r => r.verificationStatus === "PENDING_VERIFICATION").length})
              </button>
              <button
                type="button"
                onClick={() => setRuleVerification("UNVERIFIED_DRAFT")}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-micro font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1",
                  ruleVerification === "UNVERIFIED_DRAFT"
                    ? "bg-critical-soft text-critical-ink border border-critical-ink/30 font-bold"
                    : "bg-subtle text-ink-soft hover:bg-line"
                )}
              >
                <AlertIcon className="size-3" />
                Unverified Drafts ({ALL_GLOBAL_POLICIES.filter(r => r.verificationStatus === "UNVERIFIED_DRAFT").length})
              </button>
            </div>
          </div>

          {/* Secondary Select Dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div>
              <label htmlFor="filter-platform" className="block text-micro font-semibold text-muted mb-1">
                Platform:
              </label>
              <select
                id="filter-platform"
                value={rulePlatform}
                onChange={(e) => setRulePlatform(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-caption font-medium text-ink focus:outline-none"
              >
                <option value="ALL">All Platforms & Statutory</option>
                <option value="META">Meta (FB / IG)</option>
                <option value="GOOGLE">Google Ads</option>
                <option value="TIKTOK">TikTok Ads</option>
                <option value="SNAPCHAT">Snapchat Ads</option>
              </select>
            </div>

            <div>
              <label htmlFor="filter-market" className="block text-micro font-semibold text-muted mb-1">
                Market / Country:
              </label>
              <select
                id="filter-market"
                value={ruleMarket}
                onChange={(e) => setRuleMarket(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-caption font-medium text-ink focus:outline-none"
              >
                <option value="ALL">All Jurisdictions</option>
                <option value="US">🇺🇸 United States (US)</option>
                <option value="GB">🇬🇧 United Kingdom (GB)</option>
                <option value="AE">🇦🇪 United Arab Emirates (AE)</option>
                <option value="EU">🇪🇺 European Union (EU)</option>
                <option value="GLOBAL">🌐 Global Platform Standards</option>
              </select>
            </div>

            <div>
              <label htmlFor="filter-industry" className="block text-micro font-semibold text-muted mb-1">
                Industry:
              </label>
              <select
                id="filter-industry"
                value={ruleIndustry}
                onChange={(e) => setRuleIndustry(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-caption font-medium text-ink focus:outline-none"
              >
                <option value="ALL">All Industries</option>
                <option value="HEALTHCARE">Healthcare & Pharma</option>
                <option value="MEDICAL_AESTHETICS">Medical Aesthetics</option>
                <option value="GENERAL">General Commercial Advertising</option>
              </select>
            </div>
          </div>
        </div>

        {/* Missing Coverage Alert Banner */}
        {filteredPolicies.length === 0 ? (
          <div className="rounded-xl border border-attention-line bg-attention-soft/50 p-6 text-center">
            <div className="flex flex-col items-center justify-center max-w-md mx-auto space-y-2">
              <AlertIcon className="size-8 text-attention-ink" />
              <h3 className="text-small font-bold text-ink">Missing Policy Coverage Detected</h3>
              <p className="text-caption text-ink-soft">
                No policy rules match your selected filters (Platform: <strong>{rulePlatform}</strong>, Market: <strong>{ruleMarket}</strong>, Industry: <strong>{ruleIndustry}</strong>).
              </p>
              <p className="text-micro text-attention-ink font-medium">
                Clyntique&apos;s Policy Engine boundary rule: Any creative targeting an unmonitored scope receives an explicit &ldquo;Insufficient policy coverage — manual review required&rdquo; routing instead of ungrounded AI clearance.
              </p>
              <button
                type="button"
                onClick={() => {
                  setRuleSearch("");
                  setRulePlatform("ALL");
                  setRuleMarket("ALL");
                  setRuleIndustry("ALL");
                  setRuleVerification("ALL");
                }}
                className="mt-2 rounded-lg bg-ink px-4 py-1.5 text-caption font-semibold text-white hover:bg-ink-soft transition-colors cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPolicies.map((rule) => {
              const isExpanded = expandedRuleCodes.has(rule.code);
              return (
                <div
                  key={rule.code}
                  className={cn(
                    "rounded-xl border transition-all p-5",
                    rule.verificationStatus === "VERIFIED_ACTIVE"
                      ? "border-line bg-surface hover:border-brand-500/60"
                      : rule.verificationStatus === "PENDING_VERIFICATION"
                      ? "border-attention-line/80 bg-attention-soft/10"
                      : "border-critical-line/70 bg-critical-soft/10"
                  )}
                >
                  {/* Top Bar with Badges */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-micro font-bold text-ink bg-subtle px-2 py-0.5 rounded border border-line">
                        {rule.code}
                      </span>
                      <span className="rounded bg-brand-50 text-brand-700 px-2 py-0.5 text-micro font-medium">
                        {rule.platformName}
                      </span>
                      <span className="rounded bg-subtle text-ink-soft px-2 py-0.5 text-micro font-medium">
                        {rule.jurisdictionName} ({rule.jurisdictionCode})
                      </span>
                      <span className="rounded bg-subtle text-ink-soft px-2 py-0.5 text-micro font-medium">
                        {rule.industry}
                      </span>
                    </div>

                    <RuleVerificationBadge status={rule.verificationStatus} />
                  </div>

                  {/* Title & Authority */}
                  <div className="mt-2.5">
                    <h3 className="text-small font-bold text-ink sm:text-base">
                      {rule.title}
                    </h3>
                    <div className="text-micro text-muted mt-0.5">
                      Authority: <strong>{rule.authorityName}</strong> · Category: {rule.category}
                    </div>
                  </div>

                  {/* Summary */}
                  <p className="mt-2 text-caption text-ink-soft leading-relaxed">
                    {rule.summary}
                  </p>

                  {/* Pending Update Warning Note (if present) */}
                  {rule.pendingUpdatesNote && (
                    <div className="mt-3 rounded-lg border border-attention-line bg-attention-soft/40 p-2.5 flex items-start gap-2 text-caption text-attention-ink">
                      <ClockIcon className="size-4 shrink-0 mt-0.5" />
                      <div>
                        <strong>Pending Regulatory Shift:</strong> {rule.pendingUpdatesNote}
                      </div>
                    </div>
                  )}

                  {/* Warning Callout for Unverified Drafts */}
                  {rule.verificationStatus === "UNVERIFIED_DRAFT" && (
                    <div className="mt-3 rounded-lg border border-critical-line bg-critical-soft/30 p-2.5 flex items-start gap-2 text-caption text-critical-ink">
                      <AlertIcon className="size-4 shrink-0 mt-0.5" />
                      <div>
                        <strong>Draft Rule — Non-Operational:</strong> This policy is currently staged for regulatory review and cannot be evaluated by the AI Policy Engine until signed off by two distinct policy administrators.
                      </div>
                    </div>
                  )}

                  {/* Expand / Collapse Action */}
                  <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center justify-between gap-3 text-micro">
                    <div className="text-muted flex items-center gap-3">
                      <span>Last Audited: <strong>{rule.lastCheckedDate}</strong></span>
                      <span>•</span>
                      <span>Version: <strong>v{rule.versionHistory[0]?.versionNumber || 1}</strong></span>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleRuleExpand(rule.code)}
                      className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-800 cursor-pointer"
                    >
                      <span>{isExpanded ? "Hide Details & Audit Trail" : "View Sources, Legal Basis & Version History"}</span>
                      <ChevronRightIcon className={cn("size-3.5 transition-transform", isExpanded && "rotate-90")} />
                    </button>
                  </div>

                  {/* Expanded Detail Panel */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-line/80 space-y-4 animate-in fade-in duration-150">
                      {/* Legal Explanation */}
                      <div>
                        <h4 className="text-micro font-bold uppercase tracking-wider text-muted mb-1">
                          Legal Explanation & Statutory Basis
                        </h4>
                        <p className="text-caption text-ink bg-subtle/50 p-3 rounded-lg border border-line">
                          {rule.legalExplanation}
                        </p>
                      </div>

                      {/* Remediation Action */}
                      <div>
                        <h4 className="text-micro font-bold uppercase tracking-wider text-muted mb-1">
                          Remediation Guidance for Advertisers
                        </h4>
                        <div className="text-caption text-brand-900 bg-brand-50/70 p-3 rounded-lg border border-brand-200">
                          {rule.remediationAction}
                        </div>
                      </div>

                      {/* Source Links with Citations */}
                      <div>
                        <h4 className="text-micro font-bold uppercase tracking-wider text-muted mb-1.5">
                          Official Source Citations ({rule.sourceLinks.length})
                        </h4>
                        <div className="space-y-1.5">
                          {rule.sourceLinks.map((src, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-line bg-surface text-caption"
                            >
                              <div>
                                <div className="font-semibold text-ink">{src.title}</div>
                                <div className="text-micro text-muted font-mono">{src.citation}</div>
                              </div>
                              <a
                                href={src.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-micro font-semibold text-brand-600 hover:text-brand-800 shrink-0"
                              >
                                <span>Official Doc</span>
                                <ExternalLinkIcon className="size-3" />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Version Audit History */}
                      <div>
                        <h4 className="text-micro font-bold uppercase tracking-wider text-muted mb-1.5">
                          Immutable Version Audit Trail
                        </h4>
                        <div className="rounded-lg border border-line divide-y divide-line overflow-hidden bg-surface">
                          {rule.versionHistory.map((ver, idx) => (
                            <div key={idx} className="p-2.5 text-caption flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-micro font-bold bg-subtle px-2 py-0.5 rounded border border-line">
                                  v{ver.versionNumber}
                                </span>
                                <span className={cn(
                                  "text-micro font-semibold px-2 py-0.5 rounded",
                                  ver.status === "ACTIVE" ? "bg-positive-soft text-positive-ink" : "bg-attention-soft text-attention-ink"
                                )}>
                                  {ver.status}
                                </span>
                                <span className="text-ink-soft text-micro">
                                  {ver.notes}
                                </span>
                              </div>
                              <div className="text-micro text-muted shrink-0">
                                <span>{ver.author}</span> · <span>{ver.date}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dual-Admin Verification Pipeline */}
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-line mb-5">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-attention-soft px-2 py-0.5 text-micro font-semibold text-attention-ink mb-1">
              <ClockIcon className="size-3" />
              <span>Two-Person Trail Enforcement</span>
            </div>
            <h2 className="text-card-title font-bold text-ink">
              Pending Human Verification Queue
            </h2>
            <p className="text-caption text-ink-soft mt-0.5">
              Rules cannot be consumed by the AI Policy Engine until two separate policy admins verify and approve them.
            </p>
          </div>
          <Link
            href="/admin/policy-library"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-1.5 text-caption font-semibold text-ink hover:bg-subtle transition-colors"
          >
            <span>Review in Policy Library</span>
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>

        {/* Pending Items List */}
        <div className="divide-y divide-line">
          {PENDING_REVIEW_RULES.map((item) => (
            <div key={item.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-micro font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                    {item.ruleCode}
                  </span>
                  <h3 className="text-small font-bold text-ink">{item.title}</h3>
                </div>
                <StageBadge stage={item.verificationStage} />
              </div>

              <div className="mt-2 text-caption text-ink-soft flex flex-wrap gap-x-4 gap-y-1">
                <span><strong>Jurisdiction:</strong> {item.jurisdictionCode}</span>
                <span><strong>Platform:</strong> {item.platformCode}</span>
                <span><strong>Category:</strong> {item.category}</span>
                <span><strong>Proposed by:</strong> {item.proposedBy}</span>
              </div>

              {item.openQuestions && item.openQuestions.length > 0 && (
                <div className="mt-3 rounded-lg bg-subtle p-3 text-caption text-ink">
                  <span className="font-semibold text-attention-ink block mb-1">
                    Open Research & Verification Questions:
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-micro text-ink-soft">
                    {item.openQuestions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Regulatory Update Feed & Tracked Authorities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Tracked Authorities */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-xs">
          <h2 className="text-card-title font-bold text-ink mb-1">
            Tracked Statutory & Platform Authorities
          </h2>
          <p className="text-caption text-ink-soft mb-4">
            Official statutory bodies and platform policy directories actively monitored.
          </p>

          <div className="divide-y divide-line">
            {TRACKED_REGULATORY_AUTHORITIES.map((auth) => (
              <div key={auth.id} className="py-3.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-small font-bold text-ink">{auth.name}</h3>
                  <a
                    href={auth.officialUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-micro text-brand-600 hover:text-brand-800 font-medium"
                  >
                    <span>Official portal</span>
                    <ExternalLinkIcon className="size-3" />
                  </a>
                </div>
                <p className="mt-1 text-micro text-ink-soft">
                  {auth.recentStatusNote}
                </p>
                <div className="mt-2 flex items-center justify-between text-micro text-muted">
                  <span>{auth.jurisdiction} · {auth.rulesTrackedCount} active rules</span>
                  <span>Updated: {auth.lastUpdated}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Regulatory Updates */}
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-xs">
          <h2 className="text-card-title font-bold text-ink mb-1">
            Recent Regulatory Shifts & Alerts
          </h2>
          <p className="text-caption text-ink-soft mb-4">
            Latest enforcement notices, guidance updates, and platform algorithm changes.
          </p>

          <div className="space-y-4">
            {RECENT_REGULATORY_UPDATES.map((update) => (
              <div key={update.id} className="rounded-xl border border-line p-4 bg-surface shadow-2xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-small text-ink">{update.title}</span>
                  <span className={cn(
                    "rounded px-2 py-0.5 text-micro font-bold",
                    update.impactLevel === "HIGH" ? "bg-critical-soft text-critical-ink" : "bg-attention-soft text-attention-ink"
                  )}>
                    {update.impactLevel} IMPACT
                  </span>
                </div>
                <p className="mt-1.5 text-caption text-ink-soft">
                  {update.summary}
                </p>
                <div className="mt-3 pt-2.5 border-t border-line/60 flex items-center justify-between text-micro">
                  <span className="text-muted">{update.authority} ({update.jurisdiction}) · {update.date}</span>
                </div>
                <div className="mt-1.5 text-micro text-brand-700 bg-brand-50 p-2 rounded">
                  <strong>Action:</strong> {update.actionRequired}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cell Detail Modal */}
      {activeCellModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-pop">
            <div className="flex items-start justify-between pb-3 border-b border-line">
              <div>
                <div className="text-micro font-semibold uppercase text-muted">
                  {activeCellModal.marketName} · {activeCellModal.industry}
                </div>
                <h3 className="text-card-title font-bold text-ink">
                  {activeCellModal.platformName} Coverage Breakdown
                </h3>
              </div>
              <CoverageBadge status={activeCellModal.status} />
            </div>

            <div className="py-4 space-y-4 text-small text-ink-soft">
              <div>
                <strong className="text-ink block mb-1">Governing Authorities:</strong>
                <p>{activeCellModal.primaryAuthorities.join(", ")}</p>
              </div>

              <div>
                <strong className="text-ink block mb-1">Key Compliance Constraints:</strong>
                <ul className="list-disc list-inside space-y-1 text-caption text-ink">
                  {activeCellModal.keyRequirements.map((req, i) => (
                    <li key={i}>{req}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg bg-subtle p-3 text-caption">
                <div className="flex justify-between text-ink mb-1">
                  <span>Verified Rules: <strong>{activeCellModal.verifiedRuleCount}</strong></span>
                  <span>Pending Dual Sign-off: <strong>{activeCellModal.pendingRuleCount}</strong></span>
                </div>
                <div className="text-muted text-micro">
                  Last full compliance audit: {activeCellModal.lastAudited}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setActiveCellModal(null)}
                className="rounded-lg bg-ink px-4 py-2 text-caption font-semibold text-white hover:bg-ink-soft transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  subtext,
  tone,
  icon,
}: {
  title: string;
  value: string | number;
  subtext: string;
  tone: "default" | "positive" | "attention" | "brand";
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4 sm:p-5 shadow-2xs">
      <div className="flex items-center justify-between">
        <span className="text-caption font-semibold text-muted">{title}</span>
        {icon}
      </div>
      <div className={cn(
        "mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight",
        tone === "positive" && "text-positive-ink",
        tone === "attention" && "text-attention-ink",
        tone === "brand" && "text-brand-700",
        tone === "default" && "text-ink"
      )}>
        {value}
      </div>
      <p className="mt-1 text-micro text-muted">{subtext}</p>
    </div>
  );
}

function CoverageBadge({ status }: { status: CoverageStatus }) {
  switch (status) {
    case "FULL":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-positive-soft px-2.5 py-0.5 text-micro font-semibold text-positive-ink">
          <CheckIcon className="size-3" />
          <span>Full Coverage</span>
        </span>
      );
    case "PARTIAL":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-attention-soft px-2.5 py-0.5 text-micro font-semibold text-attention-ink">
          <ClockIcon className="size-3" />
          <span>Partial · Dual Check</span>
        </span>
      );
    case "MANUAL_REQUIRED":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-critical-soft px-2.5 py-0.5 text-micro font-semibold text-critical-ink">
          <AlertIcon className="size-3" />
          <span>Manual Review Req.</span>
        </span>
      );
  }
}

function StageBadge({ stage }: { stage: PendingReviewItem["verificationStage"] }) {
  switch (stage) {
    case "AWAITING_APPROVER":
      return (
        <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-micro font-semibold text-brand-700 border border-brand-200">
          Awaiting Final Approver Sign-off
        </span>
      );
    case "AWAITING_VERIFIER":
      return (
        <span className="rounded-full bg-attention-soft px-2.5 py-0.5 text-micro font-semibold text-attention-ink">
          Awaiting 1st Verifier Review
        </span>
      );
    case "RESEARCH_DRAFT":
      return (
        <span className="rounded-full bg-subtle px-2.5 py-0.5 text-micro font-semibold text-ink-soft">
          Research Draft
        </span>
      );
  }
}

function RuleVerificationBadge({
  status,
}: {
  status: GlobalPolicyRuleDetail["verificationStatus"];
}) {
  switch (status) {
    case "VERIFIED_ACTIVE":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-positive-soft px-3 py-1 text-micro font-bold text-positive-ink border border-positive-ink/20">
          <CheckIcon className="size-3" />
          <span>Dual-Admin Verified · Active in AI Engine</span>
        </span>
      );
    case "PENDING_VERIFICATION":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-attention-soft px-3 py-1 text-micro font-bold text-attention-ink border border-attention-ink/20">
          <ClockIcon className="size-3" />
          <span>Pending 2nd Admin · NOT Active in AI Engine</span>
        </span>
      );
    case "UNVERIFIED_DRAFT":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-critical-soft px-3 py-1 text-micro font-bold text-critical-ink border border-critical-ink/20">
          <AlertIcon className="size-3" />
          <span>Unverified Draft · NOT Active in AI Engine</span>
        </span>
      );
  }
}
