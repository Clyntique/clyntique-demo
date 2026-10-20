import "server-only";
import type {
  AIScanStatus,
  ExternalDestinationType,
  ExternalOutcomeKind,
  ExternalRecordBasis,
  ReviewCycleReason,
  ReviewOutcome,
} from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import type { AISuggestedFinding, DetectedClaim, ExtractedVisualText } from "@/lib/ai/types";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/workflow/policy";
import { overallExternalStatus, statusByDestination, submissionStatus, type ExternalStatusKey } from "@/lib/workflow/external";
import { creativeScope } from "./workspace";

/*
 * Lifecycle reads (Oct 19 sprint): AI scan history, review cycles, external
 * submissions and outcomes, for the review record and the submission page.
 * Same scope as every workspace read (creativeScope): TEAM never gets a
 * client's draft, a CLIENT only their own submissions.
 *
 * Visibility of AI output is decided HERE:
 * - TEAM gets the full scan (claims, suggestions, rules checked).
 * - CLIENT gets only that a scan ran, on which version, with which outcome
 *   status, and the codes of the approved rules it was checked against. AI
 *   suggestions reach a client only through the human-review workflow (as
 *   published findings), never from here.
 */

export type ScanView = {
  id: string;
  versionNumber: number;
  cycleNumber: number | null;
  roundNumber: number | null;
  status: AIScanStatus;
  createdAt: Date;
  initiatedByName: string;
  modelUsed: string | null;
  promptVersion: string | null;
  rulesChecked: { ruleCode: string; ruleVersionNumber: number; ruleVersionId: string; title: string }[];
  /** TEAM only; empty for clients. */
  summary: string | null;
  extractedVisualText: ExtractedVisualText[];
  detectedClaims: DetectedClaim[];
  suggestedFindings: AISuggestedFinding[];
  discardedSuggestions: number;
};

export type CycleView = {
  id: string;
  number: number;
  openedAt: Date;
  closedAt: Date | null;
  openedByName: string;
  reasonKind: ReviewCycleReason | null;
  openedReason: string | null;
  triggerRule: { code: string; versionNumber: number; title: string } | null;
  roundCount: number;
  finalOutcome: ReviewOutcome | null;
  finalAt: Date | null;
};

export type ExternalOutcomeView = {
  id: string;
  kind: ExternalOutcomeKind;
  outcomeOn: Date;
  note: string | null;
  basis: ExternalRecordBasis;
  recordedByName: string;
  recordedAt: Date;
  evidence: { id: string; title: string } | null;
};

export type ExternalSubmissionView = {
  id: string;
  destinationType: ExternalDestinationType;
  destinationName: string;
  platformName: string | null;
  marketName: string | null;
  versionNumber: number;
  cycleNumber: number | null;
  submittedOn: Date;
  externalReference: string | null;
  note: string | null;
  basis: ExternalRecordBasis;
  recordedByName: string;
  recordedAt: Date;
  status: ExternalStatusKey;
  outcomes: ExternalOutcomeView[]; // oldest first
};

