import Link from "next/link";
import type { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";
import { getDemoSnapshot, type CreativeSummary } from "@/lib/demo-data";
import { formatRelative, greetingFor, pluralize } from "@/lib/format";
import { basePathFor } from "@/lib/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { ArrowRightIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActivityList } from "@/components/workspace/activity-feed";
import { REVIEW_STATE, projectStatus } from "@/components/workspace/copy";
import { CreativeThumb } from "@/components/workspace/creative-card";
import { DemoDataNotice } from "@/components/workspace/demo-notice";
import { ProjectTable } from "@/components/workspace/project-list";
import { StatRow, type Stat } from "@/components/workspace/stat-row";

export async function DashboardView({ role }: { role: Role }) {
  const user = await requireRole(role);
  const base = basePathFor(role);
  const team = role === "TEAM";

  const { now, projects, creatives, activity: allActivity } = getDemoSnapshot(role);
  const activity = allActivity.slice(0, 6);
  const count = (s: CreativeSummary["status"]) => creatives.filter((c) => c.status === s).length;

  const stats: Stat[] = team
    ? [
        {
          label: "Active projects",
          value: projects.filter((p) => projectStatus(p.statusCounts) !== "APPROVED").length,
          hint: `${pluralize(projects.length, "project")} in total`,
        },
        { label: "In client review", value: count("IN_REVIEW"), hint: "Waiting on client feedback" },
        { label: "Changes requested", value: count("CHANGES_REQUESTED"), hint: "Feedback to address", highlight: true },
      ]
    : [
        { label: "Projects", value: projects.length, hint: "Shared with you" },
        { label: "Awaiting your review", value: count("IN_REVIEW"), hint: "Ready for your feedback", highlight: true },
        { label: "Approved", value: count("APPROVED"), hint: "Signed off and final" },
      ];

  // What this person should act on next.
  const attention = creatives.filter((c) => c.status === (team ? "CHANGES_REQUESTED" : "IN_REVIEW"));
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        title={team ? `${greetingFor()}, ${user.name}` : `Welcome back, ${firstName}`}
        description={
          team
            ? "Overview of your creative work and current review progress."
            : "Your creative review overview."
        }
        action={
          <Link href={`${base}/projects`} className={buttonClasses({ variant: "secondary" })}>
            View projects
          </Link>
        }
      />

      <div className="flex flex-col gap-10">
        <StatRow stats={stats} />

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 lg:gap-8">
          <div className="flex min-w-0 flex-col gap-10 lg:col-span-2">
            <section className="flex flex-col gap-4">
              <SectionHeader
                title={team ? "Needs revision" : "Waiting for your review"}
                description={
                  team
                    ? "Creatives where the client asked for changes."
                    : "Creatives the team has shared for your feedback."
                }
              />
              {attention.length ? (
                <Card className="divide-y divide-line">
                  {attention.map((c) => (
                    <div key={c.id} className="flex items-center gap-4 p-3 pr-5">
                      <CreativeThumb creative={c} className="size-14 shrink-0 rounded-md" />
                      <div className="min-w-0 flex-1">
                        <p className="text-card-title truncate">{c.name}</p>
                        <p className="text-meta mt-0.5 truncate">
                          {c.projectName} · V{c.version} · {formatRelative(c.updatedAt, now)}
                        </p>
                      </div>
                      <span className="hidden text-xs font-medium text-brand-700 sm:block">
                        {REVIEW_STATE[role][c.status]}
                      </span>
                      <StatusBadge status={c.status} className="sm:hidden" />
                    </div>
                  ))}
                </Card>
              ) : (
                <EmptyState
                  title="You're all caught up."
                  description={team ? "No open change requests right now." : "Nothing is waiting for your review."}
                />
              )}
            </section>

            <section className="flex flex-col gap-4">
              <SectionHeader
                title={team ? "Recent projects" : "Your projects"}
                action={
                  <Link
                    href={`${base}/projects`}
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:text-brand-900"
                  >
                    All projects <ArrowRightIcon className="size-3.5" />
                  </Link>
                }
              />
              {projects.length ? (
                <ProjectTable projects={projects.slice(0, 5)} role={role} now={now} />
              ) : (
                <EmptyState title="No projects yet." />
              )}
            </section>
          </div>

          <section className="flex flex-col gap-4">
            <SectionHeader
              title="Recent activity"
              action={
                <Link
                  href={`${base}/activity`}
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-brand-700 hover:text-brand-900"
                >
                  View all <ArrowRightIcon className="size-3.5" />
                </Link>
              }
            />
            <Card className="p-5">
              {activity.length ? (
                <ActivityList items={activity} now={now} />
              ) : (
                <p className="text-meta">No activity yet.</p>
              )}
            </Card>
          </section>
        </div>
      </div>
      <DemoDataNotice />
    </>
  );
}
