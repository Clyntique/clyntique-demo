import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_A, CLIENT_B, TEAM, createPrismaMock, type PrismaMock } from "./helpers";

// Reviewer chat with Prisma mocked: scope, find-or-create, draft privacy,
// unread/read, and the rule that chat never touches the review workflow.
// (prisma/chat-check.ts repeats the key rules against a real isolated database.)

type Models = Record<string, Record<string, ReturnType<typeof vi.fn>>>;
type ChatPrisma = PrismaMock & Models;

const h = vi.hoisted(() => ({ prisma: null as unknown as ChatPrisma }));
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));

const access = await import("@/lib/messages/access");
const cmd = await import("@/lib/messages/commands");
const data = await import("@/lib/messages/data");

function conversationModel() {
  return {
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    upsert: vi.fn().mockResolvedValue({ id: "conv-1" }),
    update: vi.fn().mockResolvedValue({ id: "conv-1" }),
  };
}
function messageModel() {
  return {
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ id: "msg-1" }),
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    groupBy: vi.fn().mockResolvedValue([]),
  };
}

beforeEach(() => {
  const prisma = createPrismaMock() as ChatPrisma;
  prisma.conversation = conversationModel();
  prisma.message = messageModel();
  // Array transactions resolve to each operation's result.
  prisma.$transaction.mockImplementation(async (arg: unknown) => (Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma)));
  h.prisma = prisma;
});

const submitted = { id: "s1", workflow: "SUBMISSION_REVIEW", rounds: [{ id: "r1" }] };

describe("cleanBody", () => {
  it("rejects empty and whitespace-only messages", () => {
    expect(cmd.cleanBody("").ok).toBe(false);
    expect(cmd.cleanBody("   \n ").ok).toBe(false);
    expect(cmd.cleanBody(undefined).ok).toBe(false);
  });
  it("rejects messages over the limit and trims/normalizes valid ones", () => {
    expect(cmd.cleanBody("x".repeat(4001))).toMatchObject({ ok: false });
    expect(cmd.cleanBody("x".repeat(4000)).ok).toBe(true);
    expect(cmd.cleanBody("  hello\r\nthere  ")).toEqual({ ok: true, body: "hello\nthere" });
  });
});

describe("conversationScope", () => {
  it("limits a client to their own conversations", () => {
    expect(access.conversationScope(CLIENT_A)).toEqual({ clientId: CLIENT_A.id });
    expect(access.conversationScope(CLIENT_B)).toEqual({ clientId: CLIENT_B.id });
  });
  it("gives the Team the shared inbox, but only submitted SUBMISSION_REVIEW submissions", () => {
    const scope = JSON.stringify(access.conversationScope(TEAM));
    expect(scope).toContain('"assignedReviewerId":null');
    expect(scope).toContain(`"assignedReviewerId":"${TEAM.id}"`);
    expect(scope).toContain('"workflow":"SUBMISSION_REVIEW"');
    expect(scope).toContain('"rounds":{"some":{}}');
    expect(scope).not.toContain("clientId");
  });
  it("counts unread as messages from the other side that were never read", () => {
    expect(access.unreadMessageWhere(CLIENT_A)).toEqual({ readAt: null, senderRole: "TEAM" });
    expect(access.unreadMessageWhere(TEAM)).toEqual({ readAt: null, senderRole: "CLIENT" });
  });
});

