"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  SparklesIcon,
  AlertIcon,
  CheckIcon,
  ShieldIcon,
  ExternalLinkIcon,
  ClockIcon,
} from "@/components/ui/icons";
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
  /** Persisted scans of this creative, newest first (Oct 19 sprint). */
  history?: ScanHistoryEntry[];
  /** Where the full record (all scans, rule versions, cycles) lives. */
  recordHref?: string;
}

export type ScanHistoryEntry = {
  id: string;
  versionNumber: number;
  cycleNumber: number | null;
  status: "SUCCESS" | "INSUFFICIENT_COVERAGE" | "RATE_LIMITED" | "ERROR";
  createdAt: string;
  initiatedByName: string;
  modelUsed: string | null;
  promptVersion: string | null;
  rulesChecked: string[];
  suggestedCount: number;
  claimCount: number;
};

const SCAN_STATUS_LABEL: Record<ScanHistoryEntry["status"], string> = {
  SUCCESS: "Completed",
  INSUFFICIENT_COVERAGE: "No verified rules covered this scope",
  RATE_LIMITED: "Not run (service busy)",
  ERROR: "Failed",
};

export function AICompliancePanel({
  creativeId,
  versionId,
  versionNumber,
  inReview,
  markets,
  platforms,
  history = [],
  recordHref,
}: AICompliancePanelProps) {
  const router = useRouter();
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
      // Every run is persisted (even failures), so reload the scan history below.
      router.refresh();
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
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-xs">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-200/60 shadow-2xs">
            <SparklesIcon className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-ink">Gemini AI Compliance Assistant</h3>
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-micro font-semibold text-brand-800">
                TEAM Only
              </span>
            </div>
            <p className="text-caption text-muted">
              Multimodal image and text evaluation grounded strictly in active, approved compliance policies.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => handleRunScan(Boolean(scanResult))}
          disabled={isScanning}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-small font-medium transition-all shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
            isScanning
              ? "cursor-not-allowed bg-subtle text-muted"
              : "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800"
          )}
        >
          <SparklesIcon className={cn("size-4", isScanning && "animate-spin")} />
          <span>{isScanning ? "Scanning Creative..." : scanResult ? "Re-run AI Scan" : "Run AI Scan"}</span>
        </button>
      </div>

      {/* Honest Scanning Indicator: Single request server action */}
      {isScanning && (
        <div className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50/50 p-5 text-brand-900 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-brand-100 text-brand-800 animate-pulse">
              <SparklesIcon className="size-4.5 animate-spin" />
            </div>
            <div>
              <p className="text-small font-semibold text-brand-900">
                Analyzing creative with Google Gemini...
              </p>
              <p className="text-caption text-brand-700">
                Evaluating advertising visuals, extracting OCR copy, and verifying claims against approved compliance rules.
              </p>
            </div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-brand-200/70">
            <div className="h-full w-1/2 rounded-full bg-brand-600 animate-[pulse_1.5s_ease-in-out_infinite]" />
          </div>
        </div>
      )}

      {/* Global error banner */}
      {errorMessage && (
        <div className="flex items-start gap-3 rounded-xl border border-danger-line bg-danger-soft p-4 text-danger-ink shadow-xs">
          <AlertIcon className="size-5 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-small font-semibold">Scan Error</p>
            <p className="text-caption mt-0.5 break-words text-danger-ink/90">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Action success message */}
      {actionSuccessMessage && (
        <div className="flex items-center gap-2.5 rounded-xl border border-positive-line bg-positive-soft p-3.5 text-positive-ink shadow-xs">
          <CheckIcon className="size-4 shrink-0" />
          <p className="text-small font-medium">{actionSuccessMessage}</p>
        </div>
      )}

      {/* Empty Initial State */}
      {!scanResult && !isScanning && !errorMessage && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong py-10 px-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
            <ShieldIcon className="size-6" />
          </div>
          <h4 className="text-small font-semibold text-ink">Ready for AI Compliance Scan</h4>
          <p className="text-caption mt-1.5 max-w-md text-muted leading-relaxed">
            Execute Google Gemini multimodal analysis to inspect the creative image, extract visual text,
            detect promotional claims, and check them only against active, verified policies in the Policy Library.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-micro text-muted">
            <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">Multimodal OCR</span>
            <span>·</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">Grounded Citations</span>
            <span>·</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 font-medium">Human-in-the-Loop</span>
          </div>
        </div>
      )}

      {/* Scan Results View */}
      {scanResult && !isScanning && (
        <div className="flex flex-col gap-5">
          {/* Metadata pill bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-slate-50/80 px-4 py-2.5 text-caption text-muted">
            <div className="flex items-center gap-2 font-medium text-slate-800">
              {/* Green only for a completed scan; a failed or partial one never looks healthy. */}
              <span
                aria-hidden
                className={`size-2 rounded-full ${
                  scanResult.status === "SUCCESS" ? "bg-emerald-500" : scanResult.status === "ERROR" ? "bg-red-600" : "bg-amber-500"
                }`}
              />
              <span>Model: <span className="font-mono text-ink font-semibold">{scanResult.modelUsed || "Google Gemini"}</span></span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-caption text-slate-600">
              {scanResult.executionTimeMs && (
                <span className="inline-flex items-center gap-1">
                  <ClockIcon className="size-3.5 text-slate-400" />
                  <span>{scanResult.executionTimeMs}ms latency</span>
                </span>
              )}
              <span>Version: V{versionNumber ?? 1}</span>
              <span>Target: {markets.map((m) => m.code).join(", ") || "Global"} · {platforms.map((p) => p.code).join(", ") || "Universal"}</span>
            </div>
          </div>

          {/* Insufficient coverage status */}
          {scanResult.status === "INSUFFICIENT_COVERAGE" && (
            <div className="rounded-xl border border-attention-line bg-attention-soft p-5 text-attention-ink shadow-xs">
              <div className="flex items-start gap-3">
                <AlertIcon className="size-5 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-small font-semibold">
                    Insufficient policy coverage — manual review required
                  </h4>
                  <p className="text-caption text-slate-700 leading-relaxed">
                    Zero active, approved policies in the database currently match this creative&apos;s target jurisdiction and platform parameters.
                    The AI review engine strictly requires approved policies to prevent hallucinated compliance violations.
                  </p>
                  <div className="pt-2">
                    <Link
                      href="/admin/policy-library"
                      className="inline-flex items-center gap-1.5 text-small font-semibold text-brand-700 hover:text-brand-900"
                    >
                      <span>Manage & Approve Policies in Library</span>
                      <ExternalLinkIcon className="size-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Failed scan: never shown as "no findings" */}
          {scanResult.status === "ERROR" && (
            <div role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-5 text-danger-ink shadow-xs">
              <div className="flex items-center gap-2.5 font-semibold text-small">
                <AlertIcon className="size-5 shrink-0" />
                <span>AI scan failed — manual review required</span>
              </div>
              <p className="text-caption mt-1.5 text-slate-700">
                {scanResult.summary || "The AI scan did not complete."} No findings were produced, so nothing about this creative has been checked by AI.
              </p>
            </div>
          )}

          {/* Rate limited status */}
          {scanResult.status === "RATE_LIMITED" && (
            <div className="rounded-xl border border-attention-line bg-attention-soft p-5 text-attention-ink shadow-xs">
              <div className="flex items-center gap-2.5 font-semibold text-small">
                <AlertIcon className="size-5 shrink-0" />
                <span>Gemini API Rate Limit Reached</span>
              </div>
              <p className="text-caption mt-1.5 text-slate-700">
                {scanResult.summary || "The rate limit for Google Gemini API has been reached. Please wait a moment and try again."}
              </p>
            </div>
          )}

          {/* Executive Summary */}
          {scanResult.summary && scanResult.status === "SUCCESS" && (
            <div className="rounded-xl border border-line bg-slate-50/50 p-4">
              <p className="text-micro font-semibold uppercase tracking-wider text-muted mb-1.5">AI Summary · not a compliance decision</p>
              <p className="text-small font-medium text-ink leading-relaxed">{scanResult.summary}</p>
              {scanResult.rulesChecked && scanResult.rulesChecked.length > 0 && (
                <p className="text-caption mt-2 text-muted">
                  Checked against {scanResult.rulesChecked.length} approved {scanResult.rulesChecked.length === 1 ? "policy" : "policies"}:{" "}
                  {scanResult.rulesChecked.map((r) => `${r.code} v${r.versionNumber}`).join(", ")}
                  {scanResult.discardedSuggestions ? `. ${scanResult.discardedSuggestions} suggestion(s) discarded for citing no approved policy.` : "."}
                </p>
              )}
            </div>
          )}

          {/* OCR Visual Text Chips */}
          {scanResult.extractedVisualText.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-micro font-semibold uppercase tracking-wider text-muted">Extracted Visual Text (OCR)</p>
                <span className="text-micro text-muted">{scanResult.extractedVisualText.length} text fragments found</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {scanResult.extractedVisualText.map((t, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded-lg border border-line bg-surface px-3 py-1 text-caption font-mono text-ink shadow-2xs"
                    title={t.location ? `Location: ${t.location}` : undefined}
                  >
                    &ldquo;{t.text}&rdquo;
                    {t.location && <span className="ml-1.5 text-micro text-muted">({t.location})</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Detected Claims */}
          {scanResult.detectedClaims.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-micro font-semibold uppercase tracking-wider text-muted">Detected Promotional Statements & Claims</p>
                <span className="text-micro text-muted">{scanResult.detectedClaims.length} claims identified</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {scanResult.detectedClaims.map((c, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-caption text-ink shadow-2xs"
                  >
                    <span className="rounded bg-brand-50 px-1.5 py-0.5 text-micro font-semibold text-brand-800">
                      {c.category}
                    </span>
                    <span>&ldquo;{c.claimText}&rdquo;</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Grounded Policy Findings List (successful scans only) */}
          {scanResult.status === "SUCCESS" && (
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h4 className="text-small font-semibold text-ink">
                  Grounded Compliance Findings ({visibleFindings.length})
                </h4>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-micro font-medium text-emerald-700">
                  Strict Grounding
                </span>
              </div>
              <span className="text-caption text-muted">Reviewer decision required</span>
            </div>

            {visibleFindings.length === 0 ? (
              <div className="rounded-xl border border-line bg-slate-50/50 p-6 text-center">
                <div className="flex size-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mx-auto mb-2">
                  <CheckIcon className="size-4" />
                </div>
                <p className="text-small font-medium text-ink">
                  No AI suggestions
                </p>
                <p className="text-caption mt-0.5 text-muted">
                  Nothing was flagged against the approved policies checked. This is not a compliance clearance; the reviewer still decides.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {visibleFindings.map((f) => {
                  const isAccepted = acceptedFindingIds.has(f.id);
                  return (
                    <div
                      key={f.id}
                      className={cn(
                        "flex flex-col gap-3 rounded-xl border p-5 shadow-2xs transition-all",
                        isAccepted
                          ? "border-positive-line/80 bg-positive-soft/20"
                          : "border-line bg-surface hover:border-slate-300"
                      )}
                    >
                      {/* Finding Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <SeverityBadge severity={f.severity} />
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-record font-mono font-semibold text-slate-800">
                            {f.policyCitation.ruleCode}
                          </span>
                          <span className="text-caption font-medium text-muted">
                            {f.policyCitation.authorityType.replace("_", " ")}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-caption font-semibold text-slate-700">
                            {Math.round(f.confidenceScore * 100)}% Confidence
                          </span>
                        </div>
                      </div>

                      {/* Issue & Explanation */}
                      <div>
                        <h5 className="text-base font-semibold text-ink">{f.issue}</h5>
                        <p className="text-small mt-1 text-slate-600 leading-relaxed whitespace-pre-line">{f.explanation}</p>
                      </div>

                      {/* Official Legal Citation Callout */}
                      <div className="rounded-lg border border-line bg-slate-50/80 p-3 text-caption">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-ink">
                            Policy citation: {f.policyCitation.ruleCode}
                            {f.policyCitation.ruleVersionNumber ? ` v${f.policyCitation.ruleVersionNumber}` : ""}
                            {f.policyCitation.sectionReference ? ` · ${f.policyCitation.sectionReference}` : ""}
                          </span>
                          {f.policyCitation.officialUrl && (
                            <a
                              href={f.policyCitation.officialUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-brand-700 hover:text-brand-900"
                            >
                              <span>Source</span>
                              <ExternalLinkIcon className="size-3" />
                            </a>
                          )}
                        </div>
                        {f.policyCitation.excerpt && (
                          <p className="mt-1.5 italic text-slate-600 border-l-2 border-slate-300 pl-2">
                            &ldquo;{f.policyCitation.excerpt}&rdquo;
                          </p>
                        )}
                      </div>

                      {/* Recommended Remediation */}
                      <div className="rounded-lg bg-surface border border-line p-3 text-small">
                        <span className="text-micro font-semibold uppercase tracking-wider text-muted block mb-1">
                          Recommended Action Details
                        </span>
                        <p className="font-medium text-ink">{f.actionDetails}</p>
                      </div>

                      {/* Actions & Decision Authority */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-line/60">
                        {isAccepted ? (
                          <span className="inline-flex items-center gap-1.5 text-small font-medium text-positive-ink">
                            <CheckIcon className="size-4" />
                            <span>Accepted into Draft Review Findings</span>
                          </span>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            {inReview && (
                              <button
                                type="button"
                                onClick={() => handleAcceptFinding(f)}
                                disabled={isAccepting}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-small font-medium text-white hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50 transition-colors shadow-2xs"
                              >
                                <CheckIcon className="size-3.5" />
                                <span>Accept Finding</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDismissFinding(f.id)}
                              className="rounded-lg border border-line px-3 py-1.5 text-caption font-medium text-muted hover:bg-subtle hover:text-ink transition-colors"
                            >
                              Dismiss
                            </button>
                          </div>
                        )}
                        <span className="text-caption text-muted">
                          {isAccepted ? "Draft finding: team-only until you request changes or complete the review" : "Requires human reviewer confirmation"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* Scan history: every persisted run, with the rule versions it was checked against (Oct 19 sprint). */}
      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-small font-semibold text-ink">Scan history</h4>
          {recordHref && (
            <Link href={recordHref} className="text-caption text-brand-700 hover:underline">
              Full review record
            </Link>
          )}
        </div>
        {history.length === 0 ? (
          <p className="text-caption text-muted">No scan has been recorded for this submission yet. Every run is kept, including failures and runs with no rule coverage.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {history.slice(0, 8).map((h) => (
              <li key={h.id} className="rounded-lg border border-line bg-subtle/40 px-3 py-2 text-caption">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-ink">
                    V{h.versionNumber}
                    {h.cycleNumber != null ? ` · cycle ${h.cycleNumber}` : ""}
                  </span>
                  <span className={cn("rounded-full px-2 py-0.5 text-micro font-semibold", h.status === "SUCCESS" ? "bg-positive-soft text-positive-ink" : h.status === "INSUFFICIENT_COVERAGE" ? "bg-subtle text-ink-soft" : "bg-attention-soft text-attention-ink")}>
                    {SCAN_STATUS_LABEL[h.status]}
                  </span>
                  <span className="text-muted">
                    {new Date(h.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {h.initiatedByName}
                  </span>
                </div>
                <p className="mt-0.5 text-muted">
                  {h.rulesChecked.length ? `Rules: ${h.rulesChecked.join(", ")}` : "No approved rule version covered this scope"}
                  {h.status === "SUCCESS" ? ` · ${h.claimCount} claims · ${h.suggestedCount} suggestions` : ""}
                  {h.modelUsed ? ` · ${h.modelUsed}` : ""}
                  {h.promptVersion ? ` · prompt ${h.promptVersion}` : ""}
                </p>
              </li>
            ))}
            {history.length > 8 && <li className="text-caption text-muted">{history.length - 8} older scans are on the review record.</li>}
          </ul>
        )}
      </div>
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
        "inline-flex items-center rounded-md border px-2 py-0.5 text-micro font-bold uppercase tracking-wider",
        styles[severity]
      )}
    >
      {severity}
    </span>
  );
}
