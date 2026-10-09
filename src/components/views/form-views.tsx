import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/dal";
import { getClientOptions, getProject } from "@/lib/data/workspace";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { ProjectForm } from "@/components/forms/project-form";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";

// TEAM-only creation pages. The actions re-check the role on submit.
// Creatives are created by clients as submissions. Team creation on a client's
// behalf is deferred (D6), so the old "Add creative" page only explains that.

export async function NewProjectView() {
  const user = await requireRole("TEAM");
  const clients = await getClientOptions(user);

  return (
    <div className="max-w-2xl">
      <Breadcrumb trail={[{ label: "Projects", href: "/admin/projects" }]} current="New project" />
      <PageHeader title="New project" description="Set up a campaign and choose the client who reviews it." />
      {clients.length ? (
        <Card className="p-6">
          <ProjectForm clients={clients} />
        </Card>
      ) : (
        <EmptyState
          title="No client accounts yet."
          description="A project needs a client to review it. Client accounts are created by the Clyntique team."
        />
      )}
    </div>
  );
}

export async function NewCreativeView({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requireRole("TEAM");
  const { projectId } = await params;
  const project = await getProject(user, projectId);
  if (!project) notFound();

  return (
    <div className="max-w-2xl">
      <Breadcrumb
        trail={[
          { label: "Projects", href: "/admin/projects" },
          { label: project.name, href: `/admin/projects/${project.id}` },
        ]}
        current="New creative"
      />
      <PageHeader title="Add creative" description={`${project.clientName} — ${project.name}`} />
      <EmptyState
        title="Creatives are now submitted by the client."
        description={`${project.clientName} creates submissions in this project, uploads the creative and submits it. It appears here for review once submitted.`}
        action={
          <Link href={`/admin/projects/${project.id}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
            Back to project
          </Link>
        }
      />
    </div>
  );
}
