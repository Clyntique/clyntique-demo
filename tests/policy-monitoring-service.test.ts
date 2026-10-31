import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { fixtureFetcher } from "@/lib/policy/monitoring/fetcher";
import type { PolicySourceFetchOutcome } from "@/generated/prisma/enums";
import { createPrismaMock, type PrismaMock } from "./helpers";

// Policy source monitoring, database side (Oct 31). Runs against the Prisma
// mock with a small in-memory store for snapshots and proposals so that
// consecutive checks of one source see what earlier checks recorded. Fetches
// are answered from invented fixture pages; nothing touches the network.
//
// The guarantees under test: every check appends a snapshot; a meaningful
// change, redirect, missing page or repeated failure opens exactly ONE queue
// item for a human; nothing here ever edits a rule, a rule version or a
// source's verification status; review decisions are kept as history.

const h = vi.hoisted(() => ({ prisma: null as unknown as PrismaMock }));
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));

const service = await import("@/lib/policy/monitoring/service");

const fixture = (name: string) => readFileSync(join(process.cwd(), "tests", "fixtures", "policy-monitoring", name), "utf8");
const V1 = fixture("sample-v1.html");
const V1_RESTYLED = fixture("sample-v1-restyled.html");
const V2 = fixture("sample-v2.html");
const CHALLENGE = fixture("challenge.html");

const admin: CurrentUser = { id: "usr-admin-1", name: "Policy Administrator", email: "one@test.invalid", role: "TEAM", isPolicyAdmin: true };
const reviewer: CurrentUser = { id: "usr-team-2", name: "Plain reviewer", email: "two@test.invalid", role: "TEAM" };
const client: CurrentUser = { id: "usr-client", name: "Client", email: "c@test.invalid", role: "CLIENT", isPolicyAdmin: true };

const URL_META = "https://transparency.meta.com/policies/ad-standards/health";
const T0 = new Date("2026-10-31T06:00:00Z");
const hoursLater = (n: number) => new Date(T0.getTime() + n * 3_600_000);

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
  discontinuedNote: string | null;
  verificationStatus: string;
};
type SnapshotRow = Record<string, unknown> & { id: string; sourceId: string; fetchedAt: Date; outcome: string; contentHash: string | null; finalUrl: string | null };
type ProposalRow = Record<string, unknown> & { id: string; sourceId: string; kind: string; status: string; newSnapshotId: string };

let prisma: PrismaMock;
let sources: SourceRow[];
let snapshots: SnapshotRow[];
let proposals: ProposalRow[];
let events: Record<string, unknown>[];

function source(over: Partial<SourceRow> = {}): SourceRow {
  return {
    id: "src-meta",
    name: "Sample Platform health policy",
    officialUrl: URL_META,
    monitoringEnabled: true,
    checkIntervalHours: 24,
    lastCheckedAt: null,
    lastCheckOutcome: null,
    consecutiveFailures: 0,
    discontinuedAt: null,
    discontinuedNote: null,
    verificationStatus: "VERIFIED",
    ...over,
  };
}

function pick<T extends object>(row: T, select?: Record<string, unknown>): T {
  if (!select) return row;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(select)) if (key in row) out[key] = (row as Record<string, unknown>)[key];
  return out as T;
}

