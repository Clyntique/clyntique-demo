import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

// A panel: hairline border on a white surface. Used for content that needs to
// be set apart, not as a wrapper for every block.
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-lg border border-line bg-surface shadow-xs", className)} {...props} />;
}

// Header row for a card or page section: title on the left, optional action on the right.
export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-4 gap-y-1", className)}>
      <div className="min-w-0">
        <h2 className="text-section-title text-ink">{title}</h2>
        {description && <p className="text-small mt-0.5 text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
