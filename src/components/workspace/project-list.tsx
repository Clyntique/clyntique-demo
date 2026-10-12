import type { Role } from "@/generated/prisma/enums";
import Link from "next/link";
import type { ProjectSummary } from "@/lib/data/workspace";
import { basePathFor } from "@/lib/navigation";
import { formatRelative, pluralize } from "@/lib/format";
import { ReviewProgress } from "@/components/ui/review-progress";
import { StatusBadge, TonePill } from "@/components/ui/status-badge";
import { projectStatus } from "./copy";

// The Projects list: one bordered table. Columns on desktop, stacked rows on
// phones. Counts and progress come from the project's own creatives (client
// drafts are never included for the team).
export function ProjectList({ projects, role, now }: { projects: ProjectSummary[]; role: Role; now: number }) {
  const team = role === "TEAM";
  const cols = "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_10rem_8rem]";
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className={`text-label hidden gap-6 border-b border-line px-4 py-2.5 lg:grid ${cols}`}>
        <span>{team ? "Client and project" : "Project"}</span>
        <span>Progress</span>
        <span>Status</span>
        <span className="text-right">Last activity</span>
      </div>
      <ul className="divide-y divide-line">
        {projects.map((p) => (
          <li key={p.id}>
            <Link
              href={`${basePathFor(role)}/projects/${p.id}`}
              className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-3.5 transition-colors hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-none lg:gap-6 ${cols}`}
            >
              <div className="min-w-0">
                <p className="text-card-title truncate text-ink">{p.name}</p>
                <p className="text-caption mt-0.5 truncate text-muted">
                  {team && `${p.clientName} · `}
                  {pluralize(p.creativeCount, "submission")}
                </p>
              </div>
              <ReviewProgress counts={p.statusCounts} className="max-lg:col-span-2 max-lg:row-start-2" />
              <div className="max-lg:col-start-2 max-lg:row-start-1">
                <ProjectStatus project={p} />
              </div>
              <p className="text-record text-muted max-lg:hidden lg:text-right">{formatRelative(p.lastActivityAt, now)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Overall status, or a neutral marker for a project with nothing in it yet.
export function ProjectStatus({ project, className }: { project: ProjectSummary; className?: string }) {
  if (!project.creativeCount) {
    return (
      <TonePill tone="neutral" className={className}>
        Nothing yet
      </TonePill>
    );
  }
  return <StatusBadge status={projectStatus(project.statusCounts)} className={className} />;
}