describe("resolveSubject (draft and legacy privacy)", () => {
  it("uses General when no submission is named", async () => {
    expect(await access.resolveSubject(CLIENT_A, undefined)).toEqual({ creativeId: null, subjectKey: "general", fellBackToGeneral: false });
    expect(await access.resolveSubject(CLIENT_A, "")).toMatchObject({ subjectKey: "general" });
  });
  it("opens a submission-specific conversation for submitted work the client owns", async () => {
    h.prisma.creative.findFirst.mockResolvedValue(submitted);
    expect(await access.resolveSubject(CLIENT_A, "s1")).toEqual({ creativeId: "s1", subjectKey: "s1", fellBackToGeneral: false });
    // the lookup is scoped to the client's own creatives
    expect(JSON.stringify(h.prisma.creative.findFirst.mock.calls[0][0].where)).toContain(CLIENT_A.id);
  });
  it("falls back to General for a never-submitted draft", async () => {
    h.prisma.creative.findFirst.mockResolvedValue({ ...submitted, rounds: [] });
    expect(await access.resolveSubject(CLIENT_A, "s1")).toEqual({ creativeId: null, subjectKey: "general", fellBackToGeneral: true });
  });
  it("falls back to General for earlier-workflow creatives and for submissions that aren't theirs", async () => {
    h.prisma.creative.findFirst.mockResolvedValue({ ...submitted, workflow: "LEGACY_CLIENT_APPROVAL" });
    expect(await access.resolveSubject(CLIENT_A, "s1")).toMatchObject({ subjectKey: "general", fellBackToGeneral: true });
    h.prisma.creative.findFirst.mockResolvedValue(null);
    expect(await access.resolveSubject(CLIENT_B, "someone-elses")).toMatchObject({ subjectKey: "general", fellBackToGeneral: true });
  });
  it("never resolves a submission for the Team", async () => {
    expect(await access.resolveSubject(TEAM, "s1")).toMatchObject({ creativeId: null });
    expect(h.prisma.creative.findFirst).not.toHaveBeenCalled();
  });
});

describe("postMessage", () => {
  it("lets a client open (or continue) the one conversation for a subject, never a duplicate", async () => {
    h.prisma.creative.findFirst.mockResolvedValue(submitted);
    const result = await cmd.postMessage(CLIENT_A, { creativeId: "s1", body: "Is the disclaimer wording OK?" });
    expect(result).toEqual({ ok: true, conversationId: "conv-1", messageId: "msg-1" });
    const upsert = h.prisma.conversation.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({ clientId_subjectKey: { clientId: CLIENT_A.id, subjectKey: "s1" } });
    expect(upsert.update).toEqual({});
    expect(h.prisma.message.create.mock.calls[0][0].data).toMatchObject({ conversationId: "conv-1", senderId: CLIENT_A.id, senderRole: "CLIENT", body: "Is the disclaimer wording OK?" });
    expect(h.prisma.conversation.update.mock.calls[0][0].where).toEqual({ id: "conv-1" });
  });
  it("puts a message about a draft in the General conversation", async () => {
    h.prisma.creative.findFirst.mockResolvedValue({ ...submitted, rounds: [] });
    await cmd.postMessage(CLIENT_A, { creativeId: "s1", body: "hi" });
    expect(h.prisma.conversation.upsert.mock.calls[0][0].create).toEqual({ clientId: CLIENT_A.id, creativeId: null, subjectKey: "general" });
  });
  it("lets a reviewer reply only in a conversation inside their scope", async () => {
    h.prisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", clientId: CLIENT_A.id, creativeId: "s1" });
    const result = await cmd.postMessage(TEAM, { conversationId: "conv-1", body: "Yes, that wording works." });
    expect(result.ok).toBe(true);
    expect(h.prisma.message.create.mock.calls[0][0].data).toMatchObject({ senderId: TEAM.id, senderRole: "TEAM" });
    expect(JSON.stringify(h.prisma.conversation.findFirst.mock.calls[0][0].where)).toContain('"workflow":"SUBMISSION_REVIEW"');
  });
  it("refuses another client's conversation (answered as not found) and writes nothing", async () => {
    const result = await cmd.postMessage(CLIENT_B, { conversationId: "conv-of-a", body: "hello" });
    expect(result).toEqual({ ok: false, error: "This conversation could not be found." });
    expect(JSON.stringify(h.prisma.conversation.findFirst.mock.calls[0][0].where)).toContain(CLIENT_B.id);
    expect(h.prisma.message.create).not.toHaveBeenCalled();
    expect(h.prisma.conversation.upsert).not.toHaveBeenCalled();
  });
  it("does not let the Team start a conversation", async () => {
    const result = await cmd.postMessage(TEAM, { body: "hello" });
    expect(result.ok).toBe(false);
    expect(h.prisma.conversation.upsert).not.toHaveBeenCalled();
    expect(h.prisma.message.create).not.toHaveBeenCalled();
  });
  it("validates the body before touching the database", async () => {
    expect((await cmd.postMessage(CLIENT_A, { body: "  " })).ok).toBe(false);
    expect(h.prisma.conversation.findFirst).not.toHaveBeenCalled();
    expect(h.prisma.conversation.upsert).not.toHaveBeenCalled();
  });
  it("limits how fast one user can send", async () => {
    h.prisma.message.count.mockResolvedValue(15);
    const result = await cmd.postMessage(CLIENT_A, { body: "again" });
    expect(result.ok).toBe(false);
    expect(h.prisma.message.create).not.toHaveBeenCalled();
  });
});

