import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/*
 * A titled list of rows: the main building block of the dashboards and
 * queues. The header carries the count, so numbers always sit next to the
 * items they count. `tone="attention"` marks the one group that needs the
 * viewer to act.
 */
export function ListGroup({
  title,
  count,
  meta,
  action,
  tone = "default",
  empty,
  children,
  className,
}: {
  title: string;
  count?: number;
  meta?: ReactNode;
  action?: ReactNode;
  tone?: "default" | "attention";
  /** Shown instead of rows when there are none. */
  empty?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const hasRows = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-lg border bg-surface",
        tone === "attention" ? "border-attention-line" : "border-line",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b px-4 py-2.5",
          tone === "attention" ? "border-attention-line bg-attention-soft" : "border-line",
        )}
      >
        <h2 className={cn("text-small font-semibold", tone === "attention" ? "text-attention-ink" : "text-ink")}>
          {title}
          {count !== undefined && <span className="text-record ml-2 font-normal text-muted">{count}</span>}
        </h2>
        <div className="flex items-baseline gap-3">
          {meta && <span className="text-caption text-muted">{meta}</span>}
          {action}
        </div>
      </div>
      {hasRows ? <ul className="divide-y divide-line">{children}</ul> : <div className="text-small px-4 py-4 text-muted">{empty}</div>}
    </section>
  );
}

export function ListRow({
  href,
  thumb,
  title,
  subtitle,
  aside,
}: {
  href: string;
  thumb?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none">
        {thumb}
        <div className="min-w-0 flex-1">
          <p className="text-card-title truncate text-ink">{title}</p>
          {subtitle && <p className="text-caption mt-0.5 truncate text-muted">{subtitle}</p>}
        </div>
        {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
      </Link>
    </li>
  );
}

/** Text link styled for group headers and section actions. */
export function QuietLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-caption rounded-sm font-medium text-brand-700 hover:text-brand-900">
      {children}
    </Link>
  );
}
