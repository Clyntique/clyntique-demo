import Link from "next/link";
import type { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";
import { getDemoSnapshot } from "@/lib/demo-data";
import { basePathFor } from "@/lib/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClasses } from "@/components/ui/button";
import { FolderIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/states";
import { DemoDataNotice } from "@/components/workspace/demo-notice";
import { ProjectList } from "@/components/workspace/project-list";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function ProjectsView({ role, searchParams }: { role: Role; searchParams: SearchParams }) {
  await requireRole(role);
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  const { now, projects: all } = getDemoSnapshot(role);
  const projects = query
    ? all.filter((p) => `${p.clientName} ${p.name}`.toLowerCase().includes(query.toLowerCase()))
    : all;

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
            // Project creation arrives in a later phase.
            <Button disabled title="Available in a later phase">
              <PlusIcon /> New project
            </Button>
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
        <ProjectList projects={projects} now={now} />
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
              ? "Projects you create will appear here."
              : "Projects shared with you will appear here."
          }
        />
      )}
      <DemoDataNotice />
    </>
  );
}
