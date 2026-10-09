import "server-only";
import type { CurrentUser } from "@/lib/auth/dal";
import { creativeScope } from "@/lib/data/workspace";
import { prisma } from "@/lib/prisma";
import type { SubmissionFacts } from "@/lib/workflow/policy";

/*
 * Authorization for a single creative, shared by pages, server actions and
 * route handlers. Uses the same scope as the workspace lists:
 * - TEAM may access every creative except clients' draft submissions.
 * - CLIENT may access only creatives in their own projects, including their
 *   own draft submissions but never legacy (team) drafts.
 * Anything else returns null, so callers answer "not found" for both missing
 * and forbidden creatives.
 */

export async function findAccessibleCreative(user: CurrentUser, creativeId: string) {
  if (!creativeId || typeof creativeId !== "string") return null;
  return prisma.creative.findFirst({
    where: { AND: [{ id: creativeId }, creativeScope(user)] },
    select: {
      id: true,
      name: true,
      status: true,
      workflow: true,
      projectId: true,
      project: { select: { name: true, clientId: true } },
    },
  });
}

export type AccessibleCreative = NonNullable<Awaited<ReturnType<typeof findAccessibleCreative>>>;

/** Facts for the submission-review policy (src/lib/workflow/policy.ts). */
export function submissionFacts(c: AccessibleCreative): SubmissionFacts {
  return { id: c.id, workflow: c.workflow, status: c.status, projectClientId: c.project.clientId };
}

/** A version the user may see: it must belong to a creative they can access. */
export async function findAccessibleVersion(user: CurrentUser, versionId: string) {
  if (!versionId || typeof versionId !== "string") return null;
  return prisma.creativeVersion.findFirst({
    where: { id: versionId, creative: creativeScope(user) },
    select: {
      id: true,
      creativeId: true,
      fileUrl: true,
      mimeType: true,
    },
  });
}

/** The highest version number of a creative, or 0 when it has no file yet. */
export async function latestVersionNumber(creativeId: string) {
  const latest = await prisma.creativeVersion.findFirst({
    where: { creativeId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  return latest?.versionNumber ?? 0;
}
