import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { PolicyChangeKind, PolicyChangeProposalStatus, PolicySourceFetchOutcome } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { assertPolicyAdmin } from "../auth";
import { LIMITS } from "../validate";
import { compareSnapshots, type DiffEntry } from "./detect";
import { httpFetcher, isOfficialUrl, type SourceFetcher } from "./fetcher";

/*
 * Policy source monitoring: the database side.
 *
 * Guarantees:
 * 1. A check fetches only the source's registered official URL, once, and
 *    appends one PolicySourceSnapshot whatever the outcome.
 * 2. A meaningful difference from the previous good snapshot, a redirect, a
 *    404, or repeated access failures open ONE PolicySourceChangeProposal
 *    (PENDING_REVIEW) for a policy admin. Nothing else is written: no rule,
 *    rule version or source verification status is ever edited here.
 * 3. Review decisions are recorded with the admin's identity and time and
 *    appended to PolicyRuleEvent. Snapshots and proposals are never deleted.
 * 4. The application schedules nothing. Checks run when a policy admin
 *    presses "Check now" / "Run due checks", or when an operator-triggered
 *    runner calls runDueSourceChecks (see src/app/api/policy-monitoring).
 */

export const ACCESS_PROBLEM_AFTER = 3;
export const MIN_INTERVAL_HOURS = 1;
export const MAX_INTERVAL_HOURS = 24 * 30;
export const DEFAULT_INTERVAL_HOURS = 24;
/** Most sources one "run due checks" call will fetch. */
export const MAX_SOURCES_PER_RUN = 25;

export type SourceMonitorStatus = "DISCONTINUED" | "NOT_MONITORED" | "NEVER_CHECKED" | "OK" | "CHANGE_PENDING" | "ACCESS_PROBLEM" | "LAST_CHECK_FAILED";

export interface MonitoredSourceView {
  id: string;
  name: string;
  authorityName: string;
  authorityType: string;
  jurisdictionCode: string;
  officialUrl: string;
  officialDomain: boolean;
  verificationStatus: string;
  monitoringEnabled: boolean;
  checkIntervalHours: number;
  lastCheckedAt: string | null;
  lastCheckOutcome: PolicySourceFetchOutcome | null;
  consecutiveFailures: number;
  discontinuedAt: string | null;
  discontinuedNote: string | null;
  nextDueAt: string | null;
  dueNow: boolean;
  status: SourceMonitorStatus;
  openProposals: number;
  snapshotCount: number;
  lastGoodSnapshotAt: string | null;
  lastStatedDate: string | null;
  /** Rules (by code) whose versions cite this source. */
  citedByRules: AffectedRule[];
}

export interface AffectedRule {
  ruleId: string;
  code: string;
  title: string;
  /** Status of the rule's current version. */
  currentStatus: string;
  versionNumbers: number[];
}

export interface ChangeProposalView {
  id: string;
  sourceId: string;
  sourceName: string;
  officialUrl: string;
  kind: PolicyChangeKind;
  status: PolicyChangeProposalStatus;
  summary: string;
  diff: DiffEntry[];
  affectedRules: AffectedRule[];
  detectedByName: string;
  createdAt: string;
  resolvedByName: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  resultingVersion: { id: string; ruleCode: string; versionNumber: number } | null;
  previousSnapshot: SnapshotView | null;
  newSnapshot: SnapshotView;
}

export interface SnapshotView {
  id: string;
  fetchedAt: string;
  outcome: PolicySourceFetchOutcome;
  httpStatus: number | null;
  requestedUrl: string;
  finalUrl: string | null;
  contentHash: string | null;
  statedDate: string | null;
  byteLength: number | null;
  errorMessage: string | null;
  triggeredByName: string | null;
  /** The normalized text (only when requested for a diff view). */
  text?: string | null;
}

export interface MonitoringOverview {
  sources: MonitoredSourceView[];
  pending: ChangeProposalView[];
  resolved: ChangeProposalView[];
  recentSnapshots: Array<SnapshotView & { sourceName: string }>;
  isPolicyAdmin: boolean;
  counts: { monitored: number; dueNow: number; pending: number; accessProblems: number; discontinued: number };
}

