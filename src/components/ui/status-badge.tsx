import type { CreativeStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";

/*
 * Status uses four tones, each with one meaning across the app:
 * - neutral:   not started, or no longer active (draft, archived)
 * - accent:    with Clyntique (submitted, in review; legacy "in review")
 * - attention: the client needs to act (changes requested)
 * - positive:  done (review complete; legacy approved)
 * The label is always shown, so status never depends on colour alone.
 */
export type Tone = "neutral" | "accent" | "attention" | "positive";

export const TONE_STYLES: Record<Tone, { pill: string; dot: string; bar: string }> = {
  neutral: { pill: "bg-subtle text-ink-soft", dot: "bg-faint", bar: "bg-line-strong" },
  accent: { pill: "bg-brand-100 text-brand-800", dot: "bg-brand-600", bar: "bg-brand-500" },
  attention: { pill: "bg-attention-soft text-attention-ink", dot: "bg-attention-solid", bar: "bg-attention-solid" },
  positive: { pill: "bg-positive-soft text-positive-ink", dot: "bg-positive-solid", bar: "bg-positive-solid" },
};

export const STATUS_STYLES: Record<CreativeStatus, { label: string; tone: Tone; badge: string; dot: string; bar: string }> = Object.fromEntries(
  (
    [
      ["DRAFT", "Draft", "neutral"],
      ["SUBMITTED", "Submitted", "accent"],
      ["IN_REVIEW", "In review", "accent"],
      ["CHANGES_REQUESTED", "Changes requested", "attention"],
      ["REVIEW_COMPLETE", "Review complete", "positive"],
      ["APPROVED", "Approved", "positive"],
      ["ARCHIVED", "Archived", "neutral"],
    ] as const
  ).map(([status, label, tone]) => [status, { label, tone, badge: TONE_STYLES[tone].pill, dot: TONE_STYLES[tone].dot, bar: TONE_STYLES[tone].bar }]),
) as Record<CreativeStatus, { label: string; tone: Tone; badge: string; dot: string; bar: string }>;

/** A rounded pill with a dot: the one way status is shown. */
export function TonePill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] items-center gap-1.5 rounded-full px-2 text-caption font-medium whitespace-nowrap", TONE_STYLES[tone].pill, className)}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", TONE_STYLES[tone].dot)} />
      {children}
    </span>
  );
}

export function StatusBadge({ status, label, className }: { status: CreativeStatus; label?: string; className?: string }) {
  const style = STATUS_STYLES[status];
  return (
    <TonePill tone={style.tone} className={className}>
      {label ?? style.label}
    </TonePill>
  );
}
