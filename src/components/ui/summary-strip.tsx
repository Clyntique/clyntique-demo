import Link from "next/link";
import { cn } from "@/lib/cn";

export type SummaryItem = { label: string; value: number; note: string; href?: string; tone?: "default" | "attention" };

/*
 * One "ledger" panel of counts at the top of a dashboard. Every number comes
 * from the list it links to, so the strip and the lists always agree.
 */
export function SummaryStrip({ items, label }: { items: SummaryItem[]; label: string }) {
  return (
    <section aria-label={label} className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface lg:grid-cols-4">
      {items.map((item, i) => {
        const body = (
          <>
            <span className="text-micro font-semibold tracking-[0.12em] text-muted uppercase">{item.label}</span>
            <span className="flex items-baseline gap-2.5">
              <span className={cn("text-[2rem] leading-10 font-semibold tabular-nums", item.tone === "attention" && item.value ? "text-attention-ink" : "text-ink")}>
                {item.value}
              </span>
              <span className="text-caption text-muted">{item.note}</span>
            </span>
          </>
        );
        const cell = cn(
          "flex flex-col gap-1.5 px-5 py-4",
          // Hairlines between cells: a column rule, and a row rule on the 2×2 phone layout.
          i % 2 === 1 && "border-l border-line",
          i >= 2 && "border-t border-line lg:border-t-0",
          i === 2 && "lg:border-l",
        );
        return item.href ? (
          <Link key={item.label} href={item.href} className={cn(cell, "transition-colors hover:bg-canvas")}>
            {body}
          </Link>
        ) : (
          <div key={item.label} className={cell}>
            {body}
          </div>
        );
      })}
    </section>
  );
}
