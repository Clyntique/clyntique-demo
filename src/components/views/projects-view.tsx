import Link from "next/link";
import type { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";
import { getProjects } from "@/lib/data/workspace";
import { requestTime } from "@/lib/format";
import { basePathFor } from "@/lib/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClasses } from "@/components/ui/button";
import { FolderIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { ProjectList } from "@/components/workspace/project-list";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function ProjectsView({ role, searchParams }: { role: Role; searchParams: SearchParams }) {
  const user = await requireRole(role);
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  const projects = await getProjects(user, query);
  const now = requestTime();

  return (
    <>
      <PageHeader
        title="Projects"
        description={
          role === "TEAM"
            ? "Manage campaigns and review activity in one place."
            : "Every campaign you're reviewing, and where each one stands."
        }
        action={
          role === "TEAM" && (
            <Link href="/admin/projects/new" className={buttonClasses()}>
              <PlusIcon /> New project
            </Link>
          )
        }
      />

      <form role="search" className="mb-6 flex max-w-sm gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search projects or clients"
          aria-label="Search projects"
          icon={<SearchIcon />}
          className="flex-1"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {projects.length ? (
        <ProjectList projects={projects} role={role} now={now} />
      ) : query ? (
        <EmptyState
          icon={<SearchIcon />}
          title={`No projects match “${query}”.`}
          description="Try a different project or client name."
          action={
            <Link href={`${basePathFor(role)}/projects`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Clear search
            </Link>
          }
        />
      ) : (
        <EmptyState
          icon={<FolderIcon />}
          title="No projects yet."
          description={
            role === "TEAM"
              ? "Create a project for a client to start sharing creatives."
              : "Projects shared with you will appear here."
          }
          action={
            role === "TEAM" && (
              <Link href="/admin/projects/new" className={buttonClasses({ size: "sm" })}>
                <PlusIcon /> New project
              </Link>
            )
          }
        />
      )}
    </>
  );
}