export interface CheckResult {
  sourceId: string;
  sourceName: string;
  outcome: PolicySourceFetchOutcome;
  snapshotId: string | null;
  changed: boolean;
  proposalId: string | null;
  summary: string;
}

type SourceRow = {
  id: string;
  name: string;
  officialUrl: string;
  monitoringEnabled: boolean;
  checkIntervalHours: number;
  lastCheckedAt: Date | null;
  lastCheckOutcome: PolicySourceFetchOutcome | null;
  consecutiveFailures: number;
  discontinuedAt: Date | null;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function nextDueAt(source: Pick<SourceRow, "monitoringEnabled" | "checkIntervalHours" | "lastCheckedAt" | "discontinuedAt">): Date | null {
  if (!source.monitoringEnabled || source.discontinuedAt) return null;
  if (!source.lastCheckedAt) return new Date(0);
  return new Date(source.lastCheckedAt.getTime() + source.checkIntervalHours * 3_600_000);
}

export function isDue(source: Pick<SourceRow, "monitoringEnabled" | "checkIntervalHours" | "lastCheckedAt" | "discontinuedAt">, now: Date): boolean {
  const due = nextDueAt(source);
  return due !== null && due.getTime() <= now.getTime();
}

export function monitorStatus(source: Pick<SourceRow, "monitoringEnabled" | "lastCheckedAt" | "lastCheckOutcome" | "consecutiveFailures" | "discontinuedAt">, openProposals: number): SourceMonitorStatus {
  if (source.discontinuedAt) return "DISCONTINUED";
  if (openProposals > 0) return "CHANGE_PENDING";
  if (!source.monitoringEnabled && !source.lastCheckedAt) return "NOT_MONITORED";
  if (!source.lastCheckedAt) return "NEVER_CHECKED";
  if (source.consecutiveFailures >= ACCESS_PROBLEM_AFTER) return "ACCESS_PROBLEM";
  if (source.lastCheckOutcome && source.lastCheckOutcome !== "OK") return "LAST_CHECK_FAILED";
  return "OK";
}

function isFailure(outcome: PolicySourceFetchOutcome): boolean {
  return outcome === "BLOCKED" || outcome === "UNREACHABLE" || outcome === "ERROR";
}

function toSnapshotView(s: {
  id: string;
  fetchedAt: Date;
  outcome: PolicySourceFetchOutcome;
  httpStatus: number | null;
  requestedUrl: string;
  finalUrl: string | null;
  contentHash: string | null;
  statedDate: Date | null;
  byteLength: number | null;
  errorMessage: string | null;
  triggeredBy?: { name: string } | null;
  normalizedText?: string | null;
}, withText = false): SnapshotView {
  return {
    id: s.id,
    fetchedAt: s.fetchedAt.toISOString(),
    outcome: s.outcome,
    httpStatus: s.httpStatus,
    requestedUrl: s.requestedUrl,
    finalUrl: s.finalUrl,
    contentHash: s.contentHash,
    statedDate: iso(s.statedDate),
    byteLength: s.byteLength,
    errorMessage: s.errorMessage,
    triggeredByName: s.triggeredBy?.name ?? null,
    ...(withText ? { text: s.normalizedText ?? null } : {}),
  };
}

// ---------------------------------------------------------------------------
// Impact: which rules cite a source

export async function affectedRulesForSource(sourceId: string, tx: Prisma.TransactionClient | typeof prisma = prisma): Promise<AffectedRule[]> {
  const citations = await tx.policyRuleVersionSource.findMany({
    where: { sourceId },
    select: { version: { select: { versionNumber: true, status: true, rule: { select: { id: true, code: true, title: true, currentVersionNumber: true, versions: { select: { versionNumber: true, status: true } } } } } } },
  });
  const byRule = new Map<string, AffectedRule>();
  for (const c of citations ?? []) {
    const rule = c.version.rule;
    const current = rule.versions.find((v) => v.versionNumber === rule.currentVersionNumber);
    const entry = byRule.get(rule.id) ?? { ruleId: rule.id, code: rule.code, title: rule.title, currentStatus: current?.status ?? c.version.status, versionNumbers: [] };
    if (!entry.versionNumbers.includes(c.version.versionNumber)) entry.versionNumbers.push(c.version.versionNumber);
    byRule.set(rule.id, entry);
  }
  return [...byRule.values()].sort((a, b) => a.code.localeCompare(b.code)).map((r) => ({ ...r, versionNumbers: r.versionNumbers.sort((a, b) => a - b) }));
}

// ---------------------------------------------------------------------------
// Checking one source

/**
 * Fetches the source once, appends a snapshot, updates the check bookkeeping
 * on the source and, when warranted, opens one change proposal. Never edits a
 * rule or the source's verification status.
 */
export async function checkDbPolicySource(sourceId: string, user: CurrentUser, options: { fetcher?: SourceFetcher; now?: Date; force?: boolean } = {}): Promise<CheckResult> {
  assertPolicyAdmin(user);
  const fetcher = options.fetcher ?? httpFetcher;
  const now = options.now ?? new Date();

  const source = await prisma.policySource.findUnique({
    where: { id: sourceId },
    select: { id: true, name: true, officialUrl: true, monitoringEnabled: true, checkIntervalHours: true, lastCheckedAt: true, lastCheckOutcome: true, consecutiveFailures: true, discontinuedAt: true },
  });
  if (!source) throw new Error(`Policy source '${sourceId}' not found in database.`);
  if (source.discontinuedAt && !options.force) {
    return { sourceId, sourceName: source.name, outcome: "SKIPPED", snapshotId: null, changed: false, proposalId: null, summary: "Source is marked discontinued; checks are paused." };
  }

  const page = isOfficialUrl(source.officialUrl)
    ? await fetcher.fetch(source.officialUrl)
    : { outcome: "SKIPPED" as const, httpStatus: null, finalUrl: null, contentType: null, byteLength: null, text: null, contentHash: null, statedDate: null, errorMessage: "Not an https URL on a known official domain; checked by hand only." };

  const previous = await prisma.policySourceSnapshot.findFirst({
    where: { sourceId, outcome: { in: ["OK", "REDIRECTED"] }, contentHash: { not: null } },
    orderBy: { fetchedAt: "desc" },
    select: { id: true, contentHash: true, normalizedText: true, statedDate: true, finalUrl: true },
  });

  const good = page.outcome === "OK" || page.outcome === "REDIRECTED";
  const failure = isFailure(page.outcome);
  const consecutiveFailures = failure ? source.consecutiveFailures + 1 : page.outcome === "SKIPPED" ? source.consecutiveFailures : 0;

  // Decide what, if anything, to put in front of a human.
  let proposal: { kind: PolicyChangeKind; summary: string; diff: DiffEntry[] } | null = null;
  let changed = false;
  if (good && previous && previous.contentHash !== page.contentHash) {
    const comparison = compareSnapshots({ text: previous.normalizedText ?? "", statedDate: previous.statedDate }, { text: page.text ?? "", statedDate: page.statedDate });
    if (comparison.meaningful) {
      changed = true;
      proposal = { kind: "CONTENT_CHANGED", summary: comparison.summary, diff: [...comparison.removed, ...comparison.added] };
    }
  }
  if (page.outcome === "REDIRECTED" && (!previous || !previous.finalUrl || previous.finalUrl !== page.finalUrl)) {
    changed = true;
    proposal = { kind: "REDIRECTED", summary: `The official URL now redirects to ${page.finalUrl ?? "another page"}. Confirm the new page is the same policy and update the source URL by hand if so.${proposal ? ` ${proposal.summary}` : ""}`, diff: proposal?.diff ?? [] };
  }
  if (page.outcome === "NOT_FOUND") {
    changed = true;
    proposal = { kind: "NOT_FOUND", summary: `The official page returned HTTP ${page.httpStatus}. The policy may have moved or been withdrawn; find the current official page before relying on rules that cite it.`, diff: [] };
  }
  if (failure && consecutiveFailures >= ACCESS_PROBLEM_AFTER) {
    proposal = { kind: "ACCESS_PROBLEM", summary: `${consecutiveFailures} consecutive checks failed (latest: ${page.outcome}${page.errorMessage ? `, ${page.errorMessage}` : ""}). The page may be blocking automated access or be down; check it in a browser. Unreachable is never treated as unchanged.`, diff: [] };
  }

  const result = await prisma.$transaction(async (tx) => {
    const snapshot = await tx.policySourceSnapshot.create({
      data: {
        sourceId,
        fetchedAt: now,
        requestedUrl: source.officialUrl,
        finalUrl: page.finalUrl,
        outcome: page.outcome,
        httpStatus: page.httpStatus,
        contentType: page.contentType,
        byteLength: page.byteLength,
        contentHash: page.contentHash,
        normalizedText: page.text,
        statedDate: page.statedDate,
        errorMessage: page.errorMessage,
        triggeredById: user.id,
      },
      select: { id: true },
    });

    await tx.policySource.update({
      where: { id: sourceId },
      data: { lastCheckedAt: now, lastCheckOutcome: page.outcome, consecutiveFailures },
    });

    let proposalId: string | null = null;
    if (proposal) {
      // One open proposal per source and kind; a repeat of the same situation is not a new task.
      const open = await tx.policySourceChangeProposal.findFirst({ where: { sourceId, kind: proposal.kind, status: "PENDING_REVIEW" }, select: { id: true, newSnapshot: { select: { contentHash: true } } } });
      const duplicate = open && (proposal.kind !== "CONTENT_CHANGED" || open.newSnapshot.contentHash === page.contentHash);
      if (!duplicate) {
        const affected = await affectedRulesForSource(sourceId, tx);
        const created = await tx.policySourceChangeProposal.create({
          data: {
            sourceId,
            kind: proposal.kind,
            previousSnapshotId: previous?.id ?? null,
            newSnapshotId: snapshot.id,
            summary: proposal.summary.slice(0, LIMITS.text),
            diff: proposal.diff as unknown as Prisma.InputJsonValue,
            affectedRuleCodes: affected.map((r) => r.code),
            detectedById: user.id,
          },
          select: { id: true },
        });
        proposalId = created.id;
        await tx.policyRuleEvent.create({
          data: {
            sourceId,
            kind: "SOURCE_CHANGE_DETECTED",
            actorId: user.id,
            note: `${proposal.kind}: ${proposal.summary}${affected.length ? ` Rules citing this source: ${affected.map((r) => r.code).join(", ")}.` : " No rule cites this source yet."}`.slice(0, LIMITS.note),
          },
        });
      } else if (open) {
        proposalId = open.id;
      }
    }
    return { snapshotId: snapshot.id, proposalId };
  });

  const summary = proposal
    ? proposal.summary
    : page.outcome === "OK" || page.outcome === "REDIRECTED"
      ? previous
        ? previous.contentHash === page.contentHash
          ? "No change since the previous snapshot."
          : "Only formatting or boilerplate changed; no policy text differs."
        : "First snapshot recorded. Future checks compare against it."
      : page.outcome === "SKIPPED"
        ? page.errorMessage ?? "Skipped."
        : `Fetch failed: ${page.outcome}${page.errorMessage ? ` (${page.errorMessage})` : ""}. ${consecutiveFailures} consecutive failure${consecutiveFailures === 1 ? "" : "s"}.`;

  return { sourceId, sourceName: source.name, outcome: page.outcome, snapshotId: result.snapshotId, changed, proposalId: result.proposalId, summary };
}

/** Checks every monitored, non-discontinued source whose interval has elapsed. */
export async function runDueSourceChecks(user: CurrentUser, options: { fetcher?: SourceFetcher; now?: Date; limit?: number } = {}): Promise<CheckResult[]> {
  assertPolicyAdmin(user);
  const now = options.now ?? new Date();
  const limit = Math.min(options.limit ?? MAX_SOURCES_PER_RUN, MAX_SOURCES_PER_RUN);
  const candidates = await prisma.policySource.findMany({
    where: { monitoringEnabled: true, discontinuedAt: null },
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }],
    select: { id: true, name: true, officialUrl: true, monitoringEnabled: true, checkIntervalHours: true, lastCheckedAt: true, lastCheckOutcome: true, consecutiveFailures: true, discontinuedAt: true },
  });
  const due = (candidates ?? []).filter((s) => isDue(s, now)).slice(0, limit);
  const results: CheckResult[] = [];
  for (const source of due) {
    // Sequential on purpose: one request at a time, no bursts at a publisher.
    results.push(await checkDbPolicySource(source.id, user, { fetcher: options.fetcher, now }));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Configuration (policy admins)

export async function setDbSourceMonitoring(sourceId: string, input: { enabled: boolean; intervalHours?: number }, user: CurrentUser): Promise<void> {
  assertPolicyAdmin(user);
  const hours = Math.round(Number(input.intervalHours ?? DEFAULT_INTERVAL_HOURS));
  if (!Number.isFinite(hours) || hours < MIN_INTERVAL_HOURS || hours > MAX_INTERVAL_HOURS) {
    throw new Error(`Check interval must be between ${MIN_INTERVAL_HOURS} and ${MAX_INTERVAL_HOURS} hours.`);
  }
  const source = await prisma.policySource.findUnique({ where: { id: sourceId }, select: { id: true, officialUrl: true, discontinuedAt: true } });
  if (!source) throw new Error(`Policy source '${sourceId}' not found in database.`);
  if (input.enabled && source.discontinuedAt) throw new Error("This source is marked discontinued. Reinstate it before monitoring it again.");
  if (input.enabled && !isOfficialUrl(source.officialUrl)) throw new Error("Only https URLs on a known official domain can be monitored automatically.");
  await prisma.$transaction(async (tx) => {
    await tx.policySource.update({ where: { id: sourceId }, data: { monitoringEnabled: input.enabled, checkIntervalHours: hours } });
    await tx.policyRuleEvent.create({
      data: { sourceId, kind: "SOURCE_MONITORING_UPDATED", actorId: user.id, note: input.enabled ? `Monitoring on, every ${hours} hour${hours === 1 ? "" : "s"}` : "Monitoring off" },
    });
  });
}

export async function setDbSourceDiscontinued(sourceId: string, input: { discontinued: boolean; note?: string }, user: CurrentUser): Promise<void> {
  assertPolicyAdmin(user);
  const note = String(input.note ?? "").trim();
  if (note.length > LIMITS.note) throw new Error(`Keep the note under ${LIMITS.note} characters.`);
  if (input.discontinued && note.length < 5) throw new Error("Say why the source is discontinued (for example, where the policy moved).");
  const source = await prisma.policySource.findUnique({ where: { id: sourceId }, select: { id: true } });
  if (!source) throw new Error(`Policy source '${sourceId}' not found in database.`);
  await prisma.$transaction(async (tx) => {
    await tx.policySource.update({
      where: { id: sourceId },
      data: input.discontinued ? { discontinuedAt: new Date(), discontinuedNote: note, monitoringEnabled: false } : { discontinuedAt: null, discontinuedNote: null },
    });
    await tx.policyRuleEvent.create({
      data: { sourceId, kind: "SOURCE_MONITORING_UPDATED", actorId: user.id, note: input.discontinued ? `Marked discontinued · ${note}` : `Reinstated${note ? ` · ${note}` : ""}` },
    });
  });
}

// ---------------------------------------------------------------------------
// Human review of a proposal

export type ProposalDecision = Exclude<PolicyChangeProposalStatus, "PENDING_REVIEW">;

/**
 * Records a policy admin's decision on a detected change. This closes the
 * queue item only. A rule update, when needed, goes through the normal
 * propose → verify → approve workflow; the resulting version can be linked
 * here for the record, but nothing is activated.
 */
export async function reviewDbChangeProposal(proposalId: string, input: { decision: ProposalDecision; note?: string; resultingVersionId?: string | null }, user: CurrentUser): Promise<void> {
  assertPolicyAdmin(user);
  if (!["NO_RULE_CHANGE", "RULE_UPDATE_STARTED", "DISMISSED"].includes(input.decision)) throw new Error("Choose a valid review decision.");
  const note = String(input.note ?? "").trim();
  if (note.length > LIMITS.note) throw new Error(`Keep the note under ${LIMITS.note} characters.`);
  if (note.length < 5) throw new Error("Record what you checked and why you decided this.");

  const proposal = await prisma.policySourceChangeProposal.findUnique({ where: { id: proposalId }, select: { id: true, sourceId: true, status: true, kind: true } });
  if (!proposal) throw new Error("Change proposal not found.");
  if (proposal.status !== "PENDING_REVIEW") throw new Error("This change has already been reviewed. Reviews are kept as history and are not edited.");

  let resultingVersionId: string | null = null;
  if (input.decision === "RULE_UPDATE_STARTED" && input.resultingVersionId) {
    const version = await prisma.policyRuleVersion.findUnique({ where: { id: String(input.resultingVersionId) }, select: { id: true, status: true } });
    if (!version) throw new Error("The linked rule version was not found.");
    if (version.status === "ACTIVE" || version.status === "DEPRECATED") throw new Error("Link the new draft or pending version, not an already approved one.");
    resultingVersionId = version.id;
  }

  await prisma.$transaction(async (tx) => {
    await tx.policySourceChangeProposal.update({
      where: { id: proposalId },
      data: { status: input.decision, resolvedById: user.id, resolvedAt: new Date(), resolutionNote: note, resultingVersionId },
    });
    await tx.policyRuleEvent.create({
      data: { sourceId: proposal.sourceId, kind: "SOURCE_CHANGE_REVIEWED", actorId: user.id, note: `${proposal.kind} reviewed: ${input.decision} · ${note}`.slice(0, LIMITS.note) },
    });
  });
}

// ---------------------------------------------------------------------------
// Reading

const PROPOSAL_INCLUDE = {
  source: { select: { name: true, officialUrl: true } },
  detectedBy: { select: { name: true } },
  resolvedBy: { select: { name: true } },
  resultingVersion: { select: { id: true, versionNumber: true, rule: { select: { code: true } } } },
  previousSnapshot: { include: { triggeredBy: { select: { name: true } } } },
  newSnapshot: { include: { triggeredBy: { select: { name: true } } } },
} as const;

type ProposalRow = Prisma.PolicySourceChangeProposalGetPayload<{ include: typeof PROPOSAL_INCLUDE }>;

function toProposalView(p: ProposalRow, affectedByCode: Map<string, AffectedRule>, withText: boolean): ChangeProposalView {
  const diff = Array.isArray(p.diff) ? (p.diff as unknown as DiffEntry[]) : [];
  return {
    id: p.id,
    sourceId: p.sourceId,
    sourceName: p.source.name,
    officialUrl: p.source.officialUrl,
    kind: p.kind,
    status: p.status,
    summary: p.summary,
    diff,
    affectedRules: p.affectedRuleCodes.map((code) => affectedByCode.get(code) ?? { ruleId: "", code, title: code, currentStatus: "UNKNOWN", versionNumbers: [] }),
    detectedByName: p.detectedBy.name,
    createdAt: p.createdAt.toISOString(),
    resolvedByName: p.resolvedBy?.name ?? null,
    resolvedAt: iso(p.resolvedAt),
    resolutionNote: p.resolutionNote,
    resultingVersion: p.resultingVersion ? { id: p.resultingVersion.id, ruleCode: p.resultingVersion.rule.code, versionNumber: p.resultingVersion.versionNumber } : null,
    previousSnapshot: p.previousSnapshot ? toSnapshotView(p.previousSnapshot, withText) : null,
    newSnapshot: toSnapshotView(p.newSnapshot, withText),
  };
}

export async function getDbMonitoringOverview(user: CurrentUser, options: { now?: Date } = {}): Promise<MonitoringOverview> {
  const now = options.now ?? new Date();
  const [sources, proposals, snapshots, citations] = await Promise.all([
    prisma.policySource.findMany({
      orderBy: [{ authorityName: "asc" }, { name: "asc" }],
      include: { _count: { select: { snapshots: true, changeProposals: { where: { status: "PENDING_REVIEW" } } } } },
    }),
    prisma.policySourceChangeProposal.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: PROPOSAL_INCLUDE }),
    prisma.policySourceSnapshot.findMany({ orderBy: { fetchedAt: "desc" }, take: 50, include: { triggeredBy: { select: { name: true } }, source: { select: { name: true } } } }),
    prisma.policyRuleVersionSource.findMany({
      select: { sourceId: true, version: { select: { versionNumber: true, status: true, rule: { select: { id: true, code: true, title: true, currentVersionNumber: true, versions: { select: { versionNumber: true, status: true } } } } } } },
    }),
  ]);

  // Rules per source, and a code → rule map for proposals.
  const rulesBySource = new Map<string, Map<string, AffectedRule>>();
  const byCode = new Map<string, AffectedRule>();
  for (const c of citations ?? []) {
    const rule = c.version.rule;
    const current = rule.versions.find((v) => v.versionNumber === rule.currentVersionNumber);
    const perSource = rulesBySource.get(c.sourceId) ?? new Map<string, AffectedRule>();
    const entry = perSource.get(rule.id) ?? { ruleId: rule.id, code: rule.code, title: rule.title, currentStatus: current?.status ?? c.version.status, versionNumbers: [] };
    if (!entry.versionNumbers.includes(c.version.versionNumber)) entry.versionNumbers.push(c.version.versionNumber);
    perSource.set(rule.id, entry);
    rulesBySource.set(c.sourceId, perSource);
    byCode.set(rule.code, entry);
  }

  const lastGood = new Map<string, { fetchedAt: Date; statedDate: Date | null }>();
  for (const s of snapshots ?? []) {
    if ((s.outcome === "OK" || s.outcome === "REDIRECTED") && !lastGood.has(s.sourceId)) lastGood.set(s.sourceId, { fetchedAt: s.fetchedAt, statedDate: s.statedDate });
  }

  const sourceViews: MonitoredSourceView[] = (sources ?? []).map((s) => {
    const open = s._count.changeProposals;
    const good = lastGood.get(s.id);
    return {
      id: s.id,
      name: s.name,
      authorityName: s.authorityName,
      authorityType: s.authorityType,
      jurisdictionCode: s.jurisdictionCode,
      officialUrl: s.officialUrl,
      officialDomain: isOfficialUrl(s.officialUrl),
      verificationStatus: s.verificationStatus,
      monitoringEnabled: s.monitoringEnabled,
      checkIntervalHours: s.checkIntervalHours,
      lastCheckedAt: iso(s.lastCheckedAt),
      lastCheckOutcome: s.lastCheckOutcome,
      consecutiveFailures: s.consecutiveFailures,
      discontinuedAt: iso(s.discontinuedAt),
      discontinuedNote: s.discontinuedNote,
      nextDueAt: iso(nextDueAt(s)),
      dueNow: isDue(s, now),
      status: monitorStatus(s, open),
      openProposals: open,
      snapshotCount: s._count.snapshots,
      lastGoodSnapshotAt: iso(good?.fetchedAt),
      lastStatedDate: iso(good?.statedDate),
      citedByRules: [...(rulesBySource.get(s.id)?.values() ?? [])].sort((a, b) => a.code.localeCompare(b.code)),
    };
  });

  const views = (proposals ?? []).map((p) => toProposalView(p, byCode, p.status === "PENDING_REVIEW"));
  return {
    sources: sourceViews,
    pending: views.filter((p) => p.status === "PENDING_REVIEW"),
    resolved: views.filter((p) => p.status !== "PENDING_REVIEW"),
    recentSnapshots: (snapshots ?? []).map((s) => ({ ...toSnapshotView(s), sourceName: s.source.name })),
    isPolicyAdmin: user.role === "TEAM" && !user.demoSession && user.isPolicyAdmin === true,
    counts: {
      monitored: sourceViews.filter((s) => s.monitoringEnabled && !s.discontinuedAt).length,
      dueNow: (sources ?? []).filter((s) => isDue(s, now)).length,
      pending: views.filter((p) => p.status === "PENDING_REVIEW").length,
      accessProblems: sourceViews.filter((s) => !s.discontinuedAt && s.consecutiveFailures >= ACCESS_PROBLEM_AFTER).length,
      discontinued: sourceViews.filter((s) => s.discontinuedAt).length,
    },
  };
}

/** One proposal with the full old and new text, for the side-by-side view. */
export async function getDbChangeProposal(proposalId: string): Promise<ChangeProposalView | null> {
  const p = await prisma.policySourceChangeProposal.findUnique({ where: { id: proposalId }, include: PROPOSAL_INCLUDE });
  if (!p) return null;
  const affected = await affectedRulesForSource(p.sourceId);
  return toProposalView(p, new Map(affected.map((r) => [r.code, r])), true);
}
