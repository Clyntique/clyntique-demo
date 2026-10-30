"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { coveragePreviewServerAction, type CoveragePreview } from "@/lib/policy/actions";
import { RULE_INDUSTRY_LABEL } from "@/lib/policy/labels";

// Read-only check: which approved, verified rules the AI would be given for a
// market / platform / industry scope. It uses the same boundary as a real
// scan (coveragePreviewServerAction), so an empty pair here means the AI
// reports insufficient coverage there. It never matches claims or scores.

const MARKETS = [
  { code: "US", name: "United States" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "CA", name: "Canada" },
];
const PLATFORMS = [
  { code: "META", name: "Meta" },
  { code: "GOOGLE", name: "Google Ads" },
  { code: "TIKTOK", name: "TikTok" },
];
const INDUSTRIES = [
  { code: "HEALTHCARE", name: "Healthcare" },
  { code: "MEDICAL_AESTHETICS", name: "Medical aesthetics" },
  { code: "OTHER", name: "Other" },
];

function toggle(list: string[], code: string) {
  return list.includes(code) ? list.filter((c) => c !== code) : [...list, code];
}

function Chips({ options, value, onChange }: { options: { code: string; name: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.code} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-caption text-ink">
          <input type="checkbox" checked={value.includes(o.code)} onChange={() => onChange(toggle(value, o.code))} />
          {o.name}
        </label>
      ))}
    </div>
  );
}

export function CoverageCheck() {
  const [markets, setMarkets] = useState<string[]>(["US", "AE"]);
  const [platforms, setPlatforms] = useState<string[]>(["META", "GOOGLE", "TIKTOK"]);
  const [industry, setIndustry] = useState("MEDICAL_AESTHETICS");
  const [result, setResult] = useState<CoveragePreview | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      setResult(await coveragePreviewServerAction({ markets, platforms, industry }));
    });

  const name = (list: { code: string; name: string }[], code: string | null) => (code ? list.find((o) => o.code === code)?.name ?? code : "Any");

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-small text-muted">
        See which rules the AI would be given for a submission in this scope. Only rules that are approved, verified by a
        different admin, in effect and backed by verified sources count. Where nothing applies, the AI says it has
        insufficient policy coverage instead of guessing.
      </p>
      <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
        <div className="space-y-1.5">
          <span className="text-small font-medium text-ink-soft">Markets</span>
          <Chips options={MARKETS} value={markets} onChange={setMarkets} />
        </div>
        <div className="space-y-1.5">
          <span className="text-small font-medium text-ink-soft">Platforms</span>
          <Chips options={PLATFORMS} value={platforms} onChange={setPlatforms} />
        </div>
        <div className="space-y-1.5">
          <span className="text-small font-medium text-ink-soft">Industry</span>
          <div className="flex flex-wrap gap-2">
            {INDUSTRIES.map((o) => (
              <label key={o.code} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-caption text-ink">
                <input type="radio" name="coverage-industry" checked={industry === o.code} onChange={() => setIndustry(o.code)} />
                {o.name}
              </label>
            ))}
          </div>
        </div>
        <Button size="sm" variant="primary" onClick={run} disabled={pending}>{pending ? "Checking…" : "Check coverage"}</Button>
      </div>

      {result && (
        <div className="space-y-3">
          <p className="text-caption text-muted">
            Rules written for: {result.industries.map((i) => RULE_INDUSTRY_LABEL[i] ?? i).join(", ")}.
          </p>
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <table className="w-full border-collapse text-left text-small">
              <thead>
                <tr className="border-b border-line bg-subtle/50 text-caption font-semibold text-muted">
                  <th className="px-4 py-2.5">Market</th>
                  <th className="px-4 py-2.5">Platform</th>
                  <th className="px-4 py-2.5">Coverage</th>
                  <th className="px-4 py-2.5">Rules the AI would use</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.pairs.map((p) => (
                  <tr key={`${p.market}-${p.platform}`}>
                    <td className="px-4 py-2.5">{name(MARKETS, p.market)}</td>
                    <td className="px-4 py-2.5">{name(PLATFORMS, p.platform)}</td>
                    <td className="px-4 py-2.5">
                      {p.covered ? (
                        <span className="text-emerald-800">Covered{p.platformRuleCodes.length === 0 ? " (no platform rule yet)" : ""}</span>
                      ) : (
                        <span className="text-amber-800">Insufficient coverage</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-caption">{p.ruleCodes.length ? p.ruleCodes.join(", ") : "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.ruleCodes.length === 0 && <p className="text-small text-amber-800">{result.insufficientMessage}</p>}
        </div>
      )}
    </div>
  );
}
