import { cn } from "@/lib/cn";

// Two offset frames: a creative and its next version.
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md bg-brand-600 text-white",
        className,
      )}
    >
      <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <rect x="3" y="6" width="9" height="11" rx="1.5" opacity={0.55} />
        <rect x="8" y="3" width="9" height="11" rx="1.5" fill="currentColor" fillOpacity={0.15} />
      </svg>
    </span>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="text-[15px] font-semibold tracking-tight text-ink">Clyntique</span>
    </span>
  );
}
