import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { getSubmissionProjects, getTargetingOptions } from "@/lib/data/submission";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { SubmissionForm } from "@/components/submissions/submission-form";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FolderIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/states";
import type { SearchParams } from "./projects-view";

// CLIENT-only: start a new submission in one of the client's own projects.
// createSubmission (server action) re-checks the user and project ownership.
export async function NewSubmissionView({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireRole("CLIENT");
  const [{ project }, projects, targeting] = await Promise.all([searchParams, getSubmissionProjects(user), getTargetingOptions()]);
  // Only preselect a project that belongs to this client.
  const projectId = typeof project === "string" && projects.some((p) => p.id === project) ? project : undefined;

  return (
    <div className="max-w-2xl">
      <Breadcrumb trail={[{ label: "Submissions", href: "/dashboard/creatives" }]} current="New submission" />
      <PageHeader
        title="New submission"
        description="Describe your creative and where it will run. You can save an incomplete draft and come back to it."
      />
      {projects.length ? (
        <Card className="p-6">
          <SubmissionForm mode="create" projects={projects} projectId={projectId} markets={targeting.markets} platforms={targeting.platforms} />
        </Card>
      ) : (
        <EmptyState
          icon={<FolderIcon />}
          title="No project yet."
          description="Submissions belong to a project. The Clyntique team sets up your project; it will appear here once it's ready."
          action={
            <Link href="/dashboard" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Back to dashboard
            </Link>
          }
        />
      )}
    </div>
  );
}