/** Installs just enough Prisma behaviour for the monitoring service. */
function installStore() {
  const seq: Record<string, number> = {};
  const nextId = (prefix: string) => `${prefix}-${(seq[prefix] = (seq[prefix] ?? 0) + 1)}`;

  prisma.policySource.findUnique.mockImplementation(async ({ where, select }: { where: { id: string }; select?: Record<string, unknown> }) => {
    const row = sources.find((s) => s.id === where.id);
    return row ? pick(row, select) : null;
  });
  prisma.policySource.findMany.mockImplementation(async ({ where }: { where?: { monitoringEnabled?: boolean; discontinuedAt?: null } }) =>
    sources.filter((s) => (where?.monitoringEnabled === undefined || s.monitoringEnabled === where.monitoringEnabled) && (where?.discontinuedAt === undefined || s.discontinuedAt === null)),
  );
  prisma.policySource.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Partial<SourceRow> }) => {
    const row = sources.find((s) => s.id === where.id);
    if (!row) throw new Error("source missing");
    Object.assign(row, data);
    return row;
  });

  prisma.policySourceSnapshot.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const row = { id: nextId("snap"), ...data } as SnapshotRow;
    snapshots.push(row);
    return { id: row.id };
  });
  prisma.policySourceSnapshot.findFirst.mockImplementation(async ({ where }: { where: { sourceId: string; outcome?: { in: string[] }; contentHash?: { not: null } } }) => {
    const rows = snapshots
      .filter((s) => s.sourceId === where.sourceId && (!where.outcome || where.outcome.in.includes(s.outcome)) && (!where.contentHash || s.contentHash !== null))
      .sort((a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime());
    return rows[0] ?? null;
  });

  prisma.policySourceChangeProposal.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const row = { id: nextId("prop"), status: "PENDING_REVIEW", createdAt: new Date(), ...data } as unknown as ProposalRow;
    proposals.push(row);
    return { id: row.id };
  });
  prisma.policySourceChangeProposal.findFirst.mockImplementation(async ({ where }: { where: { sourceId: string; kind: string; status: string } }) => {
    const row = proposals.find((p) => p.sourceId === where.sourceId && p.kind === where.kind && p.status === where.status);
    if (!row) return null;
    const snap = snapshots.find((s) => s.id === row.newSnapshotId);
    return { id: row.id, newSnapshot: { contentHash: snap?.contentHash ?? null } };
  });
  prisma.policySourceChangeProposal.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => proposals.find((p) => p.id === where.id) ?? null);
  prisma.policySourceChangeProposal.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const row = proposals.find((p) => p.id === where.id);
    if (!row) throw new Error("proposal missing");
    Object.assign(row, data);
    return row;
  });

  prisma.policyRuleEvent.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    events.push(data);
    return { id: nextId("evt"), ...data };
  });
}

/** Two rules cite the monitored source: one active, one still a draft. */
function withCitations() {
  prisma.policyRuleVersionSource.findMany.mockResolvedValue([
    { version: { versionNumber: 1, status: "ACTIVE", rule: { id: "rule-a", code: "SYN-META-01", title: "Synthetic rule A", currentVersionNumber: 1, versions: [{ versionNumber: 1, status: "ACTIVE" }] } } },
    { version: { versionNumber: 2, status: "DRAFT", rule: { id: "rule-a", code: "SYN-META-01", title: "Synthetic rule A", currentVersionNumber: 1, versions: [{ versionNumber: 1, status: "ACTIVE" }, { versionNumber: 2, status: "DRAFT" }] } } },
    { version: { versionNumber: 1, status: "DRAFT", rule: { id: "rule-b", code: "SYN-META-02", title: "Synthetic rule B", currentVersionNumber: 1, versions: [{ versionNumber: 1, status: "DRAFT" }] } } },
  ]);
}

/** Writes that monitoring must never make. */
function expectNoRuleOrVerificationWrites() {
  expect(prisma.policyRule.update).not.toHaveBeenCalled();
  expect(prisma.policyRule.create).not.toHaveBeenCalled();
  expect(prisma.policyRuleVersion.update).not.toHaveBeenCalled();
  expect(prisma.policyRuleVersion.create).not.toHaveBeenCalled();
  expect(prisma.policyRuleVersionSource.create).not.toHaveBeenCalled();
  for (const call of prisma.policySource.update.mock.calls) {
    const data = (call[0] as { data: Record<string, unknown> }).data;
    expect(Object.keys(data).sort()).toEqual(expect.not.arrayContaining(["verificationStatus", "officialUrl", "name", "authorityName"]));
  }
  for (const s of sources) expect(s.verificationStatus).toBe("VERIFIED");
}

