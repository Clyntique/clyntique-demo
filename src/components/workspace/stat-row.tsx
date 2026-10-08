import { cn } from "@/lib/cn";

export type Stat = { label: string; value: number; hint: string; highlight?: boolean };

// Headline numbers in one quiet panel rather than a row of separate cards.
export function StatRow({ stats }: { stats: Stat[] }) {
  return (
    <dl className="grid grid-cols-3 divide-x divide-line rounded-lg border border-line bg-surface shadow-card">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col justify-between gap-1 px-3 py-3.5 sm:px-5 sm:py-4">
          <dt className="text-xs font-medium text-muted sm:text-[13px]">{s.label}</dt>
          <dd className={cn("text-2xl sm:text-[28px] sm:leading-9 font-semibold tracking-tight tabular-nums", s.highlight && "text-brand-700")}>
            {s.value}
          </dd>
          <dd className="text-meta max-sm:hidden">{s.hint}</dd>
        </div>
      ))}
    </dl>
  );
}
