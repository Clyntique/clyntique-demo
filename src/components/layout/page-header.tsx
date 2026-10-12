import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// Page title block. `size="lg"` is for the two dashboards; every other page
// uses the standard title so screens share one rhythm.
export function PageHeader({
  title,
  description,
  action,
  eyebrow,
  size = "md",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Short context above the title, e.g. the workspace or client name. */
  eyebrow?: ReactNode;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <header className={cn("mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-small mb-1 text-muted">{eyebrow}</p>}
        <h1 className={cn(size === "lg" ? "text-display" : "text-page-title", "text-balance text-ink")}>{title}</h1>
        {description && <p className="text-body mt-1.5 max-w-2xl text-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}
