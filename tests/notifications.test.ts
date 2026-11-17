import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { CLIENT_A, CLIENT_B, TEAM, createPrismaMock, type PrismaMock } from "./helpers";

// PR D (Nov 16): recipient-specific in-app notifications. Prisma is mocked;
// the real-PostgreSQL behaviour (savepoint, ON CONFLICT, cascades) is covered
// by scripts/rehearse-notifications-pg.ts.

const h = vi.hoisted(() => ({ prisma: null as unknown as ReturnType<typeof mockPrisma>, currentUser: null as CurrentUser | null }));
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: vi.fn(async () => h.currentUser) }));
vi.mock("@/generated/prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code = "";
    },
  },
}));

const emit = await import("@/lib/notifications/emit");
const events = await import("@/lib/notifications/events");
const data = await import("@/lib/notifications/data");
const actions = await import("@/lib/notifications/actions");
const cmd = await import("@/lib/workflow/commands");
const chat = await import("@/lib/messages/commands");

const TEAM_2: CurrentUser = { id: "team-2", name: "Second Reviewer", email: "t2@test.invalid", role: "TEAM" };

function sqlOf(call: unknown[]) {
  return (call[0] as TemplateStringsArray).join("?");
}
function savepointCalls(p: PrismaMock) {
  return p.$executeRaw.mock.calls.map((c) => sqlOf(c).trim().split(/\s+/).slice(0, 3).join(" "));
}
function created(p: PrismaMock) {
  return p.notification.createMany.mock.calls.flatMap((c) => (c[0] as { data: Record<string, unknown>[] }).data);
}

function mockPrisma() {
  const p = createPrismaMock() as PrismaMock & { conversation: Record<string, ReturnType<typeof vi.fn>>; message: Record<string, ReturnType<typeof vi.fn>> };
  p.conversation = { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn().mockResolvedValue(null) };
  p.message = { updateMany: vi.fn().mockResolvedValue({ count: 0 }) };
  return p;
}

beforeEach(() => {
  h.prisma = mockPrisma();
  h.prisma.user.findMany.mockResolvedValue([{ id: TEAM.id }, { id: TEAM_2.id }]);
  h.prisma.notification.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
});

describe("prepareDrafts and links", () => {
  const base = { kind: "NEW_MESSAGE" as const, dedupeKey: "k", title: "Hello", href: "/dashboard/messages/c1" };

  it("never notifies the actor, drops unsafe links and duplicate keys", () => {
    const out = emit.prepareDrafts(
      [
        { ...base, recipientId: "actor" },
        { ...base, recipientId: "a" },
        { ...base, recipientId: "a" },
        { ...base, recipientId: "b", href: "https://evil.example/x" },
        { ...base, recipientId: "c", href: "//evil.example" },
        { ...base, recipientId: "d", href: "/dashboard/../admin" },
        { ...base, recipientId: "e", href: "javascript:alert(1)" },
      ],
      "actor",
    );
    expect(out.map((d) => d.recipientId)).toEqual(["a"]);
  });

  it("accepts only relative links under /dashboard or /admin", () => {
    expect(emit.isSafeHref("/admin/creatives/c1")).toBe(true);
    expect(emit.isSafeHref("/dashboard/creatives/c1/record")).toBe(true);
    expect(emit.isSafeHref("/policy-dashboard")).toBe(false);
    expect(emit.isSafeHref("/admin/creatives/c1#x")).toBe(false);
  });

  it("clips long titles and bodies", () => {
    const [d] = emit.prepareDrafts([{ ...base, recipientId: "a", title: "x".repeat(500), body: "y".repeat(500) }], "z");
    expect(d.title.length).toBe(200);
    expect(d.body!.length).toBe(300);
  });
});

