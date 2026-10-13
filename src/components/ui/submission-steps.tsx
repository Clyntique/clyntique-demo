import type { CreativeStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";

/*
 * CLIENT: where a submission that is with Clyntique stands. Display only:
 * derived from its status and round, nothing the client can't already see.
 * Submitted (or Resubmitted · round N) → Waiting for / Being reviewed → Decision.
 */
export function SubmissionSteps({ status, round }: { status: CreativeStatus; round: number | null }) {
  const reviewing = status === "IN_REVIEW";
  const steps = [
    { label: round && round > 1 ? `Resubmitted · round ${round}` : "Submitted", state: "done" as const },
    { label: reviewing ? "Being reviewed" : "Waiting for a reviewer", state: "current" as const },
    { label: "Decision", state: "next" as const },
  ];
  return (
    <ol aria-label="Progress" className="mt-2.5 grid grid-cols-3 gap-2">
      {steps.map((s) => (
        <li key={s.label} aria-current={s.state === "current" ? "step" : undefined} className="flex min-w-0 flex-col gap-1.5">
          <span
            aria-hidden
            className={cn(
              "h-1 rounded-full",
              s.state === "done" && "bg-brand-600",
              s.state === "current" && (reviewing ? "bg-[linear-gradient(90deg,var(--color-brand-600)_50%,var(--color-brand-100)_50%)]" : "bg-brand-100"),
              s.state === "next" && "bg-brand-100",
            )}
          />
          <span className={cn("text-caption leading-4", s.state === "current" ? "font-semibold text-ink" : s.state === "done" ? "text-ink-soft" : "text-muted")}>
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