describe("markConversationRead", () => {
  it("marks only the other side's unread messages, inside the user's scope", async () => {
    h.prisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", clientId: CLIENT_A.id, creativeId: null });
    expect(await cmd.markConversationRead(CLIENT_A, "conv-1")).toEqual({ ok: true, marked: 2 });
    const call = h.prisma.message.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ conversationId: "conv-1", readAt: null, senderRole: "TEAM" });
    expect(call.data).toMatchObject({ readById: CLIENT_A.id });
    await cmd.markConversationRead(TEAM, "conv-1");
    expect(h.prisma.message.updateMany.mock.calls[1][0].where.senderRole).toBe("CLIENT");
  });
  it("does nothing for a conversation outside the user's scope", async () => {
    expect(await cmd.markConversationRead(CLIENT_B, "conv-of-a")).toEqual({ ok: false, marked: 0 });
    expect(h.prisma.message.updateMany).not.toHaveBeenCalled();
  });
});

describe("unread summary", () => {
  it("counts conversations and messages with unread messages in the user's scope", async () => {
    h.prisma.message.groupBy.mockResolvedValue([
      { conversationId: "a", _count: { _all: 2 } },
      { conversationId: "b", _count: { _all: 1 } },
    ]);
    expect(await data.getUnreadSummary(TEAM)).toEqual({ conversations: 2, messages: 3 });
    const where = JSON.stringify(h.prisma.message.groupBy.mock.calls[0][0].where);
    expect(where).toContain('"senderRole":"CLIENT"');
    expect(where).toContain('"readAt":null');
  });
  it("scopes a client's summary to their own conversations", async () => {
    await data.getUnreadSummary(CLIENT_A);
    const where = JSON.stringify(h.prisma.message.groupBy.mock.calls[0][0].where);
    expect(where).toContain(CLIENT_A.id);
    expect(where).toContain('"senderRole":"TEAM"');
  });
});

describe("thread labels", () => {
  it("shows the Team the submitted title, never the client's live name", async () => {
    h.prisma.conversation.findMany.mockResolvedValue([
      {
        id: "conv-1",
        creativeId: "s1",
        lastMessageAt: new Date(),
        client: { name: "Client A" },
        creative: { name: "Private working title", rounds: [{ submittedName: "Spring promo" }] },
        messages: [],
        _count: { messages: 0 },
      },
    ]);
    const [row] = await data.listConversations(TEAM);
    expect(row.subject).toBe("Spring promo");
    const [clientRow] = await data.listConversations(CLIENT_A);
    expect(clientRow.subject).toBe("Private working title");
  });
});

describe("chat stays out of the review", () => {
  it("imports nothing from the review workflow and never writes review data or Activity", () => {
    for (const file of ["commands.ts", "access.ts", "data.ts", "actions.ts"]) {
      const source = readFileSync(join(process.cwd(), "src", "lib", "messages", file), "utf8");
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code, file).not.toMatch(/lib\/workflow|lib\/review\/|prisma\.(activity|finding|reviewDecision|reviewCycle|submissionRound|evidence)\b|prisma\.creative\.(update|create|delete)/);
    }
  });
  it("sending and reading leave every review table untouched", async () => {
    h.prisma.conversation.findFirst.mockResolvedValue({ id: "conv-1", clientId: CLIENT_A.id, creativeId: "s1" });
    await cmd.postMessage(CLIENT_A, { conversationId: "conv-1", body: "Can you explain finding #2?" });
    await cmd.markConversationRead(TEAM, "conv-1");
    for (const model of ["creative", "reviewCycle", "submissionRound", "reviewDecision", "finding", "findingEvent", "findingResponse", "evidence", "activity"]) {
      const m = h.prisma[model] as Record<string, ReturnType<typeof vi.fn>>;
      for (const method of ["create", "createMany", "update", "updateMany", "upsert", "deleteMany"]) {
        expect(m[method]?.mock.calls.length ?? 0, `${model}.${method}`).toBe(0);
      }
    }
  });
});
