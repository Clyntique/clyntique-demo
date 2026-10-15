"use client";

import { useState, useTransition } from "react";
import type { PolicyRule, PolicySource } from "@/lib/policy/types";
import { Button } from "@/components/ui/button";
import { CloseIcon } from "@/components/ui/icons";
import { createPolicyRuleServerAction, proposeVersionServerAction } from "@/lib/policy/actions";

interface RuleEditorModalProps {
  mode: "CREATE_RULE" | "PROPOSE_VERSION";
  ruleToVersion?: PolicyRule | null;
  sources: PolicySource[];
  onClose: () => void;
  onSuccess: () => void;
}

export function RuleEditorModal({
  mode,
  ruleToVersion,
  sources,
  onClose,
  onSuccess,
}: RuleEditorModalProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [code, setCode] = useState(mode === "CREATE_RULE" ? "" : ruleToVersion?.code ?? "");
  const [title, setTitle] = useState(
    mode === "CREATE_RULE" ? "" : ruleToVersion?.currentVersion.title ?? ""
  );
  const [authorityType, setAuthorityType] = useState<PolicyRule["authorityType"]>(
    ruleToVersion?.authorityType ?? "REGULATION"
  );
  const [jurisdictionCode, setJurisdictionCode] = useState(
    ruleToVersion?.jurisdictionCode ?? "US"
  );
  const [subJurisdiction, setSubJurisdiction] = useState(
    ruleToVersion?.subJurisdiction ?? ""
  );
  const [platformCode, setPlatformCode] = useState(
    ruleToVersion?.platformCode ?? ""
  );
  const [industry, setIndustry] = useState(ruleToVersion?.industry ?? "AESTHETICS");
  const [category, setCategory] = useState<PolicyRule["category"]>(
    ruleToVersion?.category ?? "DISCLOSURE"
  );
  const [summary, setSummary] = useState(
    mode === "CREATE_RULE" ? "" : ruleToVersion?.currentVersion.summary ?? ""
  );
  const [legalExplanation, setLegalExplanation] = useState(
    mode === "CREATE_RULE" ? "" : ruleToVersion?.currentVersion.legalExplanation ?? ""
  );
  const [remediationAction, setRemediationAction] = useState(
    mode === "CREATE_RULE" ? "" : ruleToVersion?.currentVersion.remediationAction ?? ""
  );
  const [applicabilityInput, setApplicabilityInput] = useState(
    mode === "CREATE_RULE"
      ? "Target ad creative distributed in specified market\nFeatures health or aesthetic claim"
      : ruleToVersion?.currentVersion.applicabilityConditions.join("\n") ?? ""
  );
  const [exceptionsInput, setExceptionsInput] = useState(
    mode === "CREATE_RULE"
      ? ""
      : ruleToVersion?.currentVersion.exceptions?.join("\n") ?? ""
  );
  const [changeSummary, setChangeSummary] = useState(
    mode === "CREATE_RULE"
      ? "Initial rule drafted for compliance verification."
      : "Updated regulatory section citation and remediation guidance."
  );

  // Source Section
  const [selectedSourceId, setSelectedSourceId] = useState(sources[0]?.id ?? "");
  const [sectionReference, setSectionReference] = useState(
    mode === "CREATE_RULE"
      ? "Section / Article reference"
      : ruleToVersion?.currentVersion.sources[0]?.sectionReference ?? ""
  );
  const [sectionTitle, setSectionTitle] = useState(
    mode === "CREATE_RULE"
      ? "Official Section Title"
      : ruleToVersion?.currentVersion.sources[0]?.sectionTitle ?? ""
  );
  const [directUrl, setDirectUrl] = useState(
    mode === "CREATE_RULE"
      ? ""
      : ruleToVersion?.currentVersion.sources[0]?.directUrl ?? ""
  );
  const [excerpt, setExcerpt] = useState(
    mode === "CREATE_RULE"
      ? ""
      : ruleToVersion?.currentVersion.sources[0]?.excerpt ?? ""
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const applicabilityConditions = applicabilityInput
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const exceptions = exceptionsInput
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const sourcePayload = [
      {
        sourceId: selectedSourceId || sources[0]?.id || "src-us-ftc-endorsements",
        sectionReference: sectionReference.trim() || "Official Standard",
        sectionTitle: sectionTitle.trim() || "Policy Section",
        directUrl: directUrl.trim() || "https://clyntique.demo",
        excerpt: excerpt.trim() || "Official regulatory or platform standard text.",
      },
    ];

    startTransition(async () => {
      if (mode === "CREATE_RULE") {
        if (!code.trim() || !title.trim() || !summary.trim() || !remediationAction.trim()) {
          setErrorMsg("Please complete all required fields (Code, Title, Summary, Remediation).");
          return;
        }

        const res = await createPolicyRuleServerAction({
          code: code.trim(),
          title: title.trim(),
          authorityType,
          jurisdictionCode,
          subJurisdiction: subJurisdiction.trim() || null,
          platformCode: platformCode || null,
          industry,
          category,
          summary: summary.trim(),
          legalExplanation: legalExplanation.trim(),
          remediationAction: remediationAction.trim(),
          applicabilityConditions,
          exceptions,
          effectiveFrom: new Date().toISOString(),
          effectiveTo: null,
          sources: sourcePayload,
          status: "PENDING_APPROVAL", // Never auto-approved! (Requirement 10)
        });

        if (!res.ok) {
          setErrorMsg(res.error ?? "Failed to create rule.");
        } else {
          onSuccess();
        }
      } else if (mode === "PROPOSE_VERSION" && ruleToVersion) {
        const res = await proposeVersionServerAction({
          ruleId: ruleToVersion.id,
          title: title.trim(),
          summary: summary.trim(),
          legalExplanation: legalExplanation.trim(),
          remediationAction: remediationAction.trim(),
          applicabilityConditions,
          exceptions,
          effectiveFrom: new Date().toISOString(),
          effectiveTo: null,
          changeSummary: changeSummary.trim(),
          sources: sourcePayload,
        });

        if (!res.ok) {
          setErrorMsg(res.error ?? "Failed to propose version.");
        } else {
          onSuccess();
        }
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4 animate-in fade-in">
      <div
        className="relative flex flex-col w-full max-w-3xl max-h-[90vh] bg-surface rounded-xl shadow-2xl border border-line overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4 bg-surface">
          <div>
            <h2 className="text-body font-semibold text-ink">
              {mode === "CREATE_RULE"
                ? "Draft New Compliance Rule"
                : `Propose Version ${ruleToVersion?.currentVersionNumber ? ruleToVersion.currentVersionNumber + 1 : 2}.0 · ${ruleToVersion?.code}`}
            </h2>
            <p className="text-caption text-muted mt-0.5">
              Drafts require secondary maker-checker verification before becoming active.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-ink transition-colors"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMsg && (
            <div className="rounded-md bg-critical-soft p-3 text-small text-critical-ink border border-critical-line">
              {errorMsg}
            </div>
          )}

          {/* Rule Code & Title */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-caption font-medium text-ink block mb-1">
                Rule Code *
              </label>
              <input
                type="text"
                required
                disabled={mode === "PROPOSE_VERSION"}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. US-FTC-DISC-02"
                className="w-full rounded-md border border-line px-3 py-1.5 text-small font-mono text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-subtle"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-caption font-medium text-ink block mb-1">
                Rule Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Descriptive title of the compliance requirement"
                className="w-full rounded-md border border-line px-3 py-1.5 text-small text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Taxonomies: Authority, Market, Platform, Category */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-caption font-medium text-ink block mb-1">
                Authority Type
              </label>
              <select
                disabled={mode === "PROPOSE_VERSION"}
                value={authorityType}
                onChange={(e) => setAuthorityType(e.target.value as PolicyRule["authorityType"])}
                className="w-full rounded-md border border-line px-2.5 py-1.5 text-small text-ink focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-subtle"
              >
                <option value="REGULATION">Government Regulation</option>
                <option value="PLATFORM_POLICY">Platform Policy</option>
                <option value="INTERNAL_RISK">Internal Risk</option>
              </select>
            </div>

            <div>
              <label className="text-caption font-medium text-ink block mb-1">
                Jurisdiction
              </label>
              <select
                disabled={mode === "PROPOSE_VERSION"}
                value={jurisdictionCode}
                onChange={(e) => setJurisdictionCode(e.target.value)}
                className="w-full rounded-md border border-line px-2.5 py-1.5 text-small text-ink focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-subtle"
              >
                <option value="US">US (United States)</option>
                <option value="AE">AE (United Arab Emirates)</option>
                <option value="GLOBAL">GLOBAL / Platform-wide</option>
              </select>
            </div>

            <div>
              <label className="text-caption font-medium text-ink block mb-1">
                Platform
              </label>
              <select
                disabled={mode === "PROPOSE_VERSION"}
                value={platformCode}
                onChange={(e) => setPlatformCode(e.target.value)}
                className="w-full rounded-md border border-line px-2.5 py-1.5 text-small text-ink focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-subtle"
              >
                <option value="">All / Platform-Agnostic</option>
                <option value="TIKTOK">TikTok</option>
                <option value="META">Meta</option>
                <option value="GOOGLE">Google Ads</option>
              </select>
            </div>

            <div>
              <label className="text-caption font-medium text-ink block mb-1">
                Category
              </label>
              <select
                disabled={mode === "PROPOSE_VERSION"}
                value={category}
                onChange={(e) => setCategory(e.target.value as PolicyRule["category"])}
                className="w-full rounded-md border border-line px-2.5 py-1.5 text-small text-ink focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-subtle"
              >
                <option value="DISCLOSURE">Disclosure</option>
                <option value="BEFORE_AFTER">Before & After</option>
                <option value="EFFICACY_CLAIM">Efficacy Claim</option>
                <option value="SUBSTANTIATION">Substantiation</option>
                <option value="RESTRICTED_PROCEDURES">Restricted Procedures</option>
                <option value="MANDATORY_LABELING">Mandatory Labeling</option>
              </select>
            </div>
          </div>

          {/* Sub-Jurisdiction & Industry */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-caption font-medium text-ink block mb-1">
                Sub-Jurisdiction (Optional)
              </label>
              <input
                type="text"
                disabled={mode === "PROPOSE_VERSION"}
                value={subJurisdiction}
                onChange={(e) => setSubJurisdiction(e.target.value)}
                placeholder="e.g. Dubai, California, England"
                className="w-full rounded-md border border-line px-2.5 py-1.5 text-small text-ink focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-subtle"
              />
            </div>

            <div>
              <label className="text-caption font-medium text-ink block mb-1">
                Industry Sector
              </label>
              <select
                disabled={mode === "PROPOSE_VERSION"}
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full rounded-md border border-line px-2.5 py-1.5 text-small text-ink focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-subtle"
              >
                <option value="HEALTHCARE">Healthcare</option>
                <option value="AESTHETICS">Aesthetics & Cosmetics</option>
                <option value="WELLNESS">Wellness & Nutrition</option>
                <option value="GENERAL">General Advertising</option>
              </select>
            </div>
          </div>

          {/* Summary */}
          <div>
            <label className="text-caption font-medium text-ink block mb-1">
              Rule Summary *
            </label>
            <textarea
              required
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Concise, operational summary of what is restricted or required..."
              className="w-full rounded-md border border-line px-3 py-2 text-small text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Legal Explanation */}
          <div>
            <label className="text-caption font-medium text-ink block mb-1">
              Legal & Regulatory Explanation
            </label>
            <textarea
              rows={2}
              value={legalExplanation}
              onChange={(e) => setLegalExplanation(e.target.value)}
              placeholder="Cite underlying statutory grounds, enforcement precedent, or platform terms..."
              className="w-full rounded-md border border-line px-3 py-2 text-small text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Remediation Action */}
          <div>
            <label className="text-caption font-medium text-gold-900 block mb-1">
              Required Remediation Action for Creatives *
            </label>
            <textarea
              required
              rows={2}
              value={remediationAction}
              onChange={(e) => setRemediationAction(e.target.value)}
              placeholder="Specific, actionable step the client or team must take to fix the creative..."
              className="w-full rounded-md border border-gold-400 bg-gold-50/20 px-3 py-2 text-small text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>

          {/* Source and Citation */}
          <div className="rounded-lg border border-line bg-subtle/30 p-3.5 space-y-3">
            <span className="text-small font-semibold text-ink block">
              Official Source Citation
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-caption text-muted block mb-1">Parent Official Source</label>
                <select
                  value={selectedSourceId}
                  onChange={(e) => setSelectedSourceId(e.target.value)}
                  className="w-full rounded-md border border-line px-2.5 py-1.5 text-small text-ink focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {sources.map((src) => (
                    <option key={src.id} value={src.id}>
                      {src.authorityName} — {src.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-caption text-muted block mb-1">Exact Section Reference</label>
                <input
                  type="text"
                  value={sectionReference}
                  onChange={(e) => setSectionReference(e.target.value)}
                  placeholder="e.g. 16 CFR § 255.5 or Art. 4"
                  className="w-full rounded-md border border-line px-3 py-1.5 text-small text-ink focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-caption text-muted block mb-1">Section Title</label>
                <input
                  type="text"
                  value={sectionTitle}
                  onChange={(e) => setSectionTitle(e.target.value)}
                  placeholder="e.g. Disclosure of Material Connections"
                  className="w-full rounded-md border border-line px-3 py-1.5 text-small text-ink focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="text-caption text-muted block mb-1">Direct Official URL</label>
                <input
                  type="url"
                  value={directUrl}
                  onChange={(e) => setDirectUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-md border border-line px-3 py-1.5 text-small text-ink focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            <div>
              <label className="text-caption text-muted block mb-1">Statutory Excerpt</label>
              <textarea
                rows={2}
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                placeholder="Verbatim text from official regulation or platform policy..."
                className="w-full rounded-md border border-line px-3 py-1.5 text-small text-ink focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Applicability Conditions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-caption font-medium text-ink block mb-1">
                Applicability Conditions (one per line)
              </label>
              <textarea
                rows={3}
                value={applicabilityInput}
                onChange={(e) => setApplicabilityInput(e.target.value)}
                className="w-full rounded-md border border-line px-3 py-1.5 text-caption text-ink focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="text-caption font-medium text-ink block mb-1">
                Exceptions & Exclusions (one per line)
              </label>
              <textarea
                rows={3}
                value={exceptionsInput}
                onChange={(e) => setExceptionsInput(e.target.value)}
                placeholder="Optional exceptions..."
                className="w-full rounded-md border border-line px-3 py-1.5 text-caption text-ink focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Change Summary */}
          <div>
            <label className="text-caption font-medium text-ink block mb-1">
              Audit Note / Change Summary *
            </label>
            <input
              type="text"
              required
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-1.5 text-small text-ink focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Submit Buttons */}
          <div className="border-t border-line pt-4 flex items-center justify-end gap-2.5">
            <Button variant="secondary" size="sm" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={isPending}>
              {isPending
                ? "Submitting..."
                : mode === "CREATE_RULE"
                ? "Submit for Maker-Checker Approval"
                : "Submit Version for Approval"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
