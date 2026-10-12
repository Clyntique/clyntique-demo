import { cn } from "@/lib/cn";

/*
 * The Clyntique mark: "Viewfinder", four crop corners around a focal point,
 * a creative under close review (approved 12 Oct 2026).
 *
 * Two drawings of the same mark, checked by rasterising at real size:
 * - regular (28 px and up): lighter strokes, glyph at ~62% of the tile;
 * - small (under 24 px, and the favicon): heavier strokes, shorter corners
 *   and a larger dot at ~88% of the tile, so the four corners stay distinct
 *   at 16 px instead of blurring together.
 * The favicon (src/app/icon.svg) uses the small drawing.
 */
const REGULAR = {
  d: "M3 7.25V4.5A1.5 1.5 0 0 1 4.5 3h2.75M12.75 3h2.75A1.5 1.5 0 0 1 17 4.5v2.75M17 12.75v2.75a1.5 1.5 0 0 1-1.5 1.5h-2.75M7.25 17H4.5A1.5 1.5 0 0 1 3 15.5v-2.75",
  stroke: 2,
  dot: 2.1,
  glyph: "size-[62%]",
};
const SMALL = {
  d: "M3.5 7.5V5a1.5 1.5 0 0 1 1.5-1.5h2.5M12.5 3.5H15A1.5 1.5 0 0 1 16.5 5v2.5M16.5 12.5V15a1.5 1.5 0 0 1-1.5 1.5h-2.5M7.5 16.5H5A1.5 1.5 0 0 1 3.5 15v-2.5",
  stroke: 2.6,
  dot: 2.6,
  glyph: "size-[88%]",
};

export function BrandMark({ className, size = "md", tone = "accent" }: { className?: string; size?: "sm" | "md" | "lg"; tone?: "accent" | "ink" }) {
  const drawing = size === "sm" ? SMALL : REGULAR;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center text-white",
        size === "sm" ? "size-4 rounded-[4px]" : size === "lg" ? "size-14 rounded-xl" : "size-7 rounded-md",
        tone === "accent" ? "bg-brand-600" : "bg-ink",
        className,
      )}
    >
      <svg viewBox="0 0 20 20" className={drawing.glyph} fill="none" stroke="currentColor" strokeWidth={drawing.stroke} strokeLinecap="round" strokeLinejoin="round">
        <path d={drawing.d} />
        <circle cx="10" cy="10" r={drawing.dot} fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

export function Brand({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={size} />
      <span className={cn("font-semibold tracking-tight text-ink", size === "lg" ? "text-[1.375rem]" : "text-[15px]")}>Clyntique</span>
    </span>
  );
}
