"use client";

import Link from "next/link";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PolicyFilterCriteria, PolicyRule, PolicyRuleVersion, PolicySource } from "@/lib/policy/types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
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
import { CoverageCheck } from "./coverage-check";
import { RuleDrawer } from "./rule-drawer";
import { RuleEditorModal, type EditorMode } from "./rule-editor-modal";
import { SourcesPanel } from "./sources-panel";
import { filterPolicyRules } from "@/lib/policy/search";
import { AUTHORITY_LABEL, versionStage } from "@/lib/policy/labels";
import type { PolicyLibraryPayload } from "@/lib/policy/actions";

// Policy Library (P0, Oct 27): rules with their two-person trail, the
// official sources behind them, and a read-only coverage check. Only rules
// that are approved, verified by a different admin and backed by verified
// sources reach the AI; everything else here is work in progress.

type Stage = "ALL" | "ACTIVE" | "AWAITING_VERIFICATION" | "AWAITING_APPROVAL" | "DRAFT" | "RETIRED";

const STAGES: { key: Stage; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Approved and active" },
  { key: "AWAITING_VERIFICATION", label: "Awaiting verification" },
  { key: "AWAITING_APPROVAL", label: "Awaiting approval" },
  { key: "DRAFT", label: "Drafts and returned" },
  { key: "RETIRED", label: "Retired" },
];

function inStage(v: PolicyRuleVersion, stage: Stage) {
  switch (stage) {
    case "ALL":
      return true;
    case "ACTIVE":
      return v.status === "ACTIVE";
    case "AWAITING_VERIFICATION":
      return v.status === "PENDING_APPROVAL" && v.verificationStatus !== "VERIFIED";
    case "AWAITING_APPROVAL":
      return v.status === "PENDING_APPROVAL" && v.verificationStatus === "VERIFIED";
    case "DRAFT":
      return v.status === "DRAFT";
    case "RETIRED":
      return v.status === "DEPRECATED";
  }
}

/** The version a row shows: one that is waiting on someone, else the current one. */
function rowVersion(rule: PolicyRule) {
  return rule.versions.find((v) => v.status === "PENDING_APPROVAL") ?? rule.versions.find((v) => v.status === "DRAFT") ?? rule.currentVersion;
}

interface PolicyLibraryViewProps {
  initialRules: PolicyRule[];
  sources: PolicySource[];
  isPolicyAdmin: boolean;
  currentUser: { id: string; name: string; email: string };
  metrics: PolicyLibraryPayload["metrics"];
}

