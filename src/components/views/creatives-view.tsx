import Link from "next/link";
import type { CreativeStatus, Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";
import { getCreatives } from "@/lib/data/workspace";
import { requestTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { basePathFor } from "@/lib/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { ImageIcon, PlusIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/states";
import { STATUS_STYLES } from "@/components/ui/status-badge";
import { CreativeCard } from "@/components/workspace/creative-card";
import type { SearchParams } from "./projects-view";

// Tabs with no creatives are hidden, so legacy and new statuses can share one list.
const FILTERS: Record<Role, CreativeStatus[]> = {
  TEAM: ["SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED", "REVIEW_COMPLETE", "APPROVED", "DRAFT"],
  CLIENT: ["DRAFT", "SUBMITTED", "IN_REVIEW", "CHANGES_REQUESTED", "REVIEW_COMPLETE", "APPROVED"],
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
    ...FILTERS[role]
      .map((s) => ({ label: STATUS_STYLES[s].label, value: s, count: all.filter((c) => c.status === s).length }))
      .filter((t) => t.count > 0 || t.value === active),
  ];

  return (
    <>
      <PageHeader
        title={role === "TEAM" ? "Creatives" : "Submissions"}
        description={
          role === "TEAM"
            ? "Submitted work across your projects, plus earlier creatives. Client drafts stay private until submitted."
            : "Your submissions and drafts, and where each one is in review."
        }
        action={
          role === "CLIENT" && (
            <Link href="/dashboard/submissions/new" className={buttonClasses()}>
              <PlusIcon /> New submission
            </Link>
          )
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
          title={active ? "Nothing with this status." : role === "TEAM" ? "Nothing submitted yet." : "No submissions yet."}
          description={
            role === "TEAM"
              ? "Client submissions appear here once they are submitted for review."
              : "Create a submission to upload a creative and send it for review."
          }
        />
      )}
    </>
  );
}
