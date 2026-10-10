import "server-only";
import { prisma } from "@/lib/prisma";
import { resubmissionGaps, type Unmet } from "./findings";

/*
 * Resubmission readiness for one review cycle, shared by the resubmit command
 * and the client's checklist so both always agree. Only what the client did
 * since the latest change request counts (see resubmissionGaps).
 */

export type Readiness = {
  gaps: Unmet[];
  /** When the latest change request was made (null if none). */
  requestedAt: Date | null;
  latestVersionNumber: number;
};

export async function loadReadiness(creativeId: string, cycleId: string): Promise<Readiness> {
  const [request, latest] = await Promise.all([
    prisma.reviewDecision.findFirst({
      where: { cycleId, kind: "CHANGES_REQUESTED" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, version: { select: { versionNumber: true } } },
    }),
    prisma.creativeVersion.findFirst({ where: { creativeId }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } }),
  ]);
  const since = request?.createdAt ?? new Date(0);

  const findings = await prisma.finding.findMany({
    where: { cycleId, status: { in: ["OPEN", "RESPONDED"] } },
    select: {
      id: true,
      status: true,
      severity: true,
      requiredAction: true,
      version: { select: { versionNumber: true } },
      _count: {
        select: {
          responses: { where: { author: { role: "CLIENT" }, createdAt: { gt: since } } },
          evidence: { where: { linkedAt: { gt: since }, evidence: { withdrawnAt: null, visibility: "SHARED" } } },
        },
      },
    },
  });

  const latestVersionNumber = latest?.versionNumber ?? 0;
  const gaps = resubmissionGaps(
    findings.map((f) => ({
      id: f.id,
      status: f.status,
      severity: f.severity,
      requiredAction: f.requiredAction,
      requestedOnVersion: Math.max(request?.version?.versionNumber ?? 0, f.version?.versionNumber ?? 0) || null,
      clientResponses: f._count.responses,
      linkedEvidence: f._count.evidence,
    })),
    latestVersionNumber,
  );
  return { gaps, requestedAt: request?.createdAt ?? null, latestVersionNumber };
}
