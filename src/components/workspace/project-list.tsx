import type { Role } from "@/generated/prisma/enums";
import Link from "next/link";
import type { ProjectSummary } from "@/lib/data/workspace";
import { basePathFor } from "@/lib/navigation";
import { Badge } from "@/components/ui/badge";
import { formatRelative, pluralize } from "@/lib/format";
import { ReviewProgress } from "@/components/ui/review-progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { projectStatus } from "./copy";

// Compact table used on the dashboard. Collapses to stacked rows on small screens.
export function ProjectTable({
  projects,
  role,
  now,
}: {
  projects: ProjectSummary[];
  role: Role;
  now: number;
}) {
  const team = role === "TEAM";
  const cols = team
    ? "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.2fr)_9.5rem_6.5rem]"
    : "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_9.5rem_6.5rem]";

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
      <div className={`text-label hidden gap-6 border-b border-line bg-canvas/60 px-5 py-2.5 lg:grid ${cols}`}>
        <span>Project</span>
        {team && <span>Client</span>}
        <span>Progress</span>
        <span>{team ? "Status" : "Needs review"}</span>
        <span className="text-right">Last activity</span>
      </div>
      <ul className="divide-y divide-line">
        {projects.map((p) => {
          const needsReview = p.statusCounts.IN_REVIEW ?? 0;
          return (
            <li key={p.id}>
              <Link
                href={`${basePathFor(role)}/projects/${p.id}`}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-4 transition-colors hover:bg-canvas/60 lg:items-center lg:gap-6 ${cols}`}
              >
                <div className="min-w-0 max-lg:col-span-2">
                  <p className="text-card-title truncate">{p.name}</p>
                  <p className="text-meta mt-0.5">
                    {team && <span className="lg:hidden">{p.clientName} · </span>}
                    {pluralize(p.creativeCount, "creative")}
                  </p>
                </div>
                {team && <p className="text-body truncate text-ink-soft max-lg:hidden">{p.clientName}</p>}
                <ReviewProgress counts={p.statusCounts} className="max-lg:col-span-2" />
                <div>
                  {team ? (
                    <ProjectStatus project={p} />
                  ) : needsReview ? (
                    <span className="inline-flex h-6 items-center rounded-full bg-brand-50 px-2.5 text-xs font-medium text-brand-700 ring-1 ring-brand-200 ring-inset">
                      {pluralize(needsReview, "creative")}
                    </span>
                  ) : (
                    <span className="text-meta">Nothing waiting</span>
                  )}
                </div>
                <p className="text-meta lg:text-right">{formatRelative(p.lastActivityAt, now)}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Full project list used on the Projects page.
export function ProjectList({
  projects,
  role,
  now,
}: {
  projects: ProjectSummary[];
  role: Role;
  now: number;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {projects.map((p) => (
        <li key={p.id}>
          <Link
            href={`${basePathFor(role)}/projects/${p.id}`}
            className="block rounded-lg border border-line bg-surface p-5 shadow-card transition-shadow hover:border-line-strong hover:shadow-pop"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
              <div className="min-w-0 lg:w-[38%]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-section-title truncate">
                      {p.clientName} — {p.name}
                    </h2>
                    <p className="text-meta mt-0.5">
                      {pluralize(p.creativeCount, "creative")}
                    </p>
                  </div>
                  <ProjectStatus project={p} className="lg:hidden" />
                </div>
              </div>
              <ReviewProgress counts={p.statusCounts} showLegend className="flex-1" />
              <div className="flex items-center justify-between gap-4 lg:w-48 lg:flex-col lg:items-end lg:gap-1.5">
                <ProjectStatus project={p} className="max-lg:hidden" />
                <p className="text-meta">Last activity {formatRelative(p.lastActivityAt, now).toLowerCase()}</p>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Overall status, or a neutral marker for a project with nothing in it yet.
export function ProjectStatus({ project, className }: { project: ProjectSummary; className?: string }) {
  if (!project.creativeCount) return <Badge tone="outline" className={className}>No creatives yet</Badge>;
  return <StatusBadge status={projectStatus(project.statusCounts)} className={className} />;
}