beforeEach(() => {
  prisma = createPrismaMock();
  h.prisma = prisma;
  sources = [source()];
  snapshots = [];
  proposals = [];
  events = [];
  installStore();
});

describe("checkDbPolicySource", () => {
  it("requires a policy admin, never a plain reviewer or a client", async () => {
    const fetcher = fixtureFetcher({ [URL_META]: { body: V1 } });
    await expect(service.checkDbPolicySource("src-meta", reviewer, { fetcher })).rejects.toThrow(/Policy Administrator/);
    await expect(service.checkDbPolicySource("src-meta", client, { fetcher })).rejects.toThrow(/Policy Administrator/);
    await expect(service.checkDbPolicySource("src-meta", { ...admin, demoSession: true }, { fetcher })).rejects.toThrow(/Policy Administrator/);
    expect(fetcher.calls).toEqual([]);
    expect(snapshots).toEqual([]);
  });

  it("records a baseline on the first check and no proposal; an unchanged page later adds a snapshot only", async () => {
    const fetcher = fixtureFetcher({ [URL_META]: { body: V1 } });
    const first = await service.checkDbPolicySource("src-meta", admin, { fetcher, now: T0 });
    expect(first).toMatchObject({ outcome: "OK", changed: false, proposalId: null, snapshotId: "snap-1" });
    expect(first.summary).toMatch(/First snapshot recorded/);
    expect(sources[0]).toMatchObject({ lastCheckedAt: T0, lastCheckOutcome: "OK", consecutiveFailures: 0 });
    expect(snapshots[0]).toMatchObject({ sourceId: "src-meta", requestedUrl: URL_META, outcome: "OK", httpStatus: 200, triggeredById: admin.id });
    expect(snapshots[0].statedDate).toEqual(new Date("2026-03-03T00:00:00Z"));

    const second = await service.checkDbPolicySource("src-meta", admin, { fetcher, now: hoursLater(24) });
    expect(second).toMatchObject({ outcome: "OK", changed: false, proposalId: null });
    expect(second.summary).toBe("No change since the previous snapshot.");
    expect(snapshots).toHaveLength(2);
    expect(proposals).toEqual([]);
    expect(events).toEqual([]);
    expect(fetcher.calls).toEqual([URL_META, URL_META]);
    expectNoRuleOrVerificationWrites();
  });

  it("ignores a restyled page with the same policy text", async () => {
    await service.checkDbPolicySource("src-meta", admin, { fetcher: fixtureFetcher({ [URL_META]: { body: V1 } }), now: T0 });
    const r = await service.checkDbPolicySource("src-meta", admin, { fetcher: fixtureFetcher({ [URL_META]: { body: V1_RESTYLED } }), now: hoursLater(24) });
    expect(r.changed).toBe(false);
    expect(r.proposalId).toBeNull();
    expect(proposals).toEqual([]);
    // The restyled page has the same normalized text, so its hash matches the baseline.
    expect(snapshots[1].contentHash).toBe(snapshots[0].contentHash);
  });

  it("opens one review-queue item for a meaningful change, names the rules that cite the source and touches no rule", async () => {
    withCitations();
    await service.checkDbPolicySource("src-meta", admin, { fetcher: fixtureFetcher({ [URL_META]: { body: V1 } }), now: T0 });
    const r = await service.checkDbPolicySource("src-meta", admin, { fetcher: fixtureFetcher({ [URL_META]: { body: V2 } }), now: hoursLater(24) });

    expect(r).toMatchObject({ outcome: "OK", changed: true, proposalId: "prop-1", snapshotId: "snap-2" });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      sourceId: "src-meta",
      kind: "CONTENT_CHANGED",
      status: "PENDING_REVIEW",
      previousSnapshotId: "snap-1",
      newSnapshotId: "snap-2",
      affectedRuleCodes: ["SYN-META-01", "SYN-META-02"],
      detectedById: admin.id,
    });
    expect(proposals[0].summary).toBe('3 paragraphs added, 1 paragraph removed under "Policy details", "Prohibited claims", "Enforcement". New section: "Enforcement". Stated page date changed from 2026-03-03 to 2026-10-14.');
    const diff = proposals[0].diff as { op: string; text: string }[];
    expect(diff.map((d) => d.op)).toEqual(["removed", "added", "added", "added"]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ sourceId: "src-meta", kind: "SOURCE_CHANGE_DETECTED", actorId: admin.id });
    expect(String(events[0].note)).toMatch(/Rules citing this source: SYN-META-01, SYN-META-02/);
    // Both snapshots are kept; the old one is untouched.
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0].contentHash).not.toBe(snapshots[1].contentHash);
    expectNoRuleOrVerificationWrites();
  });

  it("does not open a second item while the same change is still awaiting review, but does for a further change", async () => {
    await service.checkDbPolicySource("src-meta", admin, { fetcher: fixtureFetcher({ [URL_META]: { body: V1 } }), now: T0 });
    const v2 = fixtureFetcher({ [URL_META]: { body: V2 } });
    const a = await service.checkDbPolicySource("src-meta", admin, { fetcher: v2, now: hoursLater(24) });
    const b = await service.checkDbPolicySource("src-meta", admin, { fetcher: v2, now: hoursLater(48) });
    expect(a.proposalId).toBe("prop-1");
    // The page is compared with the latest saved snapshot, so the same page again is "no change"
    // and the pending item is not duplicated.
    expect(b).toMatchObject({ outcome: "OK", changed: false, proposalId: null, summary: "No change since the previous snapshot." });
    expect(proposals).toHaveLength(1);
    expect(snapshots).toHaveLength(3); // every check is still recorded
    expect(events).toHaveLength(1);

    // A further edit (back to v1 wording) differs from the open item's page, so it is a new item.
    const c = await service.checkDbPolicySource("src-meta", admin, { fetcher: fixtureFetcher({ [URL_META]: { body: V1 } }), now: hoursLater(72) });
    expect(c.proposalId).toBe("prop-2");
    expect(proposals).toHaveLength(2);
  });

  it("flags a redirect to another page once and keeps checking the registered URL", async () => {
    const moved = fixtureFetcher({ [URL_META]: { body: V1, finalUrl: "https://transparency.meta.com/policies/ad-standards/health-new" } });
    const r1 = await service.checkDbPolicySource("src-meta", admin, { fetcher: moved, now: T0 });
    expect(r1).toMatchObject({ outcome: "REDIRECTED", changed: true, proposalId: "prop-1" });
    expect(proposals[0]).toMatchObject({ kind: "REDIRECTED", status: "PENDING_REVIEW" });
    expect(proposals[0].summary).toMatch(/now redirects to https:\/\/transparency\.meta\.com\/policies\/ad-standards\/health-new/);
    expect(snapshots[0]).toMatchObject({ outcome: "REDIRECTED", finalUrl: "https://transparency.meta.com/policies/ad-standards/health-new" });

    const r2 = await service.checkDbPolicySource("src-meta", admin, { fetcher: moved, now: hoursLater(24) });
    expect(r2).toMatchObject({ outcome: "REDIRECTED", changed: false, proposalId: null }); // same redirect target as the saved snapshot
    expect(proposals).toHaveLength(1);
    expect(snapshots).toHaveLength(2);
    expect(moved.calls).toEqual([URL_META, URL_META]); // the registered URL, never the redirect target
    expect(sources[0].officialUrl).toBe(URL_META); // the URL is only ever changed by a person
  });

  it("flags a page that returns 404 and treats it as a failure, not as unchanged", async () => {
    await service.checkDbPolicySource("src-meta", admin, { fetcher: fixtureFetcher({ [URL_META]: { body: V1 } }), now: T0 });
    const r = await service.checkDbPolicySource("src-meta", admin, { fetcher: fixtureFetcher({ [URL_META]: { status: 404, body: "gone" } }), now: hoursLater(24) });
    expect(r).toMatchObject({ outcome: "NOT_FOUND", changed: true, proposalId: "prop-1" });
    expect(proposals[0]).toMatchObject({ kind: "NOT_FOUND", previousSnapshotId: "snap-1", newSnapshotId: "snap-2" });
    // A 404 has its own queue item, so it does not also count towards the access-problem threshold.
    expect(sources[0]).toMatchObject({ lastCheckOutcome: "NOT_FOUND", consecutiveFailures: 0 });
    expect(snapshots[1]).toMatchObject({ outcome: "NOT_FOUND", httpStatus: 404, contentHash: null });
    expect(service.monitorStatus(sources[0], 1)).toBe("CHANGE_PENDING");
    expect(service.monitorStatus(sources[0], 0)).toBe("LAST_CHECK_FAILED");

    // The same 404 the next day is not a second item; a later restored page is compared with the last good snapshot.
    const again = await service.checkDbPolicySource("src-meta", admin, { fetcher: fixtureFetcher({ [URL_META]: { status: 404, body: "gone" } }), now: hoursLater(48) });
    expect(again.proposalId).toBe("prop-1");
    expect(proposals).toHaveLength(1);
    const back = await service.checkDbPolicySource("src-meta", admin, { fetcher: fixtureFetcher({ [URL_META]: { body: V1 } }), now: hoursLater(72) });
    expect(back).toMatchObject({ outcome: "OK", changed: false, proposalId: null, summary: "No change since the previous snapshot." });
  });

  it("counts blocked, challenged and unreachable fetches as failures and raises ONE access problem after three in a row", async () => {
    await service.checkDbPolicySource("src-meta", admin, { fetcher: fixtureFetcher({ [URL_META]: { body: V1 } }), now: T0 });
    const r1 = await service.checkDbPolicySource("src-meta", admin, { fetcher: fixtureFetcher({ [URL_META]: { status: 403, body: "" } }), now: hoursLater(24) });
    const r2 = await service.checkDbPolicySource("src-meta", admin, { fetcher: fixtureFetcher({ [URL_META]: { status: 200, body: CHALLENGE } }), now: hoursLater(48) });
    expect(r1).toMatchObject({ outcome: "BLOCKED", proposalId: null });
    expect(r1.summary).toMatch(/1 consecutive failure\./);
    expect(r2).toMatchObject({ outcome: "BLOCKED", proposalId: null });
    expect(sources[0].consecutiveFailures).toBe(2);
    expect(service.monitorStatus(sources[0], 0)).toBe("LAST_CHECK_FAILED");

    const r3 = await service.checkDbPolicySource("src-meta", admin, { fetcher: fixtureFetcher({ [URL_META]: { networkError: "ECONNRESET" } }), now: hoursLater(72) });
    expect(r3).toMatchObject({ outcome: "UNREACHABLE", proposalId: "prop-1" });
    expect(proposals[0]).toMatchObject({ kind: "ACCESS_PROBLEM", status: "PENDING_REVIEW", newSnapshotId: "snap-4", previousSnapshotId: "snap-1" });
    expect(proposals[0].summary).toMatch(/3 consecutive checks failed .*Unreachable is never treated as unchanged/);
    expect(service.monitorStatus(sources[0], 1)).toBe("CHANGE_PENDING");

    const r4 = await service.checkDbPolicySource("src-meta", admin, { fetcher: fixtureFetcher({ [URL_META]: { status: 503, body: "" } }), now: hoursLater(96) });
    expect(r4.proposalId).toBe("prop-1");
    expect(proposals).toHaveLength(1);
    expect(sources[0].consecutiveFailures).toBe(4);
    expect(snapshots).toHaveLength(5);

    // A good fetch resets the counter; the earlier baseline is still the comparison point.
    const r5 = await service.checkDbPolicySource("src-meta", admin, { fetcher: fixtureFetcher({ [URL_META]: { body: V1 } }), now: hoursLater(120) });
    expect(r5).toMatchObject({ outcome: "OK", changed: false });
    expect(r5.summary).toBe("No change since the previous snapshot.");
    expect(sources[0].consecutiveFailures).toBe(0);
    expectNoRuleOrVerificationWrites();
  });

  it("skips a discontinued source and a non-official URL without fetching", async () => {
    sources = [source({ discontinuedAt: T0, discontinuedNote: "Moved to the new help centre" }), source({ id: "src-odd", officialUrl: "https://example.org/policy" })];
    const fetcher = fixtureFetcher({ [URL_META]: { body: V1 } });
    const a = await service.checkDbPolicySource("src-meta", admin, { fetcher, now: T0 });
    expect(a).toMatchObject({ outcome: "SKIPPED", snapshotId: null, proposalId: null });
    expect(a.summary).toMatch(/discontinued/);
    const b = await service.checkDbPolicySource("src-odd", admin, { fetcher, now: T0 });
    expect(b.outcome).toBe("SKIPPED");
    expect(b.summary).toMatch(/known official domain/);
    expect(b.snapshotId).toBe("snap-1"); // the skip itself is recorded
    expect(fetcher.calls).toEqual([]);
    await expect(service.checkDbPolicySource("src-missing", admin, { fetcher })).rejects.toThrow(/not found/);
  });
});

