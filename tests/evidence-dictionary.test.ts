import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_A, CLIENT_B, TEAM, createPrismaMock, type PrismaMock } from "./helpers";

// Evidence Dictionary (Nov 2): reusable records, attachments to creatives,
// reviewer checks, and the compliance passport's view of them. Prisma is
// mocked; nothing connects to a database or storage.

const h = vi.hoisted(() => ({ prisma: null as unknown as PrismaMock }));
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));
vi.mock("@/generated/prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code = "";
    },
  },
}));

const cmd = await import("@/lib/workflow/evidence-record-commands");
const evidenceCmd = await import("@/lib/workflow/commands");
const rules = await import("@/lib/workflow/evidence-records");
const data = await import("@/lib/data/evidence-records");
const reviewData = await import("@/lib/data/submission-review");
const labels = await import("@/lib/workflow/labels");

const SUBMITTED_AT = new Date("2026-10-10T10:00:00Z");
const BEFORE = new Date("2026-10-09T10:00:00Z");
const AFTER = new Date("2026-10-11T10:00:00Z");

const CLIENT_RECORD = { id: "rec-a", ownerClientId: CLIENT_A.id, title: "Practice licence", type: "CERTIFICATION", description: "Licence 12345", source: "State board", url: null, claimText: "Licensed physicians", status: "UNCHECKED" };
const TEAM_RECORD = { ...CLIENT_RECORD, id: "rec-team", ownerClientId: null, title: "FTC endorsement guides summary", type: "POLICY_REFERENCE" };

function setSubmission(status: string, clientId = CLIENT_A.id) {
  h.prisma.creative.findUnique.mockResolvedValue({ id: "s1", name: "Spring promo", workflow: "SUBMISSION_REVIEW", status, projectId: "p-a", updatedAt: new Date("2026-10-01"), project: { clientId } });
}

function setRound({ closed = false } = {}) {
  h.prisma.reviewCycle.findFirst.mockResolvedValue({ id: "c1", number: 1, closedAt: closed ? new Date() : null });
  h.prisma.submissionRound.findFirst.mockResolvedValue({ id: "r1", number: 1, versionId: "v1", decisions: [], submittedAt: SUBMITTED_AT });
  h.prisma.creativeVersion.findFirst.mockResolvedValue({ id: "v2", versionNumber: 2 });
}

beforeEach(() => {
  h.prisma = createPrismaMock();
});

// ---------------------------------------------------------------------------

