import type { EvidenceRecordStatus } from "@/generated/prisma/enums";
import { EVIDENCE_RECORD_STATUS_LABEL } from "@/lib/workflow/labels";
import { TonePill, type Tone } from "@/components/ui/status-badge";

/*
 * The one way a dictionary record's reviewer-check status is shown. The
 * label is always printed, so status never depends on colour alone, and the
 * wording comes from labels.ts (internal check, never a certification).
 */
export const RECORD_STATUS_TONE: Record<EvidenceRecordStatus, Tone> = {
  UNCHECKED: "neutral",
  ACCEPTED: "positive",
  NEEDS_MORE_INFO: "attention",
  NOT_ACCEPTED: "attention",
};

export function RecordStatusPill({ status, expired, className }: { status: EvidenceRecordStatus; expired?: boolean; className?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <TonePill tone={RECORD_STATUS_TONE[status]} className={className}>
        {EVIDENCE_RECORD_STATUS_LABEL[status]}
      </TonePill>
      {expired && <TonePill tone="attention">Validity date passed</TonePill>}
    </span>
  );
}

export function formatDay(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function formatDateTime(date: Date) {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
