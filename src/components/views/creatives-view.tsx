import Link from "next/link";
import type { CreativeStatus, Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";
import { getCreatives } from "@/lib/data/workspace";
import { requestTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { basePathFor } from "@/lib/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ImageIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/states";
import { STATUS_STYLES } from "@/components/ui/status-badge";
import { CreativeCard } from "@/components/workspace/creative-card";
import type { SearchParams } from "./projects-view";

const FILTERS: Record<Role, CreativeStatus[]> = {
  TEAM: ["IN_REVIEW", "CHANGES_REQUESTED", "APPROVED", "DRAFT"],
  CLIENT: ["IN_REVIEW", "CHANGES_REQUESTED", "APPROVED"],
};

export async function CreativesView({ role, searchParams }: { role: Role; searchParams: SearchParams }) {
  const user = await requireRole(role);
  const { status } = await searchParams;
  const active = FILTERS[role].find((s) => s === status);

  const all = await getCreatives(user);
  const now = requestTime();
  const creatives = active ? all.filter((c) => c.status === active) : all;
  const href = `${basePathFor(role)}/creatives`;

  const tabs = [
    { label: "All", value: undefined, count: all.length },
    ...FILTERS[role].map((s) => ({
      label: role === "CLIENT" && s === "IN_REVIEW" ? "Needs your review" : STATUS_STYLES[s].label,
      value: s,
      count: all.filter((c) => c.status === s).length,
    })),
  ];

  return (
    <>
      <PageHeader
        title="Creatives"
        description={
          role === "TEAM"
            ? "Every creative across your projects, with its latest version and review state."
            : "Creatives shared with you, and where each one is in review."
        }
      />

      <nav aria-label="Filter by status" className="-mx-4 mb-6 overflow-x-auto px-4">
        <ul className="flex gap-1 border-b border-line">
          {tabs.map((t) => {
            const selected = t.value === active;
            return (
              <li key={t.label}>
                <Link
                  href={t.value ? `${href}?status=${t.value}` : href}
                  aria-current={selected ? "page" : undefined}
                  className={cn(
                    "-mb-px flex h-10 items-center gap-2 border-b-2 px-3 text-[13px] font-medium whitespace-nowrap transition-colors",
                    selected
                      ? "border-brand-600 text-ink"
                      : "border-transparent text-muted hover:text-ink",
                  )}
                >
                  {t.label}
                  <span className="rounded-sm bg-subtle px-1.5 text-[11px] text-muted tabular-nums">{t.count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {creatives.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {creatives.map((c) => (
            <CreativeCard key={c.id} creative={c} role={role} now={now} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<ImageIcon />}
          title={active ? "No creatives with this status." : "No creatives yet."}
          description={
            role === "TEAM"
              ? "Add creatives from a project page."
              : "Creatives shared with you for review will appear here."
          }
        />
      )}
    </>
  );
}
