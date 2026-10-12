import "server-only";
import type { CurrentUser } from "@/lib/auth/dal";
import { creativeScope } from "@/lib/data/workspace";
import { prisma } from "@/lib/prisma";
import { submittedToTeam, teamVisibleVersions } from "@/lib/workflow/findings";
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
  const version = await prisma.creativeVersion.findFirst({
    where: { id: versionId, creative: creativeScope(user) },
    select: {
      id: true,
      creativeId: true,
      fileUrl: true,
      mimeType: true,
      createdAt: true,
      creative: { select: { workflow: true } },
    },
  });
  if (!version) return null;
  // TEAM: a client's revision is reachable only once it was part of a submission.
  if (user.role === "TEAM" && version.creative.workflow === "SUBMISSION_REVIEW") {
    const last = await prisma.submissionRound.findFirst({
      where: { creativeId: version.creativeId },
      orderBy: { submittedAt: "desc" },
      select: { submittedAt: true },
    });
    if (teamVisibleVersions([version], { workflow: "SUBMISSION_REVIEW", lastSubmittedAt: last?.submittedAt ?? null }).length === 0) return null;
  }
  return { id: version.id, creativeId: version.creativeId, fileUrl: version.fileUrl, mimeType: version.mimeType };
}

/**
 * An evidence file the user may download: the submission must be in their
 * scope, and a client only ever gets SHARED evidence. The team gets client
 * evidence only once it was part of a submission (see submittedToTeam):
 * files a client is still preparing are not reachable by direct URL either.
 */
export async function findAccessibleEvidenceFile(user: CurrentUser, evidenceId: string) {
  if (!evidenceId || typeof evidenceId !== "string") return null;
  const evidence = await prisma.evidence.findFirst({
    where: {
      id: evidenceId,
      creative: { AND: [{ workflow: "SUBMISSION_REVIEW" }, creativeScope(user)] },
      ...(user.role === "TEAM" ? {} : { visibility: "SHARED" as const }),
    },
    select: { id: true, creativeId: true, origin: true, createdAt: true, withdrawnAt: true, fileUrl: true, fileName: true, mimeType: true },
  });
  if (!evidence) return null;
  if (user.role === "TEAM" && evidence.origin === "CLIENT_SUBMITTED") {
    const last = await prisma.submissionRound.findFirst({
      where: { creativeId: evidence.creativeId },
      orderBy: { submittedAt: "desc" },
      select: { submittedAt: true },
    });
    // Withdrawn client evidence was never submitted (withdrawal is pre-submission only).
    if (!submittedToTeam(evidence.createdAt, last?.submittedAt ?? null) || evidence.withdrawnAt) return null;
  }
  return { id: evidence.id, fileUrl: evidence.fileUrl, fileName: evidence.fileName, mimeType: evidence.mimeType };
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
