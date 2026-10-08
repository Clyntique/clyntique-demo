import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AlertIcon } from "./icons";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-subtle", className)} />;
}

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
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-subtle text-muted [&_svg]:size-5">
          {icon}
        </span>
      )}
      <p className="text-card-title">{title}</p>
      {description && <p className="text-meta mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
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
      <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-red-50 text-red-600 [&_svg]:size-5">
        <AlertIcon />
      </span>
      <p className="text-card-title">{title}</p>
      {description && <p className="text-meta mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