describe("runDueSourceChecks and scheduling helpers", () => {
  it("checks only monitored, non-discontinued sources whose interval has elapsed, one at a time", async () => {
    sources = [
      source({ id: "src-never" }),
      source({ id: "src-due", lastCheckedAt: hoursLater(-25) }),
      source({ id: "src-fresh", lastCheckedAt: hoursLater(-2) }),
      source({ id: "src-off", monitoringEnabled: false }),
      source({ id: "src-gone", discontinuedAt: hoursLater(-100) }),
      source({ id: "src-weekly", checkIntervalHours: 168, lastCheckedAt: hoursLater(-100) }),
    ];
    const fetcher = fixtureFetcher({ [URL_META]: { body: V1 } });
    const results = await service.runDueSourceChecks(admin, { fetcher, now: T0 });
    expect(results.map((r) => r.sourceId).sort()).toEqual(["src-due", "src-never"]);
    expect(fetcher.calls).toHaveLength(2);
    expect(sources.find((s) => s.id === "src-fresh")!.lastCheckedAt).toEqual(hoursLater(-2));
    expect(sources.find((s) => s.id === "src-off")!.lastCheckedAt).toBeNull();
    await expect(service.runDueSourceChecks(reviewer, { fetcher, now: T0 })).rejects.toThrow(/Policy Administrator/);
  });

  it("respects the per-run limit and never exceeds the hard cap", async () => {
    sources = Array.from({ length: 30 }, (_, i) => source({ id: `src-${i}` }));
    const fetcher = fixtureFetcher({ [URL_META]: { body: V1 } });
    expect(await service.runDueSourceChecks(admin, { fetcher, now: T0, limit: 3 })).toHaveLength(3);
    expect(await service.runDueSourceChecks(admin, { fetcher, now: hoursLater(48), limit: 1000 })).toHaveLength(service.MAX_SOURCES_PER_RUN);
  });

  it("computes due times and statuses", () => {
    const base = { monitoringEnabled: true, checkIntervalHours: 24, lastCheckedAt: T0, discontinuedAt: null };
    expect(service.nextDueAt(base)).toEqual(hoursLater(24));
    expect(service.isDue(base, hoursLater(23))).toBe(false);
    expect(service.isDue(base, hoursLater(24))).toBe(true);
    expect(service.isDue({ ...base, lastCheckedAt: null }, hoursLater(-1000))).toBe(true);
    expect(service.nextDueAt({ ...base, monitoringEnabled: false })).toBeNull();
    expect(service.nextDueAt({ ...base, discontinuedAt: T0 })).toBeNull();

    const s = { monitoringEnabled: true, lastCheckedAt: T0, lastCheckOutcome: "OK" as const, consecutiveFailures: 0, discontinuedAt: null };
    expect(service.monitorStatus(s, 0)).toBe("OK");
    expect(service.monitorStatus(s, 2)).toBe("CHANGE_PENDING");
    expect(service.monitorStatus({ ...s, lastCheckOutcome: "BLOCKED", consecutiveFailures: 1 }, 0)).toBe("LAST_CHECK_FAILED");
    expect(service.monitorStatus({ ...s, lastCheckOutcome: "BLOCKED", consecutiveFailures: 3 }, 0)).toBe("ACCESS_PROBLEM");
    expect(service.monitorStatus({ ...s, lastCheckedAt: null }, 0)).toBe("NEVER_CHECKED");
    expect(service.monitorStatus({ ...s, lastCheckedAt: null, monitoringEnabled: false }, 0)).toBe("NOT_MONITORED");
    expect(service.monitorStatus({ ...s, discontinuedAt: T0 }, 5)).toBe("DISCONTINUED");
  });
});