describe("failure handling: best-effort inside the transaction", () => {
  it("wraps the writes in a savepoint and releases it on success", async () => {
    const out = await events.notifySubmissionReceived(h.prisma as never, CLIENT_A, {
      creativeId: "s1", roundId: "r1", roundNumber: 1, cycleNumber: 1, submittedName: "Spring promo", resubmission: false,
    });
    expect(out).toEqual({ written: 2, failed: false });
    expect(savepointCalls(h.prisma)).toEqual(["SAVEPOINT clyntique_notify", "RELEASE SAVEPOINT clyntique_notify"]);
  });

  it("rolls back to the savepoint and does not throw when a write fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.prisma.notification.createMany.mockRejectedValue(Object.assign(new Error("relation does not exist"), { code: "P2021" }));
    const out = await events.notifySubmissionReceived(h.prisma as never, CLIENT_A, {
      creativeId: "s1", roundId: "r1", roundNumber: 1, cycleNumber: 1, submittedName: "Spring promo", resubmission: false,
    });
    expect(out).toEqual({ written: 0, failed: true });
    expect(savepointCalls(h.prisma)).toEqual(["SAVEPOINT clyntique_notify", "ROLLBACK TO SAVEPOINT"]);
    // Logged without row data.
    expect(spy).toHaveBeenCalledWith("notifications: submit skipped", "Error");
    spy.mockRestore();
  });

  it("contains a failing recipient lookup too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.prisma.user.findMany.mockRejectedValue(new Error("boom"));
    const out = await events.notifySubmissionReceived(h.prisma as never, CLIENT_A, {
      creativeId: "s1", roundId: "r1", roundNumber: 1, cycleNumber: 1, submittedName: "x", resubmission: false,
    });
    expect(out.failed).toBe(true);
  });

  it("a submission still succeeds when its notification write fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.prisma.creative.findUnique.mockResolvedValue({
      id: "s1", name: "Spring promo", description: null, context: null, workflow: "SUBMISSION_REVIEW", status: "DRAFT",
      format: "FEED", industry: "HEALTHCARE", projectId: "p-a", updatedAt: new Date(), project: { clientId: CLIENT_A.id },
    });
    h.prisma.creative.findUniqueOrThrow.mockResolvedValue({ name: "Spring promo", description: null, context: null, industry: "HEALTHCARE" });
    h.prisma.creativeVersion.findFirst.mockResolvedValue({ id: "v1", versionNumber: 1 });
    h.prisma.submissionMarket.count.mockResolvedValue(1);
    h.prisma.submissionPlatform.count.mockResolvedValue(1);
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.reviewCycle.create.mockResolvedValue({ id: "c1" });
    h.prisma.submissionRound.create.mockResolvedValue({ id: "r1" });
    h.prisma.notification.createMany.mockRejectedValue(new Error("notifications unavailable"));
    const result = await cmd.submitForReview(CLIENT_A, "s1");
    expect(result).toEqual({ ok: true, roundId: "r1" });
    expect(h.prisma.activity.create).toHaveBeenCalledTimes(1);
  });

  it("a review start still succeeds when its notification write fails, and writes nothing when the step is refused", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.prisma.creative.findUnique.mockResolvedValue({
      id: "s1", name: "Spring promo", workflow: "SUBMISSION_REVIEW", status: "SUBMITTED", projectId: "p-a", updatedAt: new Date(), project: { clientId: CLIENT_A.id },
    });
    h.prisma.submissionRound.findFirst.mockResolvedValue({ id: "r1" });
    h.prisma.creative.updateMany.mockResolvedValue({ count: 1 });
    h.prisma.notification.createMany.mockRejectedValue(new Error("x"));
    expect(await cmd.startReview(TEAM, "s1")).toEqual({ ok: true });

    h.prisma = mockPrisma();
    h.prisma.creative.findUnique.mockResolvedValue({
      id: "s1", name: "Spring promo", workflow: "SUBMISSION_REVIEW", status: "SUBMITTED", projectId: "p-a", updatedAt: new Date(), project: { clientId: CLIENT_A.id },
    });
    h.prisma.creative.updateMany.mockResolvedValue({ count: 0 }); // another reviewer won
    expect((await cmd.startReview(TEAM, "s1")).ok).toBe(false);
    expect(h.prisma.notification.createMany).not.toHaveBeenCalled();
    expect(h.prisma.$executeRaw).not.toHaveBeenCalled();
  });
});