describe("creating records (createEvidenceRecord)", () => {
  const INPUT = { title: "Practice licence", type: "CERTIFICATION", description: "Licence 12345, issued 2026", source: "State board", validUntil: "2027-06-30" };

  it("a client's record belongs to their own workspace whatever the browser sends; a team record is Clyntique's", async () => {
    h.prisma.evidenceRecord.create.mockResolvedValue({ id: "rec-1" });
    expect(await cmd.createEvidenceRecord(CLIENT_A, INPUT)).toEqual({ ok: true, recordId: "rec-1" });
    expect(h.prisma.evidenceRecord.create.mock.calls[0][0].data).toMatchObject({ ownerClientId: CLIENT_A.id, createdById: CLIENT_A.id, title: "Practice licence", type: "CERTIFICATION" });
    expect("status" in h.prisma.evidenceRecord.create.mock.calls[0][0].data).toBe(false); // status is the DB default UNCHECKED
    expect(h.prisma.evidenceRecord.create.mock.calls[0][0].data.validUntil.toISOString()).toBe("2027-06-30T23:59:59.999Z");

    expect((await cmd.createEvidenceRecord(TEAM, INPUT)).ok).toBe(true);
    expect(h.prisma.evidenceRecord.create.mock.calls[1][0].data).toMatchObject({ ownerClientId: null, createdById: TEAM.id });
  });

  it("validates the title, type, link, validity date, and refuses the reviewer-only policy reference type for clients", async () => {
    expect((await cmd.createEvidenceRecord(CLIENT_A, { ...INPUT, title: "x" })).ok).toBe(false);
    expect((await cmd.createEvidenceRecord(CLIENT_A, { ...INPUT, type: "VERIFIED" })).ok).toBe(false);
    expect((await cmd.createEvidenceRecord(CLIENT_A, { ...INPUT, type: "POLICY_REFERENCE" })).ok).toBe(false);
    expect((await cmd.createEvidenceRecord(CLIENT_A, { ...INPUT, url: "javascript:alert(1)" })).ok).toBe(false);
    expect((await cmd.createEvidenceRecord(CLIENT_A, { ...INPUT, validUntil: "30/06/2027" })).ok).toBe(false);
    expect((await cmd.createEvidenceRecord(CLIENT_A, { ...INPUT, validUntil: "2027-02-30" })).ok).toBe(false);
    expect((await cmd.createEvidenceRecord(CLIENT_A, { title: "Something", type: "OTHER" })).ok).toBe(false); // nothing to go on
    expect(h.prisma.evidenceRecord.create).not.toHaveBeenCalled();
    // The team may file a policy reference.
    h.prisma.evidenceRecord.create.mockResolvedValue({ id: "rec-2" });
    expect((await cmd.createEvidenceRecord(TEAM, { ...INPUT, type: "POLICY_REFERENCE" })).ok).toBe(true);
  });

  it("addEvidence files a record only when the client asks for it, and links the evidence to it", async () => {
    setSubmission("DRAFT");
    setRound();
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.evidenceRecord.create.mockResolvedValue({ id: "rec-9" });
    h.prisma.evidence.create.mockResolvedValue({ id: "e9" });
    const base = { creativeId: "s1", title: "Clinical study", type: "CLINICAL_STUDY", description: "Split-face study." };

    expect((await evidenceCmd.addEvidence(CLIENT_A, base)).ok).toBe(true);
    expect(h.prisma.evidenceRecord.create).not.toHaveBeenCalled();
    expect(h.prisma.evidence.create.mock.calls[0][0].data.recordId).toBeNull();

    expect((await evidenceCmd.addEvidence(CLIENT_A, { ...base, saveToDictionary: true })).ok).toBe(true);
    expect(h.prisma.evidenceRecord.create.mock.calls[0][0].data).toMatchObject({ ownerClientId: CLIENT_A.id, title: "Clinical study", type: "CLINICAL_STUDY" });
    expect(h.prisma.evidence.create.mock.calls[1][0].data.recordId).toBe("rec-9");
  });
});

// ---------------------------------------------------------------------------

