"use client";

import { useState, useTransition } from "react";
import { SparklesIcon, AlertIcon, CheckIcon, ShieldIcon, ExternalLinkIcon } from "@/components/ui/icons";
import { runAICreativeScan, acceptAIFindingAction } from "@/lib/ai/actions";
import type { AIAnalysisResult, AISuggestedFinding } from "@/lib/ai/types";
import { cn } from "@/lib/cn";

export interface AICompliancePanelProps {
  creativeId: string;
  versionId?: string;
  versionNumber?: number;
  inReview: boolean;
  markets: Array<{ code: string; name: string }>;
  platforms: Array<{ code: string; name: string }>;
}

export function AICompliancePanel({
  creativeId,
  versionId,
  versionNumber,
  inReview,
  markets,
  platforms,
}: AICompliancePanelProps) {
  const [isScanning, startScanTransition] = useTransition();
  const [isAccepting, startAcceptTransition] = useTransition();
  const [scanResult, setScanResult] = useState<AIAnalysisResult | null>(null);
  const [acceptedFindingIds, setAcceptedFindingIds] = useState<Set<string>>(new Set());
  const [dismissedFindingIds, setDismissedFindingIds] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const handleRunScan = (forceRefresh = false) => {
    setErrorMessage(null);
    setActionSuccessMessage(null);
    startScanTransition(async () => {
      const res = await runAICreativeScan(creativeId, versionId, forceRefresh);
      if (!res.ok || !res.result) {
        setErrorMessage(res.error || "Failed to execute AI creative scan.");
      } else {
        setScanResult(res.result);
      }
    });
  };

  const handleAcceptFinding = (finding: AISuggestedFinding) => {
    setActionSuccessMessage(null);
    setErrorMessage(null);
    startAcceptTransition(async () => {
      const res = await acceptAIFindingAction({
        creativeId,
        finding,
        marketCodes: markets.map((m) => m.code),
        platformCodes: platforms.map((p) => p.code),
      });

      if (!res.ok) {
        setErrorMessage(res.error || "Failed to accept AI finding.");
      } else {
        setAcceptedFindingIds((prev) => new Set(prev).add(finding.id));
        setActionSuccessMessage(`Finding "${finding.issue}" added to draft review findings.`);
      }
    });
  };

  const handleDismissFinding = (findingId: string) => {
    setDismissedFindingIds((prev) => new Set(prev).add(findingId));
  };

  const visibleFindings = scanResult?.findings.filter((f) => !dismissedFindingIds.has(f.id)) ?? [];

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:p-5 shadow-xs">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-200">
            <SparklesIcon className="size-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-small font-semibold text-ink">Gemini AI Compliance Scan</h3>
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-meta font-medium text-brand-800">
                TEAM Only
              </span>
            </div>
            <p className="text-caption text-muted">
              Multimodal creative analysis grounded strictly in verified Clyntique policies.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleRunScan(Boolean(scanResult))}
          disabled={isScanning}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-small font-medium transition-colors shadow-2xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
            isScanning
              ? "cursor-not-allowed bg-subtle text-muted"
              : "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800"
          )}
        >
          <SparklesIcon className={cn("size-3.5", isScanning && "animate-spin")} />
          <span>{isScanning ? "Scanning with Gemini..." : scanResult ? "Re-scan Creative" : "Run AI Scan"}</span>
        </button>
      </div>

      {/* Scanning status banner */}
      {isScanning && (
        <div className="flex items-center gap-3 rounded-lg border border-brand-200 bg-brand-50/60 p-4 text-brand-900 animate-pulse">
          <div className="size-2 rounded-full bg-brand-600 animate-ping" />
          <p className="text-small font-medium">
            Analyzing creative visuals, OCR text, and promotional claims against verified compliance policies...
          </p>
        </div>
      )}

      {/* Global error banner */}
      {errorMessage && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger-line bg-danger-soft p-3.5 text-danger-ink">
          <AlertIcon className="size-4 shrink-0 mt-0.5" />
          <p className="text-small font-medium break-words">{errorMessage}</p>
        </div>
      )}

      {/* Action success message */}
      {actionSuccessMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-positive-line bg-positive-soft p-3 text-positive-ink">
          <CheckIcon className="size-4 shrink-0" />
          <p className="text-small font-medium">{actionSuccessMessage}</p>
        </div>
      )}

      {/* Empty Initial State */}
      {!scanResult && !isScanning && !errorMessage && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong py-8 px-4 text-center">
          <ShieldIcon className="size-8 text-muted/60 mb-2" />
          <h4 className="text-small font-semibold text-ink">Ready for AI Compliance Scan</h4>
          <p className="text-caption mt-1 max-w-md text-muted">
            Launch Gemini 3.5 Flash to inspect the creative image, extract visual copy, verify claims,
            and cross-reference approved US, UAE, Meta, TikTok, and Google policies.
          </p>
        </div>
      )}

      {/* Scan Results View */}
      {scanResult && !isScanning && (
        <div className="flex flex-col gap-4">
          {/* Metadata pill bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-subtle/60 px-3 py-2 text-caption text-muted">
            <span className="flex items-center gap-1.5 font-medium text-ink">
              <span className="size-2 rounded-full bg-positive-solid" />
              {scanResult.modelUsed || "Google Gemini"}
            </span>
            {scanResult.executionTimeMs && <span>Execution: {scanResult.executionTimeMs}ms</span>}
            <span>Version: V{versionNumber ?? 1}</span>
            <span>Target: {markets.map((m) => m.code).join(", ") || "Global"} · {platforms.map((p) => p.code).join(", ") || "Universal"}</span>
          </div>

          {/* Insufficient coverage status */}
          {scanResult.status === "INSUFFICIENT_COVERAGE" && (
            <div className="rounded-lg border border-attention-line bg-attention-soft p-4 text-attention-ink">
              <div className="flex items-center gap-2 font-semibold">
                <AlertIcon className="size-4 shrink-0" />
                <span>Insufficient policy coverage — manual review required.</span>
              </div>
              <p className="text-small mt-1 text-ink-soft">
                Zero active, verified policies currently match this creative&apos;s jurisdiction and platform parameters.
                Review the submission manually or import and approve applicable policies in the Policy Library.
              </p>
            </div>
          )}

          {/* Rate limited status */}
          {scanResult.status === "RATE_LIMITED" && (
            <div className="rounded-lg border border-attention-line bg-attention-soft p-4 text-attention-ink">
              <div className="flex items-center gap-2 font-semibold">
                <AlertIcon className="size-4 shrink-0" />
                <span>Gemini API Rate Limit Reached</span>
              </div>
              <p className="text-small mt-1 text-ink-soft">
                {scanResult.summary}
              </p>
            </div>
          )}

          {/* Summary Box */}
          {scanResult.summary && scanResult.status === "SUCCESS" && (
            <div className="rounded-lg border border-line bg-subtle/40 p-3.5">
              <p className="text-eyebrow text-muted mb-1">Executive Summary</p>
              <p className="text-small font-medium text-ink">{scanResult.summary}</p>
            </div>
          )}

          {/* OCR Visual Text Chips */}
          {scanResult.extractedVisualText.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-eyebrow text-muted">Extracted Visual Text (OCR)</p>
              <div className="flex flex-wrap gap-1.5">
                {scanResult.extractedVisualText.map((t, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded-md border border-line bg-surface px-2.5 py-1 text-caption font-mono text-ink shadow-2xs"
                    title={t.location ? `Location: ${t.location}` : undefined}
                  >
                    &ldquo;{t.text}&rdquo;
                    {t.location && <span className="ml-1 text-meta text-muted">({t.location})</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Detected Claims */}
          {scanResult.detectedClaims.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-eyebrow text-muted">Detected Claims & Promotional Statements</p>
              <div className="flex flex-wrap gap-1.5">
                {scanResult.detectedClaims.map((c, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-caption text-ink shadow-2xs"
                  >
                    <span className="font-semibold text-brand-800 text-meta">[{c.category}]</span>
                    <span>{c.claimText}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Grounded Policy Findings List */}
          <div className="flex flex-col gap-2.5 border-t border-line pt-3">
            <div className="flex items-center justify-between">
              <p className="text-eyebrow text-muted">
                Grounded Policy Suggestions ({visibleFindings.length})
              </p>
              <span className="text-meta text-muted">Strict Grounding Enforced</span>
            </div>

            {visibleFindings.length === 0 ? (
              <div className="rounded-lg border border-line bg-subtle/30 p-4 text-center">
                <p className="text-small text-muted">
                  No policy violations detected among approved, verified policies for this creative.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {visibleFindings.map((f) => {
                  const isAccepted = acceptedFindingIds.has(f.id);
                  return (
                    <div
                      key={f.id}
                      className={cn(
                        "flex flex-col gap-2.5 rounded-xl border p-4 shadow-2xs transition-colors",
                        isAccepted
                          ? "border-positive-line/70 bg-positive-soft/30"
                          : "border-line bg-surface"
                      )}
                    >
                      {/* Finding Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <SeverityBadge severity={f.severity} />
                          <span className="rounded-md bg-subtle px-2 py-0.5 text-record font-mono font-semibold text-ink ring-1 ring-line ring-inset">
                            {f.policyCitation.ruleCode}
                          </span>
                          <span className="text-meta text-muted">
                            {f.policyCitation.authorityType}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-meta text-muted font-medium">
                            {Math.round(f.confidenceScore * 100)}% Confidence
                          </span>
                        </div>
                      </div>

                      {/* Issue & Explanation */}
                      <div>
                        <h4 className="text-card-title font-semibold text-ink">{f.issue}</h4>
                        <p className="text-small mt-1 text-ink-soft whitespace-pre-line">{f.explanation}</p>
                      </div>

                      {/* Official Legal Citation Callout */}
                      <div className="rounded-lg border border-line bg-subtle/50 p-2.5 text-caption">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-ink">
                            Official Source: {f.policyCitation.sectionReference}
                          </span>
                          {f.policyCitation.officialUrl && (
                            <a
                              href={f.policyCitation.officialUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-brand-700 hover:text-brand-800 font-medium"
                            >
                              <span>Official Doc</span>
                              <ExternalLinkIcon className="size-3" />
                            </a>
                          )}
                        </div>
                        {f.policyCitation.excerpt && (
                          <p className="mt-1 italic text-muted text-meta">
                            &ldquo;{f.policyCitation.excerpt}&rdquo;
                          </p>
                        )}
                      </div>

                      {/* Remediation Action */}
                      <div className="rounded-lg bg-surface border border-line px-3 py-2 text-small">
                        <span className="text-eyebrow text-muted block mb-0.5">Recommended Remediation</span>
                        <p className="font-medium text-ink">{f.actionDetails}</p>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-1 border-t border-line/60">
                        {isAccepted ? (
                          <span className="inline-flex items-center gap-1.5 text-small font-medium text-positive-ink">
                            <CheckIcon className="size-4" />
                            <span>Accepted into Draft Review Findings</span>
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            {inReview && (
                              <button
                                type="button"
                                onClick={() => handleAcceptFinding(f)}
                                disabled={isAccepting}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-small font-medium text-white hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50 transition-colors shadow-2xs"
                              >
                                <CheckIcon className="size-3.5" />
                                <span>Accept Finding</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDismissFinding(f.id)}
                              className="rounded-lg border border-line px-2.5 py-1.5 text-caption font-medium text-muted hover:bg-subtle hover:text-ink transition-colors"
                            >
                              Dismiss
                            </button>
                          </div>
                        )}
                        <span className="text-meta text-muted">
                          {isAccepted ? "Published finding remains under reviewer authority" : "Requires human confirmation"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: AISuggestedFinding["severity"] }) {
  const styles: Record<AISuggestedFinding["severity"], string> = {
    CRITICAL: "bg-danger-soft text-danger-ink border-danger-line",
    MAJOR: "bg-attention-soft text-attention-ink border-attention-line",
    MODERATE: "bg-brand-50 text-brand-900 border-brand-200",
    MINOR: "bg-subtle text-muted border-line",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-record font-semibold uppercase tracking-wider",
        styles[severity]
      )}
    >
      {severity}
    </span>
  );
}