export function PolicyLibraryView({
  initialRules,
  sources,
  isPolicyAdmin,
  currentUser,
  metrics,
}: PolicyLibraryViewProps) {
  const rules = initialRules;
  const [activeTab, setActiveTab] = useState<"RULES" | "SOURCES" | "COVERAGE">("RULES");
  const [status, setStatus] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [authorityFilter, setAuthorityFilter] = useState<PolicyFilterCriteria["authorityType"]>("ALL");
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("ALL");
  const [platformFilter, setPlatformFilter] = useState<string>("ALL");
  const [stageFilter, setStageFilter] = useState<Stage>("ALL");

  // Drawer & editor
  const [selectedRule, setSelectedRule] = useState<PolicyRule | null>(null);
  const [editor, setEditor] = useState<{ mode: EditorMode; rule: PolicyRule | null; version: PolicyRuleVersion | null } | null>(null);

  const filteredRules = filterPolicyRules(rules, {
    query: searchQuery,
    authorityType: authorityFilter,
    jurisdiction: jurisdictionFilter,
    platform: platformFilter,
    status: "ALL",
  }).filter((rule) => rule.versions.some((v) => inStage(v, stageFilter)));

  // Every change is saved on the server; refresh so the page shows what is stored.
  const router = useRouter();
  const changed = (message: string) => {
    setStatus(message);
    setEditor(null);
    setSelectedRule(null);
    router.refresh();
  };

  const metricCards = [
    { label: "Approved and active", value: metrics.approvedActive, hint: "Rules the AI may use" },
    { label: "Awaiting verification", value: metrics.awaitingVerification, hint: "First admin checks the sources" },
    { label: "Awaiting approval", value: metrics.awaitingApproval, hint: "A second admin approves" },
    { label: "Drafts and returned", value: metrics.draftsAndReturned, hint: "Not submitted yet" },
    { label: "Sources verified", value: `${metrics.sourcesVerified} of ${metrics.sourcesTotal}`, hint: "Official pages checked" },
  ];

  const tabClass = (on: boolean) =>
    `flex items-center gap-2 px-4 py-2.5 text-small font-medium border-b-2 transition-all cursor-pointer active:scale-[0.99] ${
      on ? "border-brand-600 text-ink font-semibold" : "border-transparent text-muted hover:text-ink"
    }`;

  const filtersActive = searchQuery || authorityFilter !== "ALL" || jurisdictionFilter !== "ALL" || platformFilter !== "ALL" || stageFilter !== "ALL";

  return (
    <>
      <PageHeader
        eyebrow="Compliance knowledge"
        title="Policy Library"
        description="Advertising rules for healthcare and medical aesthetics, written in Clyntique's own words and linked to the official source. One admin verifies each version and a different admin approves it before the AI may use it."
        action={
          <div className="flex items-center gap-2">
            <Link href="/admin/policy-library/monitoring" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Source monitoring
            </Link>
            <Link href="/admin/policy-library/impact" className={buttonClasses({ variant: "ghost", size: "sm" })}>
              Rule changes &amp; impact
            </Link>
            {isPolicyAdmin && (
              <Button variant="primary" size="sm" onClick={() => setEditor({ mode: "CREATE_RULE", rule: null, version: null })}>
                <PlusIcon className="size-4" /> New rule
              </Button>
            )}
          </div>
        }
      />

      {status && (
        <div role="status" className="mb-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-small text-emerald-800">
          <span>{status}</span>
          <button onClick={() => setStatus(null)} className="text-caption font-semibold underline hover:opacity-80">
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-6 flex overflow-x-auto border-b border-line">
        <button type="button" onClick={() => setActiveTab("RULES")} className={tabClass(activeTab === "RULES")}>
          <ShieldIcon className="size-4" />
          <span>Rules ({rules.length})</span>
        </button>
        <button type="button" onClick={() => setActiveTab("SOURCES")} className={tabClass(activeTab === "SOURCES")}>
          <CheckIcon className="size-4" />
          <span>Sources ({sources.length})</span>
        </button>
        <button type="button" onClick={() => setActiveTab("COVERAGE")} className={tabClass(activeTab === "COVERAGE")}>
          <LayersIcon className="size-4" />
          <span>Coverage check</span>
        </button>
      </div>

      {activeTab === "SOURCES" ? (
        <SourcesPanel sources={sources} isPolicyAdmin={isPolicyAdmin} onChanged={changed} />
      ) : activeTab === "COVERAGE" ? (
        <CoverageCheck />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-5">
            {metricCards.map((m) => (
              <Card key={m.label} className="bg-surface p-3.5">
                <span className="block text-caption text-muted">{m.label}</span>
                <span className="mt-1 block text-title font-bold text-ink">{m.value}</span>
                <span className="text-[11px] text-muted">{m.hint}</span>
              </Card>
            ))}
          </div>

          {metrics.approvedActive === 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-small text-amber-900">
              <AlertIcon className="mt-0.5 size-4 shrink-0" />
              No rule is approved yet, so AI checks report insufficient policy coverage for every submission.
            </p>
          )}

          {rules.length === 0 ? (
            <div className="mx-auto my-8 max-w-2xl rounded-xl border border-line bg-surface p-12 text-center shadow-xs">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-brand-200 bg-brand-50 text-brand-700">
                <ShieldIcon className="size-6" />
              </div>
              <h3 className="text-body font-bold text-ink">No rules yet</h3>
              <p className="mx-auto mt-2 max-w-lg text-small leading-relaxed text-muted">
                Add the official source first, then write the rule in your own words and submit it. An admin verifies it
                against the source, and a different admin, who neither wrote nor verified it, approves it before the AI can use it.
              </p>
              {isPolicyAdmin && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Button variant="secondary" onClick={() => setActiveTab("SOURCES")}>
                    Add a source
                  </Button>
                  <Button variant="primary" onClick={() => setEditor({ mode: "CREATE_RULE", rule: null, version: null })}>
                    <PlusIcon className="size-4" /> New rule
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-3.5 rounded-xl border border-line bg-surface p-4">
                <div className="relative w-full">
                  <SearchIcon className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by code, title, citation or keyword"
                    className="w-full rounded-md border border-line bg-surface py-2 pl-9 pr-3 text-small text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                  {STAGES.map((st) => (
                    <button
                      key={st.key}
                      onClick={() => setStageFilter(st.key)}
                      className={`whitespace-nowrap rounded-md px-3 py-1.5 text-caption font-medium transition-colors ${
                        stageFilter === st.key ? "bg-brand-600 text-white shadow-xs" : "border border-line bg-surface text-ink-soft hover:bg-subtle"
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3 text-caption">
                  <select
                    value={authorityFilter}
                    onChange={(e) => setAuthorityFilter(e.target.value as PolicyFilterCriteria["authorityType"])}
                    className="rounded-md border border-line bg-surface px-2.5 py-1 text-caption text-ink focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="ALL">All authority types</option>
                    <option value="REGULATION">{AUTHORITY_LABEL.REGULATION}</option>
                    <option value="PLATFORM_POLICY">{AUTHORITY_LABEL.PLATFORM_POLICY}</option>
                    <option value="INTERNAL_RISK">{AUTHORITY_LABEL.INTERNAL_RISK}</option>
                  </select>
                  <select
                    value={jurisdictionFilter}
                    onChange={(e) => setJurisdictionFilter(e.target.value)}
                    className="rounded-md border border-line bg-surface px-2.5 py-1 text-caption text-ink focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="ALL">All markets</option>
                    <option value="US">United States</option>
                    <option value="AE">United Arab Emirates</option>
                    <option value="CA">Canada</option>
                    <option value="GLOBAL">All-market rules</option>
                  </select>
                  <select
                    value={platformFilter}
                    onChange={(e) => setPlatformFilter(e.target.value)}
                    className="rounded-md border border-line bg-surface px-2.5 py-1 text-caption text-ink focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="ALL">All platforms</option>
                    <option value="META">Meta</option>
                    <option value="GOOGLE">Google Ads</option>
                    <option value="TIKTOK">TikTok</option>
                  </select>
                  {filtersActive && (
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setAuthorityFilter("ALL");
                        setJurisdictionFilter("ALL");
                        setPlatformFilter("ALL");
                        setStageFilter("ALL");
                      }}
                      className="ml-auto text-caption font-medium text-brand-600 hover:text-brand-800"
                    >
                      Reset filters
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-line bg-subtle/50 text-caption font-semibold text-muted">
                        <th className="px-4 py-3">Rule</th>
                        <th className="px-4 py-3">Summary</th>
                        <th className="px-4 py-3">Scope</th>
                        <th className="px-4 py-3">Source</th>
                        <th className="px-4 py-3">Stage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line text-small">
                      {filteredRules.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-10 text-center text-muted">
                            No rules match these filters.
                          </td>
                        </tr>
                      ) : (
                        filteredRules.map((rule) => {
                          const ver = rowVersion(rule);
                          const primary = ver.sources[0];
                          return (
                            <tr key={rule.id} className="group cursor-pointer transition-colors hover:bg-subtle/40" onClick={() => setSelectedRule(rule)}>
                              <td className="whitespace-nowrap px-4 py-3.5 align-top">
                                <span className="block font-mono text-caption font-bold text-brand-700">{rule.code}</span>
                                <div className="mt-1">
                                  <Badge tone={rule.authorityType === "REGULATION" ? "brand" : rule.authorityType === "PLATFORM_POLICY" ? "neutral" : "outline"}>
                                    {AUTHORITY_LABEL[rule.authorityType]}
                                  </Badge>
                                </div>
                              </td>
                              <td className="max-w-sm px-4 py-3.5 align-top">
                                <p className="font-semibold text-ink transition-colors group-hover:text-brand-700">{ver.title || rule.title}</p>
                                <p className="mt-1 line-clamp-2 text-caption leading-relaxed text-muted">{ver.summary}</p>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5 align-top text-caption">
                                <span className="block font-medium text-ink">
                                  {rule.jurisdictionCode}
                                  {rule.subJurisdiction ? ` · ${rule.subJurisdiction}` : ""}
                                </span>
                                <span className="block text-muted">{rule.platformCode ?? "Any platform"}</span>
                              </td>
                              <td className="max-w-xs px-4 py-3.5 align-top text-caption">
                                {primary ? (
                                  <>
                                    <span className="block truncate font-mono font-medium text-ink">{primary.sectionReference}</span>
                                    <span className="mt-0.5 block truncate text-muted">{primary.authorityName}</span>
                                  </>
                                ) : (
                                  <span className="text-muted">No source cited</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3.5 align-top text-caption">
                                <span className="block font-medium text-ink">{versionStage(ver)}</span>
                                <span className="text-muted">Version {ver.versionNumber}</span>
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

      <RuleDrawer
        key={selectedRule?.id ?? "none"}
        rule={selectedRule}
        currentUser={currentUser}
        isPolicyAdmin={isPolicyAdmin}
        onClose={() => setSelectedRule(null)}
        onChanged={changed}
        onProposeVersion={(rule) => setEditor({ mode: "PROPOSE_VERSION", rule, version: null })}
        onEditDraft={(rule, version) => setEditor({ mode: "EDIT_DRAFT", rule, version })}
      />

      {editor && (
        <RuleEditorModal
          mode={editor.mode}
          rule={editor.rule}
          version={editor.version}
          sources={sources}
          onClose={() => setEditor(null)}
          onSuccess={changed}
        />
      )}
    </>
  );
}