export type Lifecycle = {
  scans: ScanView[]; // newest first
  cycles: CycleView[]; // oldest first
  external: ExternalSubmissionView[]; // newest first
  externalStatus: ExternalStatusKey;
  externalByDestination: Record<ExternalDestinationType, ExternalStatusKey>;
  /** Whether this viewer may record an external submission or outcome now. */
  canRecordExternal: boolean;
  /** TEAM only: a new review cycle may be opened now. */
  canReopen: boolean;
  /** Versions the team reviewed (part of a submitted round), for the external-submission form. */
  reviewedVersions: { id: string; versionNumber: number }[];
  /** Shared, active evidence of this submission, for attaching an outcome document. */
  evidenceOptions: { id: string; title: string }[];
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Thrown when the lifecycle tables don't exist in the connected database
 * (the Oct 19 migration has not been applied there yet). Pages show a plain
 * notice instead of a 500; nothing else on the site depends on these tables.
 */
export class LifecycleUnavailableError extends Error {
  constructor() {
    super("The lifecycle records migration has not been applied to this database.");
    this.name = "LifecycleUnavailableError";
  }
}

export function isMissingTable(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
}

export async function getLifecycle(user: CurrentUser, creativeId: string): Promise<Lifecycle | null> {
  if (!creativeId || typeof creativeId !== "string") return null;
  const creative = await prisma.creative.findFirst({
    where: { AND: [{ id: creativeId, workflow: "SUBMISSION_REVIEW" }, creativeScope(user)] },
    select: { id: true, status: true, project: { select: { clientId: true } } },
  });
  if (!creative) return null;
  const team = user.role === "TEAM";

  const [scans, cycles, external, rounds, evidence] = await Promise.all([
    prisma.aIScanRun.findMany({
      where: { creativeId: creative.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        modelUsed: true,
        promptVersion: true,
        summary: true,
        extractedVisualText: true,
        detectedClaims: true,
        suggestedFindings: true,
        discardedSuggestions: true,
        version: { select: { versionNumber: true } },
        cycle: { select: { number: true } },
        round: { select: { number: true } },
        initiatedBy: { select: { name: true } },
        rulesChecked: { select: { ruleCode: true, ruleVersionNumber: true, ruleVersionId: true, ruleVersion: { select: { title: true } } } },
      },
    }),
    prisma.reviewCycle.findMany({
      where: { creativeId: creative.id },
      orderBy: { number: "asc" },
      select: {
        id: true,
        number: true,
        openedAt: true,
        closedAt: true,
        openedReason: true,
        reasonKind: true,
        openedBy: { select: { name: true, role: true } },
        triggerRuleVersion: { select: { versionNumber: true, title: true, rule: { select: { code: true } } } },
        _count: { select: { rounds: true } },
        decisions: { where: { kind: "FINAL" }, orderBy: { createdAt: "desc" }, take: 1, select: { outcome: true, createdAt: true } },
      },
    }),
    prisma.externalSubmission.findMany({
      where: { creativeId: creative.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        destinationType: true,
        destinationName: true,
        submittedOn: true,
        externalReference: true,
        note: true,
        basis: true,
        createdAt: true,
        platform: { select: { name: true } },
        market: { select: { name: true } },
        version: { select: { versionNumber: true } },
        cycle: { select: { number: true } },
        recordedBy: { select: { name: true, role: true } },
        outcomes: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            kind: true,
            outcomeOn: true,
            note: true,
            basis: true,
            createdAt: true,
            recordedBy: { select: { name: true, role: true } },
            evidence: { select: { id: true, title: true, visibility: true } },
          },
        },
      },
    }),
    prisma.submissionRound.findMany({
      where: { creativeId: creative.id },
      distinct: ["versionId"],
      orderBy: { submittedAt: "desc" },
      select: { versionId: true, version: { select: { versionNumber: true } } },
    }),
    prisma.evidence.findMany({
      where: { creativeId: creative.id, withdrawnAt: null, ...(team ? {} : { visibility: "SHARED" as const }) },
      orderBy: { createdAt: "asc" },
      select: { id: true, title: true },
    }),
  ]).catch((error: unknown) => {
    if (isMissingTable(error)) throw new LifecycleUnavailableError();
    throw error;
  });

  // A client sees reviewer names as "Clyntique reviewer", as elsewhere.
  const who = (name: string, role: string) => (team || role === "CLIENT" ? name : "Clyntique reviewer");

  const facts = { id: creative.id, workflow: "SUBMISSION_REVIEW" as const, status: creative.status, projectClientId: creative.project.clientId };
  const completed = cycles.some((c) => c.closedAt !== null);
  const canRecordExternal = completed && authorize(user, team ? "RECORD_EXTERNAL" : "REPORT_EXTERNAL", facts).ok;
  const canReopen = team && authorize(user, "REOPEN_REVIEW", facts).ok && cycles.length > 0 && cycles.every((c) => c.closedAt !== null);

  const externalViews: ExternalSubmissionView[] = external.map((s) => ({
    id: s.id,
    destinationType: s.destinationType,
    destinationName: s.destinationName,
    platformName: s.platform?.name ?? null,
    marketName: s.market?.name ?? null,
    versionNumber: s.version.versionNumber,
    cycleNumber: s.cycle?.number ?? null,
    submittedOn: s.submittedOn,
    externalReference: s.externalReference,
    note: s.note,
    basis: s.basis,
    recordedByName: who(s.recordedBy.name, s.recordedBy.role),
    recordedAt: s.createdAt,
    status: submissionStatus(s),
    outcomes: s.outcomes.map((o) => ({
      id: o.id,
      kind: o.kind,
      outcomeOn: o.outcomeOn,
      note: o.note,
      basis: o.basis,
      recordedByName: who(o.recordedBy.name, o.recordedBy.role),
      recordedAt: o.createdAt,
      // A client never learns of an internal (team-only) evidence item through an outcome.
      evidence: o.evidence && (team || o.evidence.visibility === "SHARED") ? { id: o.evidence.id, title: o.evidence.title } : null,
    })),
  }));

  return {
    scans: scans.map((s) => ({
      id: s.id,
      versionNumber: s.version.versionNumber,
      cycleNumber: s.cycle?.number ?? null,
      roundNumber: s.round?.number ?? null,
      status: s.status,
      createdAt: s.createdAt,
      initiatedByName: who(s.initiatedBy.name, "TEAM"),
      modelUsed: team ? s.modelUsed : null,
      promptVersion: team ? s.promptVersion : null,
      rulesChecked: s.rulesChecked.map((r) => ({ ruleCode: r.ruleCode, ruleVersionNumber: r.ruleVersionNumber, ruleVersionId: r.ruleVersionId, title: r.ruleVersion.title })),
      summary: team ? s.summary : null,
      extractedVisualText: team ? asArray<ExtractedVisualText>(s.extractedVisualText) : [],
      detectedClaims: team ? asArray<DetectedClaim>(s.detectedClaims) : [],
      suggestedFindings: team ? asArray<AISuggestedFinding>(s.suggestedFindings) : [],
      discardedSuggestions: team ? s.discardedSuggestions : 0,
    })),
    cycles: cycles.map((c) => ({
      id: c.id,
      number: c.number,
      openedAt: c.openedAt,
      closedAt: c.closedAt,
      openedByName: who(c.openedBy.name, c.openedBy.role),
      reasonKind: c.reasonKind,
      openedReason: c.openedReason,
      triggerRule: c.triggerRuleVersion ? { code: c.triggerRuleVersion.rule.code, versionNumber: c.triggerRuleVersion.versionNumber, title: c.triggerRuleVersion.title } : null,
      roundCount: c._count.rounds,
      finalOutcome: c.decisions[0]?.outcome ?? null,
      finalAt: c.decisions[0]?.createdAt ?? null,
    })),
    external: externalViews,
    externalStatus: overallExternalStatus(external),
    externalByDestination: statusByDestination(external),
    canRecordExternal,
    canReopen,
    reviewedVersions: rounds.map((r) => ({ id: r.versionId, versionNumber: r.version.versionNumber })).sort((a, b) => b.versionNumber - a.versionNumber),
    evidenceOptions: evidence,
  };
}

