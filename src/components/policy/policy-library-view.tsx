"use client";

import { useState } from "react";
import type { PolicyFilterCriteria, PolicyRule, PolicySource } from "@/lib/policy/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import {
  AlertIcon,
  CheckIcon,
  LayersIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
} from "@/components/ui/icons";
import { RuleDrawer } from "./rule-drawer";
import { RuleEditorModal } from "./rule-editor-modal";
import { GroundingSandbox } from "./grounding-sandbox";
import { filterPolicyRules } from "@/lib/policy/search";
import { importCandidatesServerAction } from "@/lib/policy/actions";

interface PolicyLibraryViewProps {
  initialRules: PolicyRule[];
  sources: PolicySource[];
  isPolicyAdmin: boolean;
  currentUser: { id: string; name: string; email: string };
  metrics: {
    totalActive: number;
    regulations: number;
    platformPolicies: number;
    internalRisk: number;
    pendingApproval: number;
  };
}

export function PolicyLibraryView({
  initialRules,
  sources,
  isPolicyAdmin,
  currentUser,
  metrics: initialMetrics,
}: PolicyLibraryViewProps) {
  const [rules, setRules] = useState<PolicyRule[]>(initialRules);
  const [activeTab, setActiveTab] = useState<"RULES" | "SANDBOX">("RULES");
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleImportCandidates = async () => {
    setIsImporting(true);
    setImportStatus(null);
    try {
      const res = await importCandidatesServerAction();
      if (!res.ok) {
        setImportStatus({ type: "error", text: res.error || "Failed to import candidate policies." });
      } else {
        setImportStatus({
          type: "success",
          text: res.message || "Candidate policies imported successfully as UNVERIFIED and PENDING_APPROVAL.",
        });
        window.location.reload();
      }
    } catch (err) {
      setImportStatus({
        type: "error",
        text: err instanceof Error ? err.message : "An unexpected error occurred during import.",
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [authorityFilter, setAuthorityFilter] = useState<PolicyFilterCriteria["authorityType"]>("ALL");
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("ALL");
  const [platformFilter, setPlatformFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<PolicyFilterCriteria["status"]>("ALL");

  // Drawer & Modal State
  const [selectedRule, setSelectedRule] = useState<PolicyRule | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"CREATE_RULE" | "PROPOSE_VERSION">("CREATE_RULE");
  const [ruleToVersion, setRuleToVersion] = useState<PolicyRule | null>(null);

  // Filtered Rules
  const filteredRules = filterPolicyRules(rules, {
    query: searchQuery,
    authorityType: authorityFilter,
    jurisdiction: jurisdictionFilter,
    platform: platformFilter,
    status: statusFilter,
  });

  const handleRuleUpdated = (updatedRule: PolicyRule) => {
    setRules((prev) => prev.map((r) => (r.id === updatedRule.id ? updatedRule : r)));
    setSelectedRule(updatedRule);
  };

  const handleOpenProposeVersion = (rule: PolicyRule) => {
    setRuleToVersion(rule);
    setEditorMode("PROPOSE_VERSION");
    setIsEditorOpen(true);
  };

  const handleOpenCreateRule = () => {
    setRuleToVersion(null);
    setEditorMode("CREATE_RULE");
    setIsEditorOpen(true);
  };

  const getAuthorityBadge = (authority: PolicyRule["authorityType"]) => {
    switch (authority) {
      case "REGULATION":
        return <Badge tone="brand">Government Regulation</Badge>;
      case "PLATFORM_POLICY":
        return <Badge tone="neutral">Platform Policy</Badge>;
      case "INTERNAL_RISK":
        return <Badge tone="outline">Internal Risk Guidance</Badge>;
    }
  };

  const getStatusBadge = (status: PolicyRule["currentVersion"]["status"]) => {
    switch (status) {
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-1 text-micro font-semibold px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckIcon className="size-3" /> ACTIVE
          </span>
        );
      case "PENDING_APPROVAL":
        return (
          <span className="inline-flex items-center gap-1 text-micro font-semibold px-2 py-0.5 rounded-sm bg-amber-50 text-amber-800 border border-amber-300">
            <AlertIcon className="size-3" /> PENDING APPROVAL
          </span>
        );
      case "DRAFT":
        return (
          <span className="inline-flex items-center gap-1 text-micro font-semibold px-2 py-0.5 rounded-sm bg-subtle text-ink-soft border border-line">
            DRAFT
          </span>
        );
      case "DEPRECATED":
        return (
          <span className="inline-flex items-center gap-1 text-micro font-semibold px-2 py-0.5 rounded-sm bg-gray-100 text-gray-500">
            DEPRECATED
          </span>
        );
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Compliance Knowledge Governance"
        title="Compliance Policy Library"
        description="Verified government regulations, ad platform standards, and internal risk policies for US and UAE healthcare and aesthetics advertising. 100% persisted in PostgreSQL."
        action={
          <div className="flex items-center gap-2">
            {isPolicyAdmin && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleImportCandidates}
                  disabled={isImporting}
                >
                  {isImporting ? "Importing Candidates..." : "Import Candidate Policies"}
                </Button>
                <Button variant="primary" size="sm" onClick={handleOpenCreateRule}>
                  <PlusIcon className="size-4" /> New Policy Rule
                </Button>
              </>
            )}
          </div>
        }
      />

      {importStatus && (
        <div
          className={`mb-4 rounded-lg p-3.5 text-small border flex items-center justify-between ${
            importStatus.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-critical-soft text-critical-ink border-critical-line"
          }`}
        >
          <span>{importStatus.text}</span>
          <button
            onClick={() => setImportStatus(null)}
            className="text-caption font-semibold underline hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Tabs */}
      <div className="flex border-b border-line mb-6">
        <button
          type="button"
          onClick={() => setActiveTab("RULES")}
          className={`flex items-center gap-2 px-4 py-2.5 text-small font-medium border-b-2 transition-all cursor-pointer active:scale-[0.99] ${
            activeTab === "RULES"
              ? "border-brand-600 text-ink font-semibold"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          <ShieldIcon className="size-4" />
          <span>Policy Rules Directory ({rules.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("SANDBOX")}
          className={`flex items-center gap-2 px-4 py-2.5 text-small font-medium border-b-2 transition-all cursor-pointer active:scale-[0.99] ${
            activeTab === "SANDBOX"
              ? "border-brand-600 text-ink font-semibold"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          <LayersIcon className="size-4" />
          <span>AI Grounding & Coverage Sandbox</span>
        </button>
      </div>

      {activeTab === "SANDBOX" ? (
        <GroundingSandbox />
      ) : (
        <div className="space-y-6">
          {/* Metrics Overview Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
            <Card className="p-3.5 bg-surface">
              <span className="text-caption text-muted block">Active Verified Rules</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-title font-bold text-ink">{initialMetrics.totalActive}</span>
                <span className="text-[11px] text-emerald-700 font-medium">Verified</span>
              </div>
            </Card>

            <Card className="p-3.5 bg-surface">
              <span className="text-caption text-muted block">Government Regulations</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-title font-bold text-brand-700">{initialMetrics.regulations}</span>
                <span className="text-[11px] text-muted">FTC, FDA, MOHAP, NMC</span>
              </div>
            </Card>

            <Card className="p-3.5 bg-surface">
              <span className="text-caption text-muted block">Platform Policies</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-title font-bold text-ink">{initialMetrics.platformPolicies}</span>
                <span className="text-[11px] text-muted">TikTok, Meta, Google</span>
              </div>
            </Card>

            <Card className="p-3.5 bg-surface">
              <span className="text-caption text-muted block">Internal Risk Guidance</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-title font-bold text-ink">{initialMetrics.internalRisk}</span>
                <span className="text-[11px] text-muted">Clyntique Protocols</span>
              </div>
            </Card>

            <Card className={`p-3.5 ${initialMetrics.pendingApproval > 0 ? "border-amber-300 bg-amber-50/40" : "bg-surface"}`}>
              <span className="text-caption text-amber-900 block font-medium">Pending Maker-Checker</span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-title font-bold text-amber-800">{initialMetrics.pendingApproval}</span>
                <span className="text-[11px] text-amber-700">Awaiting Approval</span>
              </div>
            </Card>
          </div>

          {/* Empty State when no rules exist in PostgreSQL */}
          {rules.length === 0 ? (
            <div className="rounded-xl border border-line bg-surface p-12 text-center max-w-2xl mx-auto shadow-xs my-8">
              <div className="size-12 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center mx-auto mb-4 border border-brand-200">
                <ShieldIcon className="size-6" />
              </div>
              <h3 className="text-body font-bold text-ink">Compliance Policy Library is Empty</h3>
              <p className="text-small text-muted mt-2 leading-relaxed max-w-lg mx-auto">
                Zero policy rules currently exist in PostgreSQL. Import our curated set of 18 candidate rules from official US and UAE regulatory documentation (FTC, FDA, MOHAP, TikTok, Meta, Google) as <span className="font-semibold text-ink">UNVERIFIED</span> and <span className="font-semibold text-ink">PENDING_APPROVAL</span> to begin maker-checker review.
              </p>
              {isPolicyAdmin && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Button variant="primary" onClick={handleImportCandidates} disabled={isImporting}>
                    <PlusIcon className="size-4" />
                    {isImporting ? "Importing Candidates..." : "Import 18 Official Candidate Policies"}
                  </Button>
                  <Button variant="secondary" onClick={handleOpenCreateRule}>
                    Create Custom Rule
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Faceted Filter Toolbar */}
              <div className="rounded-xl border border-line bg-surface p-4 space-y-3.5">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              {/* Search input */}
              <div className="relative flex-1 w-full">
                <SearchIcon className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search rules by code, citation (e.g. 16 CFR § 255.5), keyword, or authority..."
                  className="w-full rounded-md border border-line bg-surface pl-9 pr-3 py-2 text-small text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              {/* Status pills */}
              <div className="flex items-center gap-1 shrink-0 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                {(["ALL", "ACTIVE", "PENDING_APPROVAL"] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-md text-caption font-medium transition-colors whitespace-nowrap ${
                      statusFilter === status
                        ? "bg-brand-600 text-white shadow-xs"
                        : "bg-surface text-ink-soft hover:bg-subtle border border-line"
                    }`}
                  >
                    {status === "ALL" ? "All Statuses" : status === "ACTIVE" ? "Active Only" : "Pending Approval"}
                  </button>
                ))}
              </div>
            </div>

            {/* Facet Selectors */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line text-caption">
              <span className="text-muted font-medium mr-1">Facets:</span>

              {/* Authority */}
              <select
                value={authorityFilter}
                onChange={(e) => setAuthorityFilter(e.target.value as PolicyFilterCriteria["authorityType"])}
                className="rounded-md border border-line px-2.5 py-1 text-caption text-ink bg-surface focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="ALL">All Authorities</option>
                <option value="REGULATION">Government Regulations</option>
                <option value="PLATFORM_POLICY">Platform Policies</option>
                <option value="INTERNAL_RISK">Internal Risk</option>
              </select>

              {/* Jurisdiction */}
              <select
                value={jurisdictionFilter}
                onChange={(e) => setJurisdictionFilter(e.target.value)}
                className="rounded-md border border-line px-2.5 py-1 text-caption text-ink bg-surface focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="ALL">All Jurisdictions</option>
                <option value="US">US (United States)</option>
                <option value="AE">AE (United Arab Emirates)</option>
                <option value="GLOBAL">Global / Platform</option>
              </select>

              {/* Platform */}
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="rounded-md border border-line px-2.5 py-1 text-caption text-ink bg-surface focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="ALL">All Platforms</option>
                <option value="TIKTOK">TikTok</option>
                <option value="META">Meta</option>
                <option value="GOOGLE">Google Ads</option>
              </select>

              {/* Clear filters */}
              {(searchQuery || authorityFilter !== "ALL" || jurisdictionFilter !== "ALL" || platformFilter !== "ALL" || statusFilter !== "ALL") && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setAuthorityFilter("ALL");
                    setJurisdictionFilter("ALL");
                    setPlatformFilter("ALL");
                    setStatusFilter("ALL");
                  }}
                  className="text-brand-600 hover:text-brand-800 text-caption font-medium ml-auto"
                >
                  Reset filters
                </button>
              )}
            </div>
          </div>

          {/* Rules Table */}
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-line bg-subtle/50 text-caption font-semibold text-muted">
                    <th className="py-3 px-4">Rule Code & Authority</th>
                    <th className="py-3 px-4">Rule Title & Summary</th>
                    <th className="py-3 px-4">Scope (Market / Platform)</th>
                    <th className="py-3 px-4">Primary Official Citation</th>
                    <th className="py-3 px-4">Version & Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line text-small">
                  {filteredRules.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-muted">
                        No policy rules matched your filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredRules.map((rule) => {
                      const ver = rule.currentVersion;
                      const primarySource = ver.sources[0];
                      return (
                        <tr
                          key={rule.id}
                          className="hover:bg-subtle/40 transition-colors cursor-pointer group"
                          onClick={() => setSelectedRule(rule)}
                        >
                          {/* Code & Authority */}
                          <td className="py-3.5 px-4 align-top whitespace-nowrap">
                            <span className="font-mono text-caption font-bold text-brand-700 block">
                              {rule.code}
                            </span>
                            <div className="mt-1">{getAuthorityBadge(rule.authorityType)}</div>
                          </td>

                          {/* Title & Summary */}
                          <td className="py-3.5 px-4 align-top max-w-sm">
                            <p className="font-semibold text-ink group-hover:text-brand-700 transition-colors">
                              {rule.title}
                            </p>
                            <p className="text-caption text-muted mt-1 line-clamp-2 leading-relaxed">
                              {ver.summary}
                            </p>
                          </td>

                          {/* Scope */}
                          <td className="py-3.5 px-4 align-top whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              <span className="text-caption font-medium text-ink">
                                📍 {rule.jurisdictionCode} {rule.subJurisdiction ? `· ${rule.subJurisdiction}` : ""}
                              </span>
                              <span className="text-caption text-muted">
                                📱 {rule.platformCode ?? "Platform-agnostic"}
                              </span>
                              <span className="text-[11px] font-mono text-muted uppercase">
                                {rule.category}
                              </span>
                            </div>
                          </td>

                          {/* Primary Citation */}
                          <td className="py-3.5 px-4 align-top max-w-xs">
                            {primarySource ? (
                              <div>
                                <span className="font-mono text-caption font-medium text-ink block truncate">
                                  {primarySource.sectionReference}
                                </span>
                                <span className="text-caption text-muted block truncate mt-0.5">
                                  {primarySource.authorityName}
                                </span>
                              </div>
                            ) : (
                              <span className="text-muted text-caption">Internal guidance</span>
                            )}
                          </td>

                          {/* Version & Status */}
                          <td className="py-3.5 px-4 align-top whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              <div>{getStatusBadge(ver.status)}</div>
                              <span className="text-caption text-muted">
                                Version <strong className="text-ink">v{ver.versionNumber}.0</strong>
                              </span>
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 align-top text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedRule(rule)}
                              >
                                Inspect & History
                              </Button>
                              {ver.status === "PENDING_APPROVAL" && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => setSelectedRule(rule)}
                                >
                                  Review
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )}

      {/* Detail Drawer */}
      <RuleDrawer
        rule={selectedRule}
        currentUser={currentUser}
        isPolicyAdmin={isPolicyAdmin}
        onClose={() => setSelectedRule(null)}
        onRuleUpdated={handleRuleUpdated}
        onProposeVersion={handleOpenProposeVersion}
      />

      {/* Rule Creator / Version Proposer Modal */}
      {isEditorOpen && (
        <RuleEditorModal
          mode={editorMode}
          ruleToVersion={ruleToVersion}
          sources={sources}
          onClose={() => setIsEditorOpen(false)}
          onSuccess={() => {
            setIsEditorOpen(false);
            // Refresh rules from store
            window.location.reload();
          }}
        />
      )}
    </>
  );
}
