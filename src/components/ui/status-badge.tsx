import type { CreativeStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";

// One definition per status: label, tint, and dot color. The label is always
// shown, so status never depends on color alone.
export const STATUS_STYLES: Record<
  CreativeStatus,
  { label: string; badge: string; dot: string; bar: string }
> = {
  DRAFT: {
    label: "Draft",
    badge: "bg-zinc-100 text-zinc-700 ring-zinc-200",
    dot: "bg-zinc-400",
    bar: "bg-zinc-300",
  },
  IN_REVIEW: {
    label: "In Review",
    badge: "bg-sky-50 text-sky-800 ring-sky-200",
    dot: "bg-sky-500",
    bar: "bg-sky-400",
  },
  CHANGES_REQUESTED: {
    label: "Changes Requested",
    badge: "bg-amber-50 text-amber-800 ring-amber-200",
    dot: "bg-amber-500",
    bar: "bg-amber-400",
  },
  APPROVED: {
    label: "Approved",
    badge: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
  },
  ARCHIVED: {
    label: "Archived",
    badge: "bg-white text-zinc-500 ring-zinc-200",
    dot: "border border-zinc-400 bg-transparent",
    bar: "bg-zinc-200",
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: CreativeStatus;
  className?: string;
}) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        style.badge,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", style.dot)} />
      {style.label}
    </span>
  );
}
