import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AlertIcon } from "./icons";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-subtle", className)} />;
}

// Empty states sit quietly inside the layout: a short statement of what will
// appear here and, when there is one, the action that gets it started.
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border border-line bg-surface/60 px-4 py-4", className)}>
      {icon && <span className="mt-0.5 text-faint [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-small font-medium text-ink-soft">{title}</p>
        {description && <p className="text-small mt-0.5 text-muted">{description}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong. Please try again.",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-lg border border-line bg-surface px-6 py-14 text-center"
    >
      <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-critical-soft text-critical-ink [&_svg]:size-5">
        <AlertIcon />
      </span>
      <p className="text-card-title">{title}</p>
      {description && <p className="text-meta mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
