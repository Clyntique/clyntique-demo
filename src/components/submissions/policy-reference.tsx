import type { PolicyReferenceView } from "@/lib/data/submission-review";
import { POLICY_REFERENCE_NOTICE } from "@/lib/workflow/labels";
import { ExternalLinkIcon } from "@/components/ui/icons";

// A cited Policy Library rule version, for findings and Clyntique evidence
// (both roles). The data is already the client-safe projection
// (src/lib/data/submission-review.ts): summary and official sources only.

function formatDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function PolicyReference({ policy }: { policy: PolicyReferenceView }) {
  return (
    <div className="mt-3 rounded-lg border border-line bg-surface px-3.5 py-3">
      <p className="text-eyebrow mb-1">Policy reference</p>
      <p className="text-small font-medium break-words text-ink">
        <span className="text-record text-muted">
          {policy.ruleCode} v{policy.versionNumber}
        </span>{" "}
        {policy.title}
      </p>
      <p className="text-meta mt-0.5">
        {[policy.jurisdictionCode, policy.platformCode, policy.authorityType === "PLATFORM_POLICY" ? "Platform policy" : policy.authorityType === "REGULATION" ? "Regulation" : "Internal risk guidance"]
          .filter(Boolean)
          .join(" · ")}
        {policy.superseded && " · a newer version of this policy has since been approved"}
      </p>
      <p className="text-small mt-1.5 break-words whitespace-pre-line text-ink-soft">{policy.summary}</p>
      {policy.restrictedClaims.length > 0 && (
        <p className="text-small mt-1.5 text-ink-soft">
          <span className="font-medium text-ink">Restricted claims:</span> {policy.restrictedClaims.join("; ")}
        </p>
      )}
      {policy.substantiationRequirements.length > 0 && (
        <p className="text-small mt-1 text-ink-soft">
          <span className="font-medium text-ink">Evidence usually needed:</span> {policy.substantiationRequirements.join("; ")}
        </p>
      )}
      {policy.citations.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {policy.citations.map((c, i) => (
            <li key={i} className="text-meta break-words">
              <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                {c.sourceName} · {c.sectionReference}
                <ExternalLinkIcon className="size-3" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>{" "}
              ({c.publisher}
              {c.sourceUpdatedAt ? `, page updated ${formatDate(c.sourceUpdatedAt)}` : ""})
              {c.quotation && <span className="block italic text-ink-soft">“{c.quotation}”</span>}
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption mt-2 text-muted">{POLICY_REFERENCE_NOTICE}</p>
    </div>
  );
}
