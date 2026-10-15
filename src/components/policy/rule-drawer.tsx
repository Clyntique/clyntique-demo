"use client";

import { useState, useTransition } from "react";
import type { PolicyRule } from "@/lib/policy/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CloseIcon, ExternalLinkIcon, ShieldIcon, CheckIcon } from "@/components/ui/icons";
import { approveVersionServerAction, retireRuleServerAction } from "@/lib/policy/actions";
import { canApprovePolicyVersion } from "@/lib/policy/auth";

interface RuleDrawerProps {
  rule: PolicyRule | null;
  currentUser: { id: string; name: string; email: string };
  isPolicyAdmin: boolean;
  onClose: () => void;
  onRuleUpdated: (updatedRule: PolicyRule) => void;
  onProposeVersion: (rule: PolicyRule) => void;
}

export function RuleDrawer({
  rule,
  currentUser,
  isPolicyAdmin,
  onClose,
  onRuleUpdated,
  onProposeVersion,
}: RuleDrawerProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [auditNote, setAuditNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!rule) return null;

  const currentVersion =
    rule.versions.find((v) => v.id === selectedVersionId) ?? rule.currentVersion;

  const approvalCheck = canApprovePolicyVersion(
    { id: currentUser.id, name: currentUser.name, email: currentUser.email, role: "TEAM", isPolicyAdmin },
    currentVersion
  );

  const handleApprove = () => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await approveVersionServerAction(
        rule.id,
        currentVersion.id,
        auditNote || "Approved per compliance review."
      );
      if (!res.ok) {
        setErrorMsg(res.error ?? "Failed to approve version.");
      } else {
        // Local update for immediate feedback
        const updatedRule = { ...rule };
        const target = updatedRule.versions.find((v) => v.id === currentVersion.id);
        if (target) {
          target.status = "ACTIVE" as const;
          target.approvedById = currentUser.id;
          target.approvedByName = currentUser.name;
          target.approvedAt = new Date().toISOString();
          target.changeSummary = `${target.changeSummary} [Approved: ${auditNote || "Approved"}]`;
          updatedRule.currentVersion = target;
          updatedRule.currentVersionNumber = target.versionNumber;
        }
        onRuleUpdated(updatedRule);
      }
    });
  };

  const handleRetire = () => {
    if (!window.confirm(`Are you sure you want to retire rule ${rule.code}? This will mark active versions as DEPRECATED.`)) {
      return;
    }
    setErrorMsg(null);
    startTransition(async () => {
      const res = await retireRuleServerAction(
        rule.id,
        auditNote || "Retired by Policy Administrator."
      );
      if (!res.ok) {
        setErrorMsg(res.error ?? "Failed to retire rule.");
      } else {
        const updatedRule = { ...rule };
        for (const v of updatedRule.versions) {
          if (v.status === "ACTIVE") {
            v.status = "DEPRECATED" as const;
            v.effectiveTo = new Date().toISOString();
          }
        }
        if (updatedRule.currentVersion.status === "ACTIVE") {
          updatedRule.currentVersion.status = "DEPRECATED";
        }
        onRuleUpdated(updatedRule);
      }
    });
  };

  const getAuthorityBadgeTone = (type: PolicyRule["authorityType"]) => {
    switch (type) {
      case "REGULATION":
        return "brand";
      case "PLATFORM_POLICY":
        return "neutral";
      case "INTERNAL_RISK":
        return "outline";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30 backdrop-blur-xs transition-opacity animate-in fade-in">
      <div
        className="relative flex h-full w-full max-w-2xl flex-col bg-surface shadow-2xl border-l border-line overflow-hidden animate-in slide-in-from-right duration-200"
        role="dialog"
        aria-label={`Rule details for ${rule.code}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4 bg-surface">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700">
              <ShieldIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-small font-semibold text-brand-700">{rule.code}</span>
                <Badge tone={getAuthorityBadgeTone(rule.authorityType)}>
                  {rule.authorityType === "REGULATION"
                    ? "Government Regulation"
                    : rule.authorityType === "PLATFORM_POLICY"
                    ? "Platform Policy"
                    : "Internal Risk"}
                </Badge>
                <Badge tone={currentVersion.status === "ACTIVE" ? "brand" : "outline"}>
                  {currentVersion.status === "ACTIVE"
                    ? "Active Version"
                    : currentVersion.status === "PENDING_APPROVAL"
                    ? "Pending Approval"
                    : currentVersion.status}
                </Badge>
              </div>
              <h2 className="text-body font-semibold text-ink truncate mt-0.5">{rule.title}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-ink transition-colors"
            aria-label="Close drawer"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {errorMsg && (
            <div className="rounded-md bg-critical-soft p-3 text-small text-critical-ink border border-critical-line">
              {errorMsg}
            </div>
          )}

          {/* Quick Meta */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 rounded-lg border border-line bg-subtle/50 p-3 text-caption">
            <div>
              <span className="text-muted block">Jurisdiction:</span>
              <span className="font-medium text-ink">
                {rule.jurisdictionCode} {rule.subJurisdiction ? `(${rule.subJurisdiction})` : ""}
              </span>
            </div>
            <div>
              <span className="text-muted block">Platform:</span>
              <span className="font-medium text-ink">{rule.platformCode ?? "All Platforms"}</span>
            </div>
            <div>
              <span className="text-muted block">Industry:</span>
              <span className="font-medium text-ink">{rule.industry}</span>
            </div>
            <div>
              <span className="text-muted block">Category:</span>
              <span className="font-medium text-ink">{rule.category}</span>
            </div>
          </div>

          {/* Version Selector Tabs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-small font-semibold text-ink">Rule Version History (Immutable)</span>
              {isPolicyAdmin && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onProposeVersion(rule)}
                >
                  Propose New Version
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {rule.versions.map((ver) => {
                const isSelected = ver.id === currentVersion.id;
                return (
                  <button
                    key={ver.id}
                    onClick={() => setSelectedVersionId(ver.id)}
                    className={`px-2.5 py-1 text-caption rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-brand-600 text-white shadow-xs"
                        : "bg-surface border border-line text-ink-soft hover:bg-subtle"
                    }`}
                  >
                    <span>v{ver.versionNumber}.0</span>
                    <span
                      className={`text-[10px] px-1 rounded ${
                        ver.status === "ACTIVE"
                          ? isSelected
                            ? "bg-brand-700 text-brand-100"
                            : "bg-emerald-50 text-emerald-700"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {ver.status}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Version Metadata & Audit info */}
          <Card className="p-3.5 bg-surface text-small space-y-2">
            <div className="flex items-center justify-between text-caption text-muted border-b border-line pb-2">
              <span>
                Created by <strong className="text-ink">{currentVersion.createdByName}</strong> on{" "}
                {new Date(currentVersion.createdAt).toLocaleDateString()}
              </span>
              <span>
                {currentVersion.approvedAt ? (
                  <span className="text-emerald-700 font-medium inline-flex items-center gap-1">
                    <CheckIcon className="size-3.5" /> Approved by {currentVersion.approvedByName}
                  </span>
                ) : (
                  <span className="text-amber-700 font-medium">Pending Maker-Checker Approval</span>
                )}
              </span>
            </div>
            <p className="text-caption text-muted">
              <strong>Change Note:</strong> {currentVersion.changeSummary}
            </p>
          </Card>

          {/* Summary & Explanation */}
          <div>
            <h3 className="text-small font-semibold text-ink mb-1.5">Rule Summary</h3>
            <p className="text-small text-ink-soft leading-relaxed">{currentVersion.summary}</p>
          </div>

          <div>
            <h3 className="text-small font-semibold text-ink mb-1.5">Legal & Regulatory Explanation</h3>
            <div className="rounded-md border border-line bg-subtle/30 p-3.5 text-small text-ink-soft leading-relaxed whitespace-pre-line">
              {currentVersion.legalExplanation}
            </div>
          </div>

          {/* Remediation Action Callout */}
          <div className="rounded-lg border border-gold-400 bg-gold-50/40 p-4">
            <h3 className="text-small font-semibold text-gold-900 mb-1 flex items-center gap-1.5">
              <span>Required Remediation Action for Creatives</span>
            </h3>
            <p className="text-small text-gold-950 leading-relaxed font-medium">
              {currentVersion.remediationAction}
            </p>
          </div>

          {/* Applicability Conditions & Exceptions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg border border-line p-3.5 bg-surface">
              <h4 className="text-small font-semibold text-ink mb-2">Applicability Criteria</h4>
              <ul className="list-disc pl-4 space-y-1 text-caption text-ink-soft">
                {currentVersion.applicabilityConditions.map((cond, i) => (
                  <li key={i}>{cond}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-line p-3.5 bg-surface">
              <h4 className="text-small font-semibold text-ink mb-2">Exceptions & Exclusions</h4>
              {currentVersion.exceptions && currentVersion.exceptions.length > 0 ? (
                <ul className="list-disc pl-4 space-y-1 text-caption text-ink-soft">
                  {currentVersion.exceptions.map((ex, i) => (
                    <li key={i}>{ex}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-caption text-muted italic">No exceptions recorded.</p>
              )}
            </div>
          </div>

          {/* Official Sources & Exact Section Citations */}
          <div>
            <h3 className="text-small font-semibold text-ink mb-2">
              Verified Official Sources & Exact Section Citations
            </h3>
            <div className="space-y-2.5">
              {currentVersion.sources.map((src) => (
                <div
                  key={src.id}
                  className="rounded-lg border border-line bg-surface p-3.5 text-small hover:border-line-strong transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-ink">{src.sourceName}</span>
                        <span className="text-caption font-mono bg-subtle px-1.5 py-0.5 rounded text-ink-soft">
                          {src.sectionReference}
                        </span>
                      </div>
                      <p className="text-caption text-muted mt-0.5">{src.authorityName} · {src.sectionTitle}</p>
                    </div>
                    {src.directUrl && (
                      <a
                        href={src.directUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-caption text-brand-600 hover:text-brand-800 font-medium shrink-0 pt-0.5"
                      >
                        Official Source <ExternalLinkIcon className="size-3.5" />
                      </a>
                    )}
                  </div>
                  {src.excerpt && (
                    <blockquote className="mt-2.5 border-l-2 border-line-strong pl-3 text-caption text-muted italic">
                      &ldquo;{src.excerpt}&rdquo;
                    </blockquote>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer / Maker-Checker Action Bar */}
        <div className="border-t border-line px-6 py-4 bg-surface">
          {currentVersion.status === "PENDING_APPROVAL" ? (
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-small font-semibold text-amber-900 block">
                    Maker-Checker Governance Gate
                  </span>
                  <span className="text-caption text-muted">
                    {approvalCheck.allowed
                      ? "You are authorized to review and approve this policy version."
                      : approvalCheck.reason}
                  </span>
                </div>
              </div>
              {approvalCheck.allowed && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={auditNote}
                    onChange={(e) => setAuditNote(e.target.value)}
                    placeholder="Audit confirmation note (optional)..."
                    className="flex-1 rounded-md border border-line px-3 py-1.5 text-small text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleApprove}
                    disabled={isPending}
                  >
                    {isPending ? "Approving..." : "Approve & Activate Version"}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <span className="text-caption text-muted">
                {currentVersion.status === "ACTIVE"
                  ? "Approved versions are immutable and active for AI retrieval."
                  : "This rule version is deprecated and excluded from AI retrieval."}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {currentVersion.status === "ACTIVE" && isPolicyAdmin && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="text-critical-ink border-critical-line hover:bg-critical-soft"
                    onClick={handleRetire}
                    disabled={isPending}
                  >
                    {isPending ? "Retiring..." : "Retire Rule"}
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