describe("attaching a record to a creative (attachEvidenceRecord)", () => {
  function clientReady() {
    h.prisma.evidenceRecord.findUnique.mockResolvedValue(CLIENT_RECORD);
    setSubmission("CHANGES_REQUESTED");
    setRound();
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.evidence.create.mockResolvedValue({ id: "e-new" });
  }

  it("a client attaches their own record to their own submission: a new evidence item copies the record and points back to it", async () => {
    clientReady();
    const res = await cmd.attachEvidenceRecord(CLIENT_A, { recordId: "rec-a", creativeId: "s1", claimLocation: "Footer" });
    expect(res).toEqual({ ok: true, evidenceId: "e-new" });
    expect(h.prisma.evidence.create.mock.calls[0][0].data).toEqual({
      creativeId: "s1",
      title: "Practice licence",
      type: "CERTIFICATION",
      description: "Licence 12345",
      source: "State board",
      url: null,
      claimText: "Licensed physicians",
      claimLocation: "Footer",
      recordId: "rec-a",
      origin: "CLIENT_SUBMITTED",
      visibility: "SHARED",
      addedById: CLIENT_A.id,
      versionId: "v2",
    });
    // The same guarded no-op lock as addEvidence: status re-checked, ownership re-checked, "updated" untouched.
    expect(h.prisma.creative.updateMany.mock.calls[0][0].where).toMatchObject({ id: "s1", status: "CHANGES_REQUESTED", project: { clientId: CLIENT_A.id } });
  });

  it("isolation: another client's record, a Clyntique record, or another client's submission are refused", async () => {
    clientReady();
    expect(await cmd.attachEvidenceRecord(CLIENT_B, { recordId: "rec-a", creativeId: "s1" })).toEqual({ ok: false, error: "This evidence record is no longer available." });
    h.prisma.evidenceRecord.findUnique.mockResolvedValue(TEAM_RECORD);
    expect((await cmd.attachEvidenceRecord(CLIENT_A, { recordId: "rec-team", creativeId: "s1" })).ok).toBe(false);
    h.prisma.evidenceRecord.findUnique.mockResolvedValue(CLIENT_RECORD);
    setSubmission("CHANGES_REQUESTED", CLIENT_B.id);
    expect((await cmd.attachEvidenceRecord(CLIENT_A, { recordId: "rec-a", creativeId: "s1" })).ok).toBe(false);
    expect(h.prisma.evidence.create).not.toHaveBeenCalled();
  });

  it("only while the submission accepts evidence, and never twice while an attachment is active", async () => {
    clientReady();
    setSubmission("IN_REVIEW");
    expect((await cmd.attachEvidenceRecord(CLIENT_A, { recordId: "rec-a", creativeId: "s1" })).ok).toBe(false);
    setSubmission("REVIEW_COMPLETE");
    expect((await cmd.attachEvidenceRecord(CLIENT_A, { recordId: "rec-a", creativeId: "s1" })).ok).toBe(false);
    setSubmission("DRAFT");
    h.prisma.evidence.count.mockResolvedValue(1);
    expect(await cmd.attachEvidenceRecord(CLIENT_A, { recordId: "rec-a", creativeId: "s1" })).toEqual({ ok: false, error: "This record is already attached to this submission." });
    expect(h.prisma.evidence.count.mock.calls[0][0].where).toEqual({ creativeId: "s1", recordId: "rec-a", withdrawnAt: null });
    expect(h.prisma.evidence.create).not.toHaveBeenCalled();
  });

  it("findings it supports must be open for responses in the open cycle, and are linked in the same transaction", async () => {
    clientReady();
    h.prisma.finding.count.mockResolvedValue(1);
    expect((await cmd.attachEvidenceRecord(CLIENT_A, { recordId: "rec-a", creativeId: "s1", findingIds: ["f1"] })).ok).toBe(true);
    expect(h.prisma.findingEvidence.createMany.mock.calls[0][0].data).toEqual([{ findingId: "f1", evidenceId: "e-new", linkedById: CLIENT_A.id }]);
    h.prisma.finding.count.mockResolvedValue(0);
    expect((await cmd.attachEvidenceRecord(CLIENT_A, { recordId: "rec-a", creativeId: "s1", findingIds: ["f-other"] })).ok).toBe(false);
  });

  it("the team attaches a Clyntique record to a submission under review, on the version under review, with a visibility", async () => {
    h.prisma.evidenceRecord.findUnique.mockResolvedValue(TEAM_RECORD);
    setSubmission("IN_REVIEW");
    setRound();
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.evidence.create.mockResolvedValue({ id: "e-team" });

    expect((await cmd.attachEvidenceRecord(TEAM, { recordId: "rec-team", creativeId: "s1" })).ok).toBe(false); // visibility missing
    expect(await cmd.attachEvidenceRecord(TEAM, { recordId: "rec-team", creativeId: "s1", visibility: "INTERNAL" })).toEqual({ ok: true, evidenceId: "e-team" });
    expect(h.prisma.evidence.create.mock.calls[0][0].data).toMatchObject({ recordId: "rec-team", origin: "REVIEWER_ADDED", visibility: "INTERNAL", addedById: TEAM.id, versionId: "v1", type: "POLICY_REFERENCE" });
    expect(h.prisma.creative.updateMany.mock.calls[0][0].where).toMatchObject({ id: "s1", status: "IN_REVIEW" });

    // Never a client's record, never outside a review, never on a closed cycle.
    h.prisma.evidenceRecord.findUnique.mockResolvedValue(CLIENT_RECORD);
    expect((await cmd.attachEvidenceRecord(TEAM, { recordId: "rec-a", creativeId: "s1", visibility: "SHARED" })).ok).toBe(false);
    h.prisma.evidenceRecord.findUnique.mockResolvedValue(TEAM_RECORD);
    setSubmission("SUBMITTED");
    expect((await cmd.attachEvidenceRecord(TEAM, { recordId: "rec-team", creativeId: "s1", visibility: "SHARED" })).ok).toBe(false);
    setSubmission("IN_REVIEW");
    setRound({ closed: true });
    expect((await cmd.attachEvidenceRecord(TEAM, { recordId: "rec-team", creativeId: "s1", visibility: "SHARED" })).ok).toBe(false);
    expect(h.prisma.evidence.create).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------

describe("reviewer checks (checkEvidenceRecord)", () => {
  const SUBMITTED_ATTACHMENT = { createdAt: BEFORE, withdrawnAt: null, creative: { workflow: "SUBMISSION_REVIEW", status: "IN_REVIEW", rounds: [{ submittedAt: SUBMITTED_AT }] } };
  function setRecord(over: Record<string, unknown> = {}) {
    h.prisma.evidenceRecord.findUnique.mockResolvedValue({ id: "rec-a", ownerClientId: CLIENT_A.id, status: "UNCHECKED", attachments: [SUBMITTED_ATTACHMENT], ...over });
    h.prisma.evidenceRecordCheck.create.mockResolvedValue({ id: "k1" });
  }

  it("a TEAM reviewer records a check; the record's status follows the latest check; nothing is edited or deleted", async () => {
    setRecord();
    expect(await cmd.checkEvidenceRecord(TEAM, { recordId: "rec-a", result: "ACCEPTED" })).toEqual({ ok: true, checkId: "k1" });
    expect(h.prisma.evidenceRecordCheck.create.mock.calls[0][0].data).toEqual({ recordId: "rec-a", reviewerId: TEAM.id, result: "ACCEPTED", note: null });
    expect(h.prisma.evidenceRecord.update.mock.calls[0][0]).toEqual({ where: { id: "rec-a" }, data: { status: "ACCEPTED" } });
    expect((await cmd.checkEvidenceRecord(TEAM, { recordId: "rec-a", result: "NEEDS_MORE_INFO", note: "Licence number and issuing board missing." })).ok).toBe(true);
    expect(h.prisma.evidenceRecord.update.mock.calls[1][0].data).toEqual({ status: "NEEDS_MORE_INFO" });
    expect(h.prisma.evidenceRecordCheck.updateMany).not.toHaveBeenCalled();
    expect(h.prisma.evidenceRecordCheck.deleteMany).not.toHaveBeenCalled();
  });

  it("anything short of accepted needs a note; unknown results are refused", async () => {
    setRecord();
    expect(await cmd.checkEvidenceRecord(TEAM, { recordId: "rec-a", result: "NOT_ACCEPTED" })).toMatchObject({ ok: false, error: expect.stringMatching(/Explain/) });
    expect((await cmd.checkEvidenceRecord(TEAM, { recordId: "rec-a", result: "VERIFIED" })).ok).toBe(false);
    expect((await cmd.checkEvidenceRecord(TEAM, { recordId: "rec-a", result: "UNCHECKED" })).ok).toBe(false);
    expect(h.prisma.evidenceRecordCheck.create).not.toHaveBeenCalled();
  });

  it("clients can't check; the team can't check a client record it hasn't received through a submission", async () => {
    setRecord();
    expect((await cmd.checkEvidenceRecord(CLIENT_A, { recordId: "rec-a", result: "ACCEPTED" })).ok).toBe(false);
    // Attached only to a draft: private to the client.
    setRecord({ attachments: [{ ...SUBMITTED_ATTACHMENT, creative: { workflow: "SUBMISSION_REVIEW", status: "DRAFT", rounds: [] } }] });
    expect(await cmd.checkEvidenceRecord(TEAM, { recordId: "rec-a", result: "ACCEPTED" })).toEqual({ ok: false, error: "This evidence record is no longer available." });
    // Attached after the latest submission: still being prepared.
    setRecord({ attachments: [{ ...SUBMITTED_ATTACHMENT, createdAt: AFTER }] });
    expect((await cmd.checkEvidenceRecord(TEAM, { recordId: "rec-a", result: "ACCEPTED" })).ok).toBe(false);
    // Withdrawn before submission: never reached the team.
    setRecord({ attachments: [{ ...SUBMITTED_ATTACHMENT, withdrawnAt: new Date() }] });
    expect((await cmd.checkEvidenceRecord(TEAM, { recordId: "rec-a", result: "ACCEPTED" })).ok).toBe(false);
    // Never attached at all.
    setRecord({ attachments: [] });
    expect((await cmd.checkEvidenceRecord(TEAM, { recordId: "rec-a", result: "ACCEPTED" })).ok).toBe(false);
    expect(h.prisma.evidenceRecordCheck.create).not.toHaveBeenCalled();
    // Clyntique's own records need no submission.
    setRecord({ ownerClientId: null, attachments: [] });
    expect((await cmd.checkEvidenceRecord(TEAM, { recordId: "rec-a", result: "ACCEPTED" })).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe("visibility rules (pure)", () => {
  const sub = (over: Partial<ReturnType<typeof base>> = {}) => ({ ...base(), ...over });
  const base = () => ({ createdAt: BEFORE, withdrawnAt: null as Date | null, creative: { workflow: "SUBMISSION_REVIEW", status: "SUBMITTED", lastSubmittedAt: SUBMITTED_AT as Date | null } });

  it("recordOwnedBy: a client owns records of their workspace; the team owns Clyntique's", () => {
    expect(rules.recordOwnedBy(CLIENT_A, { ownerClientId: CLIENT_A.id })).toBe(true);
    expect(rules.recordOwnedBy(CLIENT_A, { ownerClientId: CLIENT_B.id })).toBe(false);
    expect(rules.recordOwnedBy(CLIENT_A, { ownerClientId: null })).toBe(false);
    expect(rules.recordOwnedBy(TEAM, { ownerClientId: null })).toBe(true);
    expect(rules.recordOwnedBy(TEAM, { ownerClientId: CLIENT_A.id })).toBe(false);
  });

  it("teamMaySeeRecord: Clyntique records always; a client's only through a submitted, active attachment", () => {
    expect(rules.teamMaySeeRecord({ ownerClientId: null, attachments: [] })).toBe(true);
    expect(rules.teamMaySeeRecord({ ownerClientId: CLIENT_A.id, attachments: [] })).toBe(false);
    expect(rules.teamMaySeeRecord({ ownerClientId: CLIENT_A.id, attachments: [sub()] })).toBe(true);
    expect(rules.teamMaySeeRecord({ ownerClientId: CLIENT_A.id, attachments: [sub({ createdAt: AFTER })] })).toBe(false);
    expect(rules.teamMaySeeRecord({ ownerClientId: CLIENT_A.id, attachments: [sub({ withdrawnAt: new Date() })] })).toBe(false);
    expect(rules.teamMaySeeRecord({ ownerClientId: CLIENT_A.id, attachments: [sub({ creative: { workflow: "SUBMISSION_REVIEW", status: "DRAFT", lastSubmittedAt: null } })] })).toBe(false);
    expect(rules.teamMaySeeRecord({ ownerClientId: CLIENT_A.id, attachments: [sub({ creative: { workflow: "LEGACY_CLIENT_APPROVAL", status: "IN_REVIEW", lastSubmittedAt: null } })] })).toBe(false);
    // One qualifying attachment is enough.
    expect(rules.teamMaySeeRecord({ ownerClientId: CLIENT_A.id, attachments: [sub({ createdAt: AFTER }), sub()] })).toBe(true);
  });

  it("recordExpired and parseValidUntil", () => {
    expect(rules.recordExpired(null)).toBe(false);
    expect(rules.recordExpired(new Date("2020-01-01"), new Date("2026-11-02"))).toBe(true);
    expect(rules.recordExpired(new Date("2027-01-01"), new Date("2026-11-02"))).toBe(false);
    expect(rules.parseValidUntil("")).toEqual({ ok: true, date: null });
    expect(rules.parseValidUntil("2027-06-30")).toMatchObject({ ok: true });
    expect(rules.parseValidUntil("2027-13-01")).toEqual({ ok: false });
    expect(rules.parseValidUntil("soon")).toEqual({ ok: false });
  });

  it("labels never present an internal check as a certification or approval", () => {
    const text = [
      ...Object.values(labels.EVIDENCE_RECORD_STATUS_LABEL),
      ...Object.values(labels.EVIDENCE_RECORD_STATUS_DESCRIPTION),
      ...Object.values(labels.EVIDENCE_RECORD_CHECK_LABEL),
      labels.EVIDENCE_RECORD_NOTICE,
      labels.EVIDENCE_DICTIONARY_NOTICE,
    ]
      .join(" ")
      .toLowerCase();
    for (const phrase of rules.EVIDENCE_RECORD_FORBIDDEN_WORDS) expect(text).not.toContain(phrase);
    expect(text).not.toMatch(/\bcertif/);
    expect(labels.EVIDENCE_RECORD_NOTICE).toMatch(/not a scientific, legal, regulatory or platform validation/);
  });
});

// ---------------------------------------------------------------------------

describe("loaders apply the workspace scope", () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: "rec-a",
    ownerClientId: CLIENT_A.id,
    title: "Practice licence",
    type: "CERTIFICATION",
    status: "UNCHECKED",
    claimText: null,
    source: null,
    validUntil: null,
    createdAt: BEFORE,
    owner: { name: "Client A" },
    attachments: [],
    checks: [],
    ...over,
  });
  const attachment = (over: Record<string, unknown> = {}) => ({
    id: "e1",
    createdAt: BEFORE,
    withdrawnAt: null,
    version: { versionNumber: 1 },
    creative: { id: "s1", name: "Spring promo", workflow: "SUBMISSION_REVIEW", status: "SUBMITTED", project: { name: "P", clientId: CLIENT_A.id }, rounds: [{ submittedAt: SUBMITTED_AT, submittedName: "Spring promo" }] },
    ...over,
  });

  it("recordScope: a client only their own workspace; the team Clyntique's plus records attached to submitted work", () => {
    expect(data.recordScope(CLIENT_A)).toEqual({ ownerClientId: CLIENT_A.id });
    expect(data.recordScope(TEAM)).toEqual({ OR: [{ ownerClientId: null }, { attachments: { some: { withdrawnAt: null, creative: { workflow: "SUBMISSION_REVIEW", status: { not: "DRAFT" } } } } }] });
  });

  it("getEvidenceRecords: queries within the scope, then the team keeps only records that reached it", async () => {
    h.prisma.evidenceRecord.findMany.mockResolvedValue([row(), row({ id: "rec-prepared", attachments: [attachment({ createdAt: AFTER })] }), row({ id: "rec-seen", attachments: [attachment()] }), row({ id: "rec-team", ownerClientId: null, owner: null })]);
    const team = await data.getEvidenceRecords(TEAM, { query: "licence" });
    expect(h.prisma.evidenceRecord.findMany.mock.calls[0][0].where).toEqual({ AND: [data.recordScope(TEAM), { AND: [{ OR: expect.any(Array) }] }] });
    expect(team.map((r) => r.id)).toEqual(["rec-seen", "rec-team"]);
    expect(team[0]).toMatchObject({ ownerName: "Client A", isClyntique: false, usageCount: 1 });
    expect(team[1]).toMatchObject({ ownerName: null, isClyntique: true, usageCount: 0 });

    const client = await data.getEvidenceRecords(CLIENT_A);
    expect(h.prisma.evidenceRecord.findMany.mock.calls[1][0].where).toEqual({ AND: [{ ownerClientId: CLIENT_A.id }, {}] });
    // A client never learns a client name column exists; usage counts their own attachments, prepared or not.
    expect(client.map((r) => [r.id, r.ownerName, r.usageCount])).toEqual([
      ["rec-a", null, 0],
      ["rec-prepared", null, 1],
      ["rec-seen", null, 1],
      ["rec-team", null, 0],
    ]);
  });

  it("getEvidenceRecord: the team gets null for a client's record it hasn't received; names of reviewers are masked for clients", async () => {
    const detail = (over: Record<string, unknown> = {}) =>
      row({ description: "Licence 12345", url: null, createdBy: { name: "Client A", role: "CLIENT" }, checks: [{ id: "k1", result: "NEEDS_MORE_INFO", note: "Board missing", createdAt: AFTER, reviewer: { name: "Sam Reviewer" } }], ...over });
    h.prisma.evidenceRecord.findFirst.mockResolvedValue(detail({ attachments: [attachment({ createdAt: AFTER })] }));
    expect(await data.getEvidenceRecord(TEAM, "rec-a")).toBeNull();

    h.prisma.evidenceRecord.findFirst.mockResolvedValue(detail({ attachments: [attachment()] }));
    const team = await data.getEvidenceRecord(TEAM, "rec-a");
    expect(h.prisma.evidenceRecord.findFirst.mock.calls[1][0].where).toEqual({ AND: [{ id: "rec-a" }, data.recordScope(TEAM)] });
    expect(team?.checks[0].reviewerName).toBe("Sam Reviewer");
    expect(team?.canCheck).toBe(true);
    expect(team?.attachTargets).toEqual([]); // a client's record is never attached by the team
    expect(team?.usages[0]).toMatchObject({ creativeId: "s1", href: "/admin/creatives/s1?tab=evidence#evidence-e1", recordHref: "/admin/creatives/s1/record" });

    const client = await data.getEvidenceRecord(CLIENT_A, "rec-a");
    expect(client?.checks[0].reviewerName).toBe("Clyntique reviewer");
    expect(client?.canCheck).toBe(false);
    expect(client?.usages[0].href).toBe("/dashboard/creatives/s1?tab=evidence#evidence-e1");
  });

  it("getAttachableRecords: nothing when evidence can't be added now; otherwise own records not already attached", async () => {
    h.prisma.creative.findFirst.mockResolvedValue({ id: "s1", workflow: "SUBMISSION_REVIEW", status: "IN_REVIEW", project: { clientId: CLIENT_A.id } });
    expect(await data.getAttachableRecords(CLIENT_A, "s1")).toEqual([]);
    h.prisma.creative.findFirst.mockResolvedValue({ id: "s1", workflow: "SUBMISSION_REVIEW", status: "DRAFT", project: { clientId: CLIENT_A.id } });
    h.prisma.evidenceRecord.findMany.mockResolvedValue([{ id: "rec-a", title: "Practice licence", type: "CERTIFICATION", status: "ACCEPTED", validUntil: null }]);
    expect(await data.getAttachableRecords(CLIENT_A, "s1")).toEqual([{ id: "rec-a", title: "Practice licence", type: "CERTIFICATION", status: "ACCEPTED", expired: false }]);
    expect(h.prisma.evidenceRecord.findMany.mock.calls[0][0].where).toEqual({ ownerClientId: CLIENT_A.id, attachments: { none: { creativeId: "s1", withdrawnAt: null } } });
    // The team: Clyntique records, and only while the submission is under review.
    h.prisma.creative.findFirst.mockResolvedValue({ id: "s1", workflow: "SUBMISSION_REVIEW", status: "IN_REVIEW", project: { clientId: CLIENT_A.id } });
    await data.getAttachableRecords(TEAM, "s1");
    expect(h.prisma.evidenceRecord.findMany.mock.calls[1][0].where).toMatchObject({ ownerClientId: null });
  });
});

// ---------------------------------------------------------------------------

describe("compliance passport accuracy (getSubmissionReview)", () => {
  function setReview(evidence: Record<string, unknown>[]) {
    h.prisma.creative.findFirst.mockResolvedValue({ id: "s1", status: "REVIEW_COMPLETE", project: { clientId: CLIENT_A.id } });
    h.prisma.reviewCycle.findFirst.mockResolvedValue({ id: "c1", number: 1, closedAt: new Date("2026-10-12"), rounds: [{ id: "r1", number: 1, note: null, submittedAt: SUBMITTED_AT, submittedBy: { name: "Client A" }, versionId: "v1", version: { id: "v1", versionNumber: 1, mediaType: "IMAGE", fileName: "a.png", changeNotes: null }, decisions: [{ id: "d1", kind: "FINAL", outcome: "NO_ISSUES_IDENTIFIED" }] }] });
    h.prisma.reviewDecision.findMany.mockResolvedValue([{ id: "d1", kind: "FINAL", outcome: "NO_ISSUES_IDENTIFIED", summary: "Fine.", scopeNote: null, createdAt: new Date("2026-10-12"), version: { versionNumber: 1 }, round: { number: 1 }, cycle: { number: 1 }, reviewer: { name: "Sam Reviewer" } }]);
    h.prisma.evidence.findMany.mockResolvedValue(
      evidence.map((e) => ({
        id: "e1",
        title: "Practice licence",
        type: "CERTIFICATION",
        description: null,
        source: null,
        url: null,
        origin: "CLIENT_SUBMITTED",
        visibility: "SHARED",
        withdrawnAt: null,
        withdrawnBy: null,
        createdAt: BEFORE,
        addedById: CLIENT_A.id,
        fileName: null,
        fileSize: null,
        mimeType: null,
        fileUrl: null,
        addedBy: { name: "Client A" },
        findings: [],
        claimText: "Licensed physicians",
        claimLocation: "Footer",
        version: { versionNumber: 1 },
        policyRuleVersion: null,
        assessments: [],
        record: null,
        ...e,
      })),
    );
  }

  it("carries the dictionary record's current status, validity and a link the viewer may open", async () => {
    setReview([{ record: { id: "rec-a", ownerClientId: CLIENT_A.id, status: "ACCEPTED", validUntil: new Date("2020-01-01"), document: { title: "Study 2025", status: "DELETED" } } }]);
    const client = await reviewData.getSubmissionReview(CLIENT_A, "s1");
    expect(client?.evidence[0].record).toEqual({ id: "rec-a", status: "ACCEPTED", validUntil: new Date("2020-01-01"), expired: true, href: "/dashboard/evidence/rec-a", document: { title: "Study 2025", deleted: true } });
    const team = await reviewData.getSubmissionReview(TEAM, "s1");
    expect(team?.evidence[0].record?.href).toBe("/admin/evidence/rec-a");
  });

  it("a client gets no link to a Clyntique record behind shared reviewer evidence, and evidence without a record has none", async () => {
    setReview([{ origin: "REVIEWER_ADDED", createdAt: new Date("2026-10-11"), record: { id: "rec-team", ownerClientId: null, status: "UNCHECKED", validUntil: null } }]);
    const client = await reviewData.getSubmissionReview(CLIENT_A, "s1");
    expect(client?.evidence[0].record).toEqual({ id: "rec-team", status: "UNCHECKED", validUntil: null, expired: false, href: null, document: null });
    setReview([{}]);
    expect((await reviewData.getSubmissionReview(CLIENT_A, "s1"))?.evidence[0].record).toBeNull();
  });
});
