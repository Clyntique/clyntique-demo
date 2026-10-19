// Verifies the reviewer-chat rules against a REAL, ISOLATED database (the
// fixtures from prisma/demo-fixtures.ts must be applied first). It writes a few
// [CHATCHECK] messages and removes them again. Run with the react-server
// condition so the app's own code can be imported:
//   SEED_CONFIRM_DATABASE=<db name> npm run db:chat-check
//
// Safety: refuses the shared Production/Preview database (cyntique_demo) and
// NODE_ENV=production, and needs SEED_CONFIRM_DATABASE = the database name.
import "dotenv/config";
import type { CurrentUser } from "../src/lib/auth/dal";
import { conversationScope } from "../src/lib/messages/access";
import { markConversationRead, postMessage } from "../src/lib/messages/commands";
import { getUnreadSummary, getThread, listConversations } from "../src/lib/messages/data";
import { prisma } from "../src/lib/prisma";
import { databaseNameOf } from "./seed-plan";

const failures: string[] = [];
let checks = 0;
function check(label: string, ok: boolean, detail = "") {
  checks++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : ` (${detail})`}`);
  if (!ok) failures.push(label);
}

async function main() {
  const dbName = databaseNameOf(process.env.DATABASE_URL);
  if (!dbName) throw new Error("DATABASE_URL is missing or has no database name.");
  if (dbName === "cyntique_demo") throw new Error(`refusing to run against "${dbName}" (shared Production/Preview database).`);
  if (process.env.NODE_ENV === "production") throw new Error("refusing to run with NODE_ENV=production.");
  if (process.env.SEED_CONFIRM_DATABASE !== dbName) throw new Error("set SEED_CONFIRM_DATABASE to the target database name.");
  console.log(`chat-check: database "${dbName}"`);

  const users = await prisma.user.findMany({
    where: { email: { in: ["team@clyntique.demo", "client@clyntique.demo", "client2@clyntique.demo"] } },
    select: { id: true, name: true, email: true, role: true },
  });
  const by = (email: string) => users.find((u) => u.email === email) as CurrentUser;
  const team = by("team@clyntique.demo");
  const a = by("client@clyntique.demo");
  const b = by("client2@clyntique.demo");
  if (!team || !a || !b) throw new Error("demo accounts missing (run prisma/seed.ts first).");

  const submittedA = await prisma.creative.findFirst({ where: { project: { clientId: a.id }, workflow: "SUBMISSION_REVIEW", rounds: { some: {} } }, select: { id: true, status: true } });
  const draftA = await prisma.creative.findFirst({ where: { project: { clientId: a.id }, workflow: "SUBMISSION_REVIEW", status: "DRAFT", rounds: { none: {} } }, select: { id: true, name: true } });
  if (!submittedA || !draftA) throw new Error("fixtures missing: need a submitted and a draft submission for client@ (run db:demo-fixtures).");

  const snapshot = async () => ({
    creatives: await prisma.creative.findMany({ select: { id: true, status: true, updatedAt: true }, orderBy: { id: "asc" } }),
    findings: await prisma.finding.count(),
    decisions: await prisma.reviewDecision.count(),
    rounds: await prisma.submissionRound.count(),
    evidence: await prisma.evidence.count(),
    activities: await prisma.activity.count(),
  });
  const before = await snapshot();
  const created: string[] = [];
  // Read state of messages that already exist (e.g. the sample conversations), restored at the end.
  const existing = await prisma.message.findMany({ select: { id: true, readAt: true, readById: true } });
  const existingConversations = new Set((await prisma.conversation.findMany({ select: { id: true } })).map((c) => c.id));

  // 1. A client's message about a submitted submission opens ONE conversation.
  const sends = await Promise.all([1, 2, 3].map((i) => postMessage(a, { creativeId: submittedA.id, body: `[CHATCHECK] question ${i}` })));
  check("three concurrent first messages all succeed", sends.every((r) => r.ok));
  const conv = await prisma.conversation.findMany({ where: { clientId: a.id, subjectKey: submittedA.id } });
  check("…and create exactly one conversation (no duplicates)", conv.length === 1, `${conv.length}`);
  const convId = conv[0]?.id ?? "";
  created.push(...sends.filter((r) => r.ok).map((r) => (r as { messageId: string }).messageId));

  // 2. Draft privacy: a message about a never-submitted draft goes to General.
  const draftSend = await postMessage(a, { creativeId: draftA.id, body: "[CHATCHECK] about my draft" });
  const draftConv = draftSend.ok ? await prisma.conversation.findUnique({ where: { id: draftSend.conversationId } }) : null;
  check("a message about a draft goes to the General conversation", draftConv?.subjectKey === "general" && draftConv.creativeId === null);
  if (draftSend.ok) created.push(draftSend.messageId);
  check("no conversation is ever tied to the draft", (await prisma.conversation.count({ where: { creativeId: draftA.id } })) === 0);

  // 3. Isolation: client B cannot see or write into client A's conversation.
  const bList = await listConversations(b);
  check("client B's list never contains client A's conversations", bList.every((c) => c.id !== convId));
  check("client B cannot open client A's thread", (await getThread(b, convId)) === null);
  const bPost = await postMessage(b, { conversationId: convId, body: "[CHATCHECK] intruder" });
  check("client B cannot post into client A's conversation", !bPost.ok);
  check("client B cannot mark client A's messages read", (await markConversationRead(b, convId)).ok === false);

  // 4. Team inbox sees client conversations, with the submitted title.
  const teamList = await listConversations(team);
  const row = teamList.find((c) => c.id === convId);
  check("the Team inbox contains the conversation", Boolean(row));
  const teamGeneral = teamList.find((c) => c.id === (draftSend.ok ? draftSend.conversationId : ""));
  check("the Team sees the draft message only under General (no draft title)", teamGeneral?.subject === "General" && teamGeneral.submissionHref === null);
  check("no Team-visible subject reveals the draft's name", !teamList.some((c) => c.subject === draftA.name));
  const teamUnread = await getUnreadSummary(team);
  check("the Team has unread messages from clients", teamUnread.messages >= 4, JSON.stringify(teamUnread));

  // 5. Reading marks messages read; replying notifies the client.
  const opened = await markConversationRead(team, convId);
  check("opening the conversation marks the client's messages read", opened.ok && opened.marked >= 3, JSON.stringify(opened));
  const reply = await postMessage(team, { conversationId: convId, body: "[CHATCHECK] reviewer reply" });
  check("the reviewer can reply", reply.ok);
  if (reply.ok) created.push(reply.messageId);
  const aUnread = await getUnreadSummary(a);
  check("the client now has an unread reply", aUnread.messages >= 1, JSON.stringify(aUnread));
  const aThread = await getThread(a, convId);
  check("the thread keeps full history with sender and time", (aThread?.messages.filter((m) => m.body.startsWith("[CHATCHECK]")).length ?? 0) === 4 && aThread!.messages.every((m) => m.senderName && m.createdAt));
  await markConversationRead(a, convId);
  const reread = await getThread(team, convId);
  check("the reviewer's message shows as seen once the client opens it", reread?.messages.at(-1)?.readAt != null);
  check("the client's unread count for that conversation is cleared", (await getThread(a, convId))?.unread === 0);

  // 6. The Team scope excludes anything not about submitted SUBMISSION_REVIEW work.
  const strays = await prisma.conversation.count({ where: { AND: [conversationScope(team), { creativeId: { not: null } }, { NOT: { creative: { rounds: { some: {} } } } }] } });
  check("the Team scope never includes a conversation about unsubmitted work", strays === 0);

  // 7. Chat changed nothing in the review.
  const after = await snapshot();
  check("creative statuses and timestamps are unchanged", JSON.stringify(before.creatives) === JSON.stringify(after.creatives));
  check("findings, decisions, rounds, evidence and Activity are unchanged", before.findings === after.findings && before.decisions === after.decisions && before.rounds === after.rounds && before.evidence === after.evidence && before.activities === after.activities);

  // Cleanup: remove only what this check created.
  await prisma.message.deleteMany({ where: { id: { in: created } } });
  await prisma.conversation.deleteMany({ where: { id: { notIn: [...existingConversations] }, messages: { none: {} } } });
  for (const m of existing) await prisma.message.update({ where: { id: m.id }, data: { readAt: m.readAt, readById: m.readById } });
  console.log(`chat-check: ${checks - failures.length}/${checks} checks passed`);
  if (failures.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "chat-check failed.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().finally(() => process.exit(process.exitCode ?? 0)));