describe("event-to-recipient mapping", () => {
  it("new submission: every Team user, keyed by round, titled from the submitted snapshot", async () => {
    await events.notifySubmissionReceived(h.prisma as never, CLIENT_A, {
      creativeId: "s1", roundId: "r1", roundNumber: 1, cycleNumber: 1, submittedName: "Spring promo", resubmission: false,
    });
    expect(created(h.prisma)).toEqual([
      expect.objectContaining({ recipientId: TEAM.id, kind: "SUBMISSION_RECEIVED", dedupeKey: "round:r1", title: "New submission: “Spring promo”", href: "/admin/creatives/s1" }),
      expect.objectContaining({ recipientId: TEAM_2.id, dedupeKey: "round:r1" }),
    ]);
    expect(h.prisma.notification.createMany.mock.calls[0][0]).toMatchObject({ skipDuplicates: true });
  });

  it("resubmission: Team, its own round key", async () => {
    await events.notifySubmissionReceived(h.prisma as never, CLIENT_A, {
      creativeId: "s1", roundId: "r3", roundNumber: 3, cycleNumber: 1, submittedName: "Spring promo", resubmission: true,
    });
    expect(created(h.prisma)[0]).toMatchObject({ kind: "RESUBMISSION_RECEIVED", dedupeKey: "round:r3", title: "Resubmitted: “Spring promo” (round 3)" });
  });

  it("review started: only the creative's own client, read from the database", async () => {
    h.prisma.creative.findUnique.mockResolvedValue({ name: "Spring promo", workflow: "SUBMISSION_REVIEW", project: { clientId: CLIENT_A.id } });
    h.prisma.submissionRound.findFirst.mockResolvedValue({ id: "r1" });
    await events.notifyReviewStarted(h.prisma as never, TEAM, { creativeId: "s1" });
    expect(created(h.prisma)).toEqual([
      expect.objectContaining({ recipientId: CLIENT_A.id, kind: "REVIEW_STARTED", dedupeKey: "review-started:r1", href: "/dashboard/creatives/s1" }),
    ]);
    expect(created(h.prisma)[0].title).toContain("Clyntique Reviewer");
    expect(created(h.prisma)[0].title).not.toContain(TEAM.name);
  });

  it("legacy creatives never notify", async () => {
    h.prisma.creative.findUnique.mockResolvedValue({ name: "Old", workflow: "LEGACY_CLIENT_APPROVAL", project: { clientId: CLIENT_A.id } });
    await events.notifyReviewStarted(h.prisma as never, TEAM, { creativeId: "s1" });
    expect(h.prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it("changes requested: client, decision key, finding count; evidence assessments as a separate item", async () => {
    h.prisma.creative.findUnique.mockResolvedValue({ name: "Spring promo", workflow: "SUBMISSION_REVIEW", project: { clientId: CLIENT_A.id } });
    h.prisma.finding.count.mockResolvedValue(2);
    h.prisma.evidenceAssessment.count.mockResolvedValue(1);
    await events.notifyDecisionPublished(h.prisma as never, TEAM, { creativeId: "s1", cycleId: "c1", decisionId: "d1", final: false });
    expect(created(h.prisma)).toEqual([
      expect.objectContaining({ recipientId: CLIENT_A.id, kind: "CHANGES_REQUESTED", dedupeKey: "decision:d1", title: "Changes requested on “Spring promo”", body: "Clyntique Reviewer shared 2 findings to address." }),
      expect.objectContaining({ recipientId: CLIENT_A.id, kind: "EVIDENCE_REVIEWED", dedupeKey: "decision:d1:evidence", title: "1 evidence item reviewed on “Spring promo”" }),
    ]);
  });

  it("final decision: worded as internal review, never approval", async () => {
    h.prisma.creative.findUnique.mockResolvedValue({ name: "Spring promo", workflow: "SUBMISSION_REVIEW", project: { clientId: CLIENT_A.id } });
    await events.notifyDecisionPublished(h.prisma as never, TEAM, { creativeId: "s1", cycleId: "c1", decisionId: "d2", final: true });
    const [n] = created(h.prisma);
    expect(n).toMatchObject({ kind: "REVIEW_COMPLETED", dedupeKey: "decision:d2", href: "/dashboard/creatives/s1/record" });
    expect(`${n.title} ${n.body}`).toMatch(/internal review/i);
    expect(`${n.title} ${n.body}`).toMatch(/not a platform or regulatory decision/i);
    expect(`${n.title} ${n.body}`).not.toMatch(/\bapproved?\b/i);
  });

  it("evidence assessments count only those since the previous decision in the cycle", async () => {
    const at = new Date("2026-11-01T00:00:00Z");
    h.prisma.creative.findUnique.mockResolvedValue({ name: "S", workflow: "SUBMISSION_REVIEW", project: { clientId: CLIENT_A.id } });
    h.prisma.reviewDecision.findFirst.mockResolvedValue({ createdAt: at });
    await events.notifyDecisionPublished(h.prisma as never, TEAM, { creativeId: "s1", cycleId: "c1", decisionId: "d2", final: true });
    expect(h.prisma.evidenceAssessment.count).toHaveBeenCalledWith({ where: { cycleId: "c1", createdAt: { gt: at } } });
  });

  it("re-review opened: client, cycle key", async () => {
    h.prisma.creative.findUnique.mockResolvedValue({ name: "S", workflow: "SUBMISSION_REVIEW", project: { clientId: CLIENT_A.id } });
    await events.notifyReviewReopened(h.prisma as never, TEAM, { creativeId: "s1", cycleId: "c2", cycleNumber: 2 });
    expect(created(h.prisma)[0]).toMatchObject({ recipientId: CLIENT_A.id, kind: "REVIEW_REOPENED", dedupeKey: "cycle:c2" });
  });

  it("evidence record checked: its owning client only; Clyntique records notify nobody", async () => {
    h.prisma.evidenceRecord.findUnique.mockResolvedValue({ ownerClientId: CLIENT_B.id, title: "Trial summary" });
    await events.notifyRecordChecked(h.prisma as never, TEAM, { recordId: "er1", checkId: "k1" });
    expect(created(h.prisma)).toEqual([
      expect.objectContaining({ recipientId: CLIENT_B.id, kind: "EVIDENCE_REVIEWED", dedupeKey: "record-check:k1", href: "/dashboard/evidence/er1", evidenceRecordId: "er1" }),
    ]);
    h.prisma.notification.createMany.mockClear();
    h.prisma.evidenceRecord.findUnique.mockResolvedValue({ ownerClientId: null, title: "Ours" });
    await events.notifyRecordChecked(h.prisma as never, TEAM, { recordId: "er2", checkId: "k2" });
    expect(h.prisma.notification.createMany).not.toHaveBeenCalled();
  });

  function conversation(over: Record<string, unknown> = {}) {
    return {
      clientId: CLIENT_A.id,
      creativeId: "s1",
      assignedReviewerId: null,
      client: { name: "Client A" },
      creative: { name: "Live edited title", rounds: [{ submittedName: "Submitted title" }] },
      ...over,
    };
  }
  function upserts(p: PrismaMock) {
    return p.$executeRaw.mock.calls.filter((c) => sqlOf(c).includes("INSERT INTO \"Notification\""));
  }

  it("client message: every Team user, one re-arming row per conversation, snapshot subject, no message text", async () => {
    h.prisma.conversation.findUnique.mockResolvedValue(conversation());
    await events.notifyNewMessage(h.prisma as never, CLIENT_A, { conversationId: "conv-1" });
    const rows = upserts(h.prisma);
    expect(rows).toHaveLength(2);
    expect(sqlOf(rows[0])).toContain("ON CONFLICT (\"recipientId\", \"dedupeKey\") DO UPDATE");
    const values = rows[0].slice(1);
    expect(values).toContain(TEAM.id);
    expect(values).toContain("conversation:conv-1");
    expect(values).toContain("/admin/messages/conv-1");
    expect(values).toContain("New message from Client A about “Submitted title”");
    expect(values.join(" ")).not.toContain("Live edited title");
    expect(h.prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it("client message on an assigned conversation goes to that reviewer only", async () => {
    h.prisma.conversation.findUnique.mockResolvedValue(conversation({ assignedReviewerId: TEAM_2.id }));
    await events.notifyNewMessage(h.prisma as never, CLIENT_A, { conversationId: "conv-1" });
    expect(upserts(h.prisma)).toHaveLength(1);
    expect(upserts(h.prisma)[0].slice(1)).toContain(TEAM_2.id);
  });

  it("reviewer message: the conversation's client, as Clyntique Reviewer", async () => {
    h.prisma.conversation.findUnique.mockResolvedValue(conversation({ creativeId: null, creative: null }));
    await events.notifyNewMessage(h.prisma as never, TEAM, { conversationId: "conv-1" });
    const rows = upserts(h.prisma);
    expect(rows).toHaveLength(1);
    const values = rows[0].slice(1);
    expect(values).toContain(CLIENT_A.id);
    expect(values).toContain("Clyntique Reviewer replied about your general conversation");
    expect(values).toContain("/dashboard/messages/conv-1");
    expect(values.join(" ")).not.toContain(TEAM.name);
  });

  it("muted kinds are skipped; required kinds are kept even when muted", async () => {
    h.prisma.creative.findUnique.mockResolvedValue({ name: "S", workflow: "SUBMISSION_REVIEW", project: { clientId: CLIENT_A.id } });
    h.prisma.evidenceAssessment.count.mockResolvedValue(1);
    h.prisma.notificationPreference.findMany.mockResolvedValue([{ userId: CLIENT_A.id, kind: "EVIDENCE_REVIEWED" }]);
    await events.notifyDecisionPublished(h.prisma as never, TEAM, { creativeId: "s1", cycleId: "c1", decisionId: "d1", final: false });
    expect(created(h.prisma).map((n) => n.kind)).toEqual(["CHANGES_REQUESTED"]);
    // The preference query only asks about mutable kinds.
    expect(h.prisma.notificationPreference.findMany.mock.calls[0][0].where.kind.in).toEqual(["EVIDENCE_REVIEWED"]);
  });
});

describe("where notifications are (and are not) generated", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  function bodyOf(file: string, fn: string) {
    const s = src(file);
    const start = s.indexOf(`export async function ${fn}(`);
    const next = s.indexOf("\nexport ", start + 10);
    return s.slice(start, next === -1 ? undefined : next);
  }

  it("each emitting command calls exactly its notifier", () => {
    const f = "src/lib/workflow/commands.ts";
    expect(bodyOf(f, "submitForReview")).toContain("notifySubmissionReceived(");
    expect(bodyOf(f, "resubmit")).toContain("notifySubmissionReceived(");
    expect(bodyOf(f, "startReview")).toContain("notifyReviewStarted(");
    expect(bodyOf(f, "requestChanges")).toContain("notifyDecisionPublished(");
    expect(bodyOf(f, "completeReview")).toContain("notifyDecisionPublished(");
    expect(bodyOf(f, "openReviewCycle")).toContain("notifyReviewReopened(");
    expect(bodyOf("src/lib/workflow/evidence-record-commands.ts", "checkEvidenceRecord")).toContain("notifyRecordChecked(");
    expect(bodyOf("src/lib/messages/commands.ts", "postMessage")).toContain("notifyNewMessage(");
  });

  it("drafts, draft findings, early assessments, client responses and evidence before resubmit never notify", () => {
    const f = "src/lib/workflow/commands.ts";
    for (const fn of ["createDraft", "updateDraft", "respondToFinding", "addEvidence", "withdrawEvidence", "addReviewerEvidence", "assessEvidence", "recordFinding", "updateDraftFinding", "reviewFinding", "recordExternalSubmission", "recordExternalOutcome"]) {
      expect(bodyOf(f, fn), fn).not.toMatch(/notify\w*\(/);
    }
  });

  it("AI scanning and policy code never generate notifications", () => {
    for (const p of ["src/lib/ai/service.ts", "src/lib/policy/db.ts", "src/lib/policy/monitoring/service.ts"]) {
      expect(src(p), p).not.toMatch(/lib\/notifications/);
    }
  });

  it("notifications import neither workflow nor chat code", () => {
    for (const f of ["emit.ts", "events.ts", "data.ts", "actions.ts", "labels.ts", "types.ts"]) {
      expect(src(`src/lib/notifications/${f}`), f).not.toMatch(/lib\/(workflow|messages|review)\//);
    }
  });

  it("nothing sends email or SMS", () => {
    for (const f of ["emit.ts", "events.ts", "data.ts", "actions.ts"]) {
      expect(src(`src/lib/notifications/${f}`), f).not.toMatch(/nodemailer|resend|sendgrid|twilio|smtp|fetch\(/i);
    }
  });
});

describe("reading, marking read and preferences", () => {
  it("lists only the viewer's rows, newest first, with an unread total", async () => {
    const at = new Date("2026-11-16T10:00:00Z");
    h.prisma.notification.findMany.mockResolvedValue([
      { id: "n2", kind: "NEW_MESSAGE", title: "t", body: null, href: "/dashboard/messages/c", eventCount: 3, createdAt: at, readAt: null, recipientId: CLIENT_A.id },
    ]);
    h.prisma.notification.count.mockResolvedValue(1);
    const page = await data.listNotifications(CLIENT_A, { limit: 500 });
    const q = h.prisma.notification.findMany.mock.calls[0][0];
    expect(q.where).toEqual({ recipientId: CLIENT_A.id });
    expect(q.take).toBe(51); // clamped to 50, plus one to detect the next page
    expect(page).toEqual({ items: [expect.objectContaining({ id: "n2", eventCount: 3, read: false, createdAt: at.toISOString() })], unread: 1, nextCursor: null });
  });

  it("reads as empty before the migration exists", async () => {
    h.prisma.notification.count.mockRejectedValue(Object.assign(new Error("missing"), { code: "P2021" }));
    h.prisma.notification.findMany.mockRejectedValue(Object.assign(new Error("missing"), { code: "P2021" }));
    expect(await data.unreadNotificationCount(TEAM)).toBe(0);
    expect(await data.listNotifications(TEAM)).toEqual({ items: [], unread: 0, nextCursor: null });
  });

  it("mark read and mark all read are scoped to the viewer", async () => {
    h.currentUser = CLIENT_A;
    await actions.markNotificationRead("someone-elses-id");
    expect(h.prisma.notification.updateMany.mock.calls[0][0].where).toEqual({ id: "someone-elses-id", recipientId: CLIENT_A.id, readAt: null });
    expect(await actions.markAllNotificationsRead()).toEqual({ ok: true, unread: 0 });
    expect(h.prisma.notification.updateMany.mock.calls[1][0].where).toEqual({ recipientId: CLIENT_A.id, readAt: null });
  });

  it("signed-out callers get nothing and change nothing", async () => {
    h.currentUser = null;
    expect(await actions.getNotifications()).toEqual({ items: [], unread: 0, nextCursor: null });
    expect((await actions.markAllNotificationsRead()).ok).toBe(false);
    expect((await actions.saveNotificationPreferences([])).ok).toBe(false);
    expect(h.prisma.notification.updateMany).not.toHaveBeenCalled();
  });

  it("opening a conversation clears its notification for the viewer only", async () => {
    h.prisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", clientId: CLIENT_A.id, creativeId: null });
    await chat.markConversationRead(CLIENT_A, "conv-1");
    expect(h.prisma.notification.updateMany).toHaveBeenCalledWith({ where: { recipientId: CLIENT_A.id, conversationId: "conv-1", readAt: null }, data: { readAt: expect.any(Date) } });
  });

  it("preferences list the role's kinds; required kinds show locked on", async () => {
    h.prisma.notificationPreference.findMany.mockResolvedValue([{ kind: "NEW_MESSAGE", inApp: false }, { kind: "CHANGES_REQUESTED", inApp: false }]);
    const rows = await data.preferencesFor(CLIENT_A);
    expect(rows.map((r) => r.kind)).toEqual(["REVIEW_STARTED", "CHANGES_REQUESTED", "REVIEW_COMPLETED", "REVIEW_REOPENED", "NEW_MESSAGE", "EVIDENCE_REVIEWED"]);
    expect(rows.find((r) => r.kind === "NEW_MESSAGE")).toMatchObject({ inApp: false, mutable: true });
    expect(rows.find((r) => r.kind === "CHANGES_REQUESTED")).toMatchObject({ inApp: true, mutable: false });
    expect((await data.preferencesFor(TEAM)).map((r) => r.kind)).toEqual(["SUBMISSION_RECEIVED", "RESUBMISSION_RECEIVED", "NEW_MESSAGE"]);
  });

  it("refuses to save required kinds, other roles' kinds and bad values", () => {
    expect(data.validatePreferences("CLIENT", [{ kind: "CHANGES_REQUESTED", inApp: false }]).ok).toBe(false);
    expect(data.validatePreferences("CLIENT", [{ kind: "SUBMISSION_RECEIVED", inApp: false }]).ok).toBe(false);
    expect(data.validatePreferences("TEAM", [{ kind: "NEW_MESSAGE", inApp: "no" }]).ok).toBe(false);
    expect(data.validatePreferences("TEAM", "x").ok).toBe(false);
    expect(data.validatePreferences("TEAM", [{ kind: "NEW_MESSAGE", inApp: false }])).toEqual({ ok: true, rows: [{ kind: "NEW_MESSAGE", inApp: false }] });
  });

  it("saves preferences for the viewer only and refuses demo sessions", async () => {
    h.currentUser = TEAM;
    h.prisma.$transaction.mockImplementation(async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(h.prisma)));
    expect(await actions.saveNotificationPreferences([{ kind: "NEW_MESSAGE", inApp: false }])).toEqual({ ok: true });
    expect(h.prisma.notificationPreference.upsert.mock.calls[0][0].where).toEqual({ userId_kind: { userId: TEAM.id, kind: "NEW_MESSAGE" } });
    h.currentUser = { ...TEAM, demoSession: true };
    expect((await actions.saveNotificationPreferences([{ kind: "NEW_MESSAGE", inApp: false }])).ok).toBe(false);
  });
});