/** TEAM: approved rule versions a reviewer may cite when opening a policy-change re-review. */
export async function getCitableRuleVersions(user: CurrentUser): Promise<{ id: string; label: string }[]> {
  if (user.role !== "TEAM") return [];
  const versions = await prisma.policyRuleVersion.findMany({
    where: { status: { in: ["ACTIVE", "DEPRECATED"] } },
    orderBy: [{ rule: { code: "asc" } }, { versionNumber: "desc" }],
    take: 200,
    select: { id: true, versionNumber: true, title: true, status: true, rule: { select: { code: true } } },
  });
  return versions.map((v) => ({ id: v.id, label: `${v.rule.code} v${v.versionNumber} · ${v.title}${v.status === "DEPRECATED" ? " (superseded)" : ""}` }));
}

/**
 * TEAM: the compact scan history for the AI panel (serialisable for the client
 * component). Same scope as getLifecycle; CLIENT gets nothing from here.
 */
export async function getScanHistory(user: CurrentUser, creativeId: string): Promise<ScanHistoryEntry[]> {
  // The submission page must keep working on a database without the
  // lifecycle tables (e.g. a Preview before the migration is applied).
  try {
    return await loadScanHistory(user, creativeId);
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
}

export type ScanHistoryEntry = Awaited<ReturnType<typeof loadScanHistory>>[number];

async function loadScanHistory(user: CurrentUser, creativeId: string) {
  if (user.role !== "TEAM" || !creativeId) return [];
  const creative = await prisma.creative.findFirst({
    where: { AND: [{ id: creativeId, workflow: "SUBMISSION_REVIEW" }, creativeScope(user)] },
    select: { id: true },
  });
  if (!creative) return [];
  const scans = await prisma.aIScanRun.findMany({
    where: { creativeId: creative.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      createdAt: true,
      modelUsed: true,
      promptVersion: true,
      detectedClaims: true,
      suggestedFindings: true,
      version: { select: { versionNumber: true } },
      cycle: { select: { number: true } },
      initiatedBy: { select: { name: true } },
      rulesChecked: { select: { ruleCode: true, ruleVersionNumber: true } },
    },
  });
  return scans.map((s) => ({
    id: s.id,
    versionNumber: s.version.versionNumber,
    cycleNumber: s.cycle?.number ?? null,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    initiatedByName: s.initiatedBy.name,
    modelUsed: s.modelUsed,
    promptVersion: s.promptVersion,
    rulesChecked: s.rulesChecked.map((r) => `${r.ruleCode} v${r.ruleVersionNumber}`),
    suggestedCount: asArray(s.suggestedFindings).length,
    claimCount: asArray(s.detectedClaims).length,
  }));
}
