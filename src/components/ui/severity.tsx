import type { FindingSeverity, FindingStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";
import { FINDING_STATUS_LABEL, SEVERITY_CAPTION, SEVERITY_LABEL } from "@/lib/workflow/labels";
import { TonePill, type Tone } from "./status-badge";

// Severity is shown as a small square marker plus its label, a different
// visual form from status pills, so the two never compete for the same colour.
const MARKER: Record<FindingSeverity, string> = {
  HIGH: "bg-critical-solid",
  MEDIUM: "bg-attention-solid",
  LOW: "bg-ink-soft/45",
  ADVISORY: "bg-transparent ring-[1.5px] ring-inset ring-faint",
};

export function SeverityMarker({ severity, className }: { severity: FindingSeverity; className?: string }) {
  return (
    <span title={SEVERITY_CAPTION} className={cn("inline-flex items-center gap-1.5 text-caption font-medium text-ink-soft whitespace-nowrap", className)}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-[2px]", MARKER[severity])} />
      {SEVERITY_LABEL[severity]}
      <span className="sr-only"> severity</span>
    </span>
  );
}

// Finding state reuses the four status tones: open = the client needs to act,
// responded = with Clyntique, resolved = done, withdrawn = neutral.
const FINDING_TONE: Record<Exclude<FindingStatus, "DRAFT">, Tone> = {
  OPEN: "attention",
  RESPONDED: "accent",
  RESOLVED: "positive",
  DISMISSED: "neutral",
};

export function FindingStatusPill({ status, className }: { status: FindingStatus; className?: string }) {
  if (status === "DRAFT") {
    return (
      <span className={cn("inline-flex h-[22px] items-center rounded-full border border-dashed border-line-strong px-2 text-caption font-medium text-muted", className)}>
        Draft · team only
      </span>
    );
  }
  return (
    <TonePill tone={FINDING_TONE[status]} className={className}>
      {FINDING_STATUS_LABEL[status]}
    </TonePill>
  );
}