describe("source configuration", () => {
  it("turns monitoring on with a valid interval, logs it, and refuses non-official or discontinued sources", async () => {
    await service.setDbSourceMonitoring("src-meta", { enabled: true, intervalHours: 12 }, admin);
    expect(sources[0]).toMatchObject({ monitoringEnabled: true, checkIntervalHours: 12 });
    expect(events[0]).toMatchObject({ sourceId: "src-meta", kind: "SOURCE_MONITORING_UPDATED", actorId: admin.id, note: "Monitoring on, every 12 hours" });

    await expect(service.setDbSourceMonitoring("src-meta", { enabled: true, intervalHours: 0 }, admin)).rejects.toThrow(/between 1 and 720 hours/);
    await expect(service.setDbSourceMonitoring("src-meta", { enabled: true, intervalHours: 721 }, admin)).rejects.toThrow(/between 1 and 720 hours/);
    await expect(service.setDbSourceMonitoring("src-meta", { enabled: true }, reviewer)).rejects.toThrow(/Policy Administrator/);

    sources.push(source({ id: "src-odd", officialUrl: "https://example.org/policy", monitoringEnabled: false }));
    await expect(service.setDbSourceMonitoring("src-odd", { enabled: true }, admin)).rejects.toThrow(/known official domain/);

    await service.setDbSourceDiscontinued("src-meta", { discontinued: true, note: "Policy moved to a new help centre" }, admin);
    expect(sources[0].monitoringEnabled).toBe(false);
    expect(sources[0].discontinuedAt).toBeInstanceOf(Date);
    await expect(service.setDbSourceMonitoring("src-meta", { enabled: true }, admin)).rejects.toThrow(/Reinstate/);

    await service.setDbSourceDiscontinued("src-meta", { discontinued: false }, admin);
    expect(sources[0]).toMatchObject({ discontinuedAt: null, discontinuedNote: null });
    await expect(service.setDbSourceDiscontinued("src-meta", { discontinued: true, note: "x" }, admin)).rejects.toThrow(/why/);
    expect(events.map((e) => e.kind)).toEqual(["SOURCE_MONITORING_UPDATED", "SOURCE_MONITORING_UPDATED", "SOURCE_MONITORING_UPDATED"]);
    for (const s of sources) expect(s.verificationStatus).toBe("VERIFIED");
  });
});

