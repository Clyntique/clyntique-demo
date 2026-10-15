"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AlertIcon, CheckIcon, ExternalLinkIcon, ShieldIcon } from "@/components/ui/icons";
import { runGroundingServerAction } from "@/lib/policy/actions";
import type { AIGroundingResult } from "@/lib/policy/types";

const SCENARIO_PRESETS = [
  {
    name: "US Aesthetic Botox Ad (TikTok)",
    creativeTitle: "Beverly Hills Aesthetic Glow — Before & After Wrinkle Elimination",
    adCopy: "Get our celebrity Botox treatment in Beverly Hills! Guaranteed wrinkle elimination in 7 days. Recommended by top influencers with dramatic before and after results! Book today.",
    markets: ["US"],
    platforms: ["TIKTOK"],
    themes: ["BEFORE_AFTER", "PRESCRIPTION_INJECTABLE", "INFLUENCER_ENDORSEMENT"],
  },
  {
    name: "UAE Aesthetic Laser Ad (Instagram / Meta)",
    creativeTitle: "Dubai Marina Aesthetic Clinic — Laser Rejuvenation Package",
    adCopy: "Transform your skin at our luxury Dubai clinic. Advanced laser resurfacing administered by certified dermatologists. Dramatic before and after comparisons.",
    markets: ["AE"],
    platforms: ["META"],
    themes: ["BEFORE_AFTER", "CLINIC_PROCEDURE"],
  },
  {
    name: "Insufficient Coverage Demo (Japan Market)",
    creativeTitle: "Tokyo Ginza Aesthetic Clinic Skin Whitening",
    adCopy: "Premium beauty treatment available in Ginza Tokyo clinic.",
    markets: ["JP"], // Not yet in verified policy library!
    platforms: ["META"],
    themes: [],
  },
];

