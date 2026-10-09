import Link from "next/link";
import { notFound } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";
import { getActivity, getCreatives, getProject } from "@/lib/data/workspace";
import { pluralize, requestTime } from "@/lib/format";
import { basePathFor } from "@/lib/navigation";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { ImageIcon, PlusIcon } from "@/components/ui/icons";
import { ReviewProgress } from "@/components/ui/review-progress";
import { EmptyState } from "@/components/ui/states";
import { ActivityList } from "@/components/workspace/activity-feed";
import { CreativeCard } from "@/components/workspace/creative-card";
import { ProjectStatus } from "@/components/workspace/project-list";
import type { SearchParams } from "./projects-view";

const SUCCESS: Record<string, string> = {
  project: "Project created. Add its first creative when you're ready.",
  creative: "Creative added.",
};

export async function ProjectDetailView({
  role,
  params,
  searchParams,
}: {
  role: Role;
  params: Promise<{ projectId: string }>;
  searchParams: SearchParams;
}) {
  const user = await requireRole(role);
  const [{ projectId }, { created }] = await Promise.all([params, searchParams]);

  // Scoped lookup: a client gets a 404 for projects that are not theirs.
  const project = await getProject(user, projectId);
  if (!project) notFound();

  const [creatives, activity] = await Promise.all([
    getCreatives(user, { projectId }),
    getActivity(user, { projectId, take: 10 }),
  ]);
  const now = requestTime();
  const team = role === "TEAM";
  const base = basePathFor(role);
  const success = typeof created === "string" ? SUCCESS[created] : undefined;
  const newSubmissionHref = `/dashboard/submissions/new?project=${project.id}`;

  return (
    <>
      <Breadcrumb trail={[{ label: "Projects", href: `${base}/projects` }]} current={project.name} />

      <PageHeader
        title={project.name}
        description={
          <>
            {team && <span className="font-medium text-ink-soft">{project.clientName}</span>}
            {team && project.description && " · "}
            {project.description}
          </>
        }
        action={
          !team && (
            <Link href={newSubmissionHref} className={buttonClasses()}>
              <PlusIcon /> New submission
            </Link>
          )
        }
      />

      {success && (
        <p role="status" className="mb-6 rounded-md bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-800 ring-1 ring-emerald-200 ring-inset">
          {success}
        </p>
      )}

      <Card className="mb-10 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-8">
        <div className="flex shrink-0 items-center gap-3">
          <ProjectStatus project={project} />
          <span className="text-meta">{pluralize(project.creativeCount, "creative")}</span>
        </div>
        <ReviewProgress counts={project.statusCounts} showLegend className="flex-1" />
      </Card>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 lg:gap-8">
        <section className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <SectionHeader
            title="Creatives"
            description={
              team
                ? "Submitted work and earlier creatives. Client drafts stay private until submitted."
                : "Your submissions and drafts, plus creatives shared with you earlier."
            }
          />
          {creatives.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {creatives.map((c) => (
                <CreativeCard key={c.id} creative={c} role={role} now={now} showProject={false} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ImageIcon />}
              title={team ? "Nothing submitted yet." : "No submissions yet."}
              description={
                team
                  ? "Submissions appear here once the client submits them for review."
                  : "Create a submission: upload your creative, choose markets and platforms, then submit it for review."
              }
              action={
                !team && (
                  <Link href={newSubmissionHref} className={buttonClasses({ size: "sm" })}>
                    <PlusIcon /> New submission
                  </Link>
                )
              }
            />
          )}
        </section>

        <section className="flex flex-col gap-4">
          <SectionHeader title="Project activity" />
          <Card className="p-5">
            {activity.length ? (
              <ActivityList items={activity} now={now} />
            ) : (
              <p className="text-meta">No activity yet.</p>
            )}
          </Card>
        </section>
      </div>
    </>
  );
}