describe("reviewDbChangeProposal", () => {
  async function openProposal() {
    await service.checkDbPolicySource("src-meta", admin, { fetcher: fixtureFetcher({ [URL_META]: { body: V1 } }), now: T0 });
    await service.checkDbPolicySource("src-meta", admin, { fetcher: fixtureFetcher({ [URL_META]: { body: V2 } }), now: hoursLater(24) });
    expect(proposals).toHaveLength(1);
    events.length = 0;
  }

  it("records the admin's decision with a note and logs it; never edits a rule or activates anything", async () => {
    await openProposal();
    await service.reviewDbChangeProposal("prop-1", { decision: "NO_RULE_CHANGE", note: "Read both versions; the new wording is already covered by SYN-META-01 v1." }, admin);
    expect(proposals[0]).toMatchObject({ status: "NO_RULE_CHANGE", resolvedById: admin.id, resultingVersionId: null });
    expect(proposals[0].resolvedAt).toBeInstanceOf(Date);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "SOURCE_CHANGE_REVIEWED", actorId: admin.id });
    expect(String(events[0].note)).toMatch(/CONTENT_CHANGED reviewed: NO_RULE_CHANGE/);
    expectNoRuleOrVerificationWrites();
  });

  it("requires a policy admin and a real note, and refuses to review twice", async () => {
    await openProposal();
    await expect(service.reviewDbChangeProposal("prop-1", { decision: "DISMISSED", note: "Looked at it carefully" }, reviewer)).rejects.toThrow(/Policy Administrator/);
    await expect(service.reviewDbChangeProposal("prop-1", { decision: "DISMISSED", note: "ok" }, admin)).rejects.toThrow(/what you checked/);
    await expect(service.reviewDbChangeProposal("prop-1", { decision: "APPROVED" as never, note: "Looked at it carefully" }, admin)).rejects.toThrow(/valid review decision/);
    await expect(service.reviewDbChangeProposal("prop-missing", { decision: "DISMISSED", note: "Looked at it carefully" }, admin)).rejects.toThrow(/not found/);
    expect(proposals[0].status).toBe("PENDING_REVIEW");

    await service.reviewDbChangeProposal("prop-1", { decision: "DISMISSED", note: "Duplicate of an item already handled" }, admin);
    await expect(service.reviewDbChangeProposal("prop-1", { decision: "NO_RULE_CHANGE", note: "Changing my mind" }, admin)).rejects.toThrow(/already been reviewed/);
    expect(proposals[0]).toMatchObject({ status: "DISMISSED", resolutionNote: "Duplicate of an item already handled" });
  });

  it("links a new draft or pending rule version for the record, but never an active one", async () => {
    await openProposal();
    prisma.policyRuleVersion.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "ver-draft" ? { id: "ver-draft", status: "DRAFT" } : where.id === "ver-active" ? { id: "ver-active", status: "ACTIVE" } : null,
    );
    await expect(service.reviewDbChangeProposal("prop-1", { decision: "RULE_UPDATE_STARTED", note: "Drafted v2 of SYN-META-01", resultingVersionId: "ver-active" }, admin)).rejects.toThrow(/not an already approved one/);
    await expect(service.reviewDbChangeProposal("prop-1", { decision: "RULE_UPDATE_STARTED", note: "Drafted v2 of SYN-META-01", resultingVersionId: "ver-nope" }, admin)).rejects.toThrow(/not found/);
    await service.reviewDbChangeProposal("prop-1", { decision: "RULE_UPDATE_STARTED", note: "Drafted v2 of SYN-META-01", resultingVersionId: "ver-draft" }, admin);
    expect(proposals[0]).toMatchObject({ status: "RULE_UPDATE_STARTED", resultingVersionId: "ver-draft" });
    // The linked version is read, never written: verification and approval stay with the Policy Library workflow.
    expect(prisma.policyRuleVersion.update).not.toHaveBeenCalled();
    expectNoRuleOrVerificationWrites();
  });
});