export function GroundingSandbox() {
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);
  const [creativeTitle, setCreativeTitle] = useState(SCENARIO_PRESETS[0].creativeTitle);
  const [adCopy, setAdCopy] = useState(SCENARIO_PRESETS[0].adCopy);
  const [markets, setMarkets] = useState<string[]>(SCENARIO_PRESETS[0].markets);
  const [platforms, setPlatforms] = useState<string[]>(SCENARIO_PRESETS[0].platforms);
  const [detectedThemes, setDetectedThemes] = useState<string[]>(SCENARIO_PRESETS[0].themes);

  const [result, setResult] = useState<AIGroundingResult | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSelectPreset = (index: number) => {
    setSelectedPresetIndex(index);
    const p = SCENARIO_PRESETS[index];
    setCreativeTitle(p.creativeTitle);
    setAdCopy(p.adCopy);
    setMarkets(p.markets);
    setPlatforms(p.platforms);
    setDetectedThemes(p.themes);
    setResult(null);
  };

  const handleRunGrounding = () => {
    startTransition(async () => {
      const res = await runGroundingServerAction({
        creativeTitle,
        adCopy,
        markets,
        platforms,
        detectedVisualThemes: detectedThemes,
      });
      setResult(res);
    });
  };

  return (
    <div className="space-y-6">
      {/* Banner / Explanation */}
      <div className="rounded-lg border border-line bg-subtle/40 p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700 mt-0.5">
            <ShieldIcon className="size-4" />
          </span>
          <div>
            <h3 className="text-small font-semibold text-ink">
              Policy-Grounded AI Compliance Engine (Deterministic Verification)
            </h3>
            <p className="text-caption text-muted mt-0.5 leading-relaxed">
              Demonstrates Requirement 6 & 11: Suggestions are deterministically bound to verified, active approved rules with exact legal citations. When policy coverage is absent or unverified for a jurisdiction or platform, an explicit <strong className="text-ink">Insufficient Coverage</strong> response triggers for human TEAM policy review.
            </p>
          </div>
        </div>
      </div>

      {/* Preset Selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-caption font-medium text-muted">Test Creative Scenarios:</span>
        {SCENARIO_PRESETS.map((preset, idx) => (
          <button
            key={preset.name}
            onClick={() => handleSelectPreset(idx)}
            className={`px-3 py-1.5 text-caption rounded-md font-medium transition-colors ${
              selectedPresetIndex === idx
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-surface border border-line text-ink hover:bg-subtle"
            }`}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* Context Inputs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card className="p-4 space-y-3.5 bg-surface">
          <h4 className="text-small font-semibold text-ink">Creative Ad Context & Copy</h4>
          <div>
            <label className="text-caption text-muted block mb-1">Creative Title</label>
            <input
              type="text"
              value={creativeTitle}
              onChange={(e) => setCreativeTitle(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-1.5 text-small text-ink focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="text-caption text-muted block mb-1">Ad Copy / Visual Text</label>
            <textarea
              rows={4}
              value={adCopy}
              onChange={(e) => setAdCopy(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2 text-small text-ink focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-caption">
            <div>
              <span className="text-muted block mb-1">Target Markets:</span>
              <span className="font-mono font-medium text-ink bg-subtle px-2 py-1 rounded inline-block">
                {markets.join(", ") || "None"}
              </span>
            </div>
            <div>
              <span className="text-muted block mb-1">Platforms:</span>
              <span className="font-mono font-medium text-ink bg-subtle px-2 py-1 rounded inline-block">
                {platforms.join(", ") || "None"}
              </span>
            </div>
          </div>

          <Button
            variant="primary"
            size="md"
            className="w-full"
            onClick={handleRunGrounding}
            disabled={isPending}
          >
            {isPending ? "Executing Deterministic Grounding..." : "Run Grounded Compliance Evaluation"}
          </Button>
        </Card>

        {/* Results Pane */}
        <div className="space-y-3">
          <h4 className="text-small font-semibold text-ink">Grounding Output & Policy Citations</h4>

          {!result ? (
            <div className="rounded-lg border border-dashed border-line-strong p-8 text-center text-muted text-small flex flex-col items-center justify-center min-h-[260px]">
              <ShieldIcon className="size-8 text-muted/40 mb-2" />
              <p>Click &quot;Run Grounded Compliance Evaluation&quot; to inspect policy retrieval.</p>
            </div>
          ) : !result.hasCoverage ? (
            /* Explicit Insufficient Coverage Response (Requirement 11) */
            <div className="rounded-lg border border-critical-line bg-critical-soft p-5 space-y-3">
              <div className="flex items-start gap-2.5">
                <AlertIcon className="size-5 text-critical-ink shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-small font-semibold text-critical-ink">
                    Explicit Insufficient Policy Coverage Response
                  </h5>
                  <p className="text-small text-critical-ink/90 mt-1 leading-relaxed">
                    {result.insufficientCoverageReason}
                  </p>
                </div>
              </div>
              <div className="rounded border border-critical-line/50 bg-surface/80 p-3 text-caption text-muted">
                <strong className="text-ink">Enforcement Guard:</strong> AI compliance suggestion generation was halted automatically because no approved, verified policy version exists for this market/scope. A Clyntique TEAM policy administrator must add and approve the relevant regulatory library before automation can run.
              </div>
            </div>
          ) : result.matches.length === 0 ? (
            <div className="rounded-lg border border-line bg-surface p-6 text-center text-muted text-small">
              <CheckIcon className="size-6 text-emerald-600 mx-auto mb-2" />
              <p className="font-medium text-ink">No policy discrepancies identified</p>
              <p className="text-caption mt-1">Creative appears consistent with active rules for the selected scope.</p>
            </div>
          ) : (
            /* Grounded Matches List */
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              <div className="flex items-center justify-between text-caption text-muted">
                <span>
                  Found <strong className="text-ink">{result.matches.length}</strong> grounded compliance {result.matches.length === 1 ? "flag" : "flags"}
                </span>
                <span className="text-emerald-700 font-medium">100% Policy Grounded</span>
              </div>

              {result.matches.map((match, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-line bg-surface p-4 shadow-xs space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-caption font-bold text-brand-700">
                          {match.ruleCode}
                        </span>
                        <Badge tone={match.suggestedSeverity === "HIGH" ? "neutral" : "outline"}>
                          {match.suggestedSeverity} Severity
                        </Badge>
                        <Badge tone="brand">v{match.versionNumber}.0</Badge>
                      </div>
                      <h5 className="text-small font-semibold text-ink mt-1">{match.ruleTitle}</h5>
                    </div>
                  </div>

                  <p className="text-caption text-ink-soft leading-relaxed">{match.issue}</p>

                  {/* Legal Source Citation */}
                  <div className="rounded bg-subtle/60 p-2.5 text-caption border border-line flex items-center justify-between gap-2">
                    <div>
                      <span className="text-muted block">Official Legal Source:</span>
                      <strong className="text-ink">{match.authorityName}</strong> ·{" "}
                      <span className="font-mono text-ink-soft">{match.sourceSection}</span>
                    </div>
                    {match.sourceUrl && (
                      <a
                        href={match.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-brand-600 hover:text-brand-800 shrink-0 inline-flex items-center gap-1 text-[11px] font-medium"
                      >
                        Verify <ExternalLinkIcon className="size-3" />
                      </a>
                    )}
                  </div>

                  {/* Remediation Action */}
                  <div className="rounded bg-gold-50/50 border border-gold-300 p-2.5 text-caption">
                    <strong className="text-gold-950 block mb-0.5">Required Action:</strong>
                    <span className="text-gold-900">{match.remediationAction}</span>
                  </div>

                  {/* Matched condition reason */}
                  <div className="text-[11px] text-muted">
                    <span>Trigger: </span>
                    {match.matchedConditions.join("; ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
