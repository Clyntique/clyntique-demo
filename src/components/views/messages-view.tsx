import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";
import { requestTime } from "@/lib/format";
import { resolveSubject } from "@/lib/messages/access";
import { getThread, listChatSubjects, listConversations } from "@/lib/messages/data";
import { basePathFor } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/cn";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeftIcon, ExternalLinkIcon, MessageIcon, PlusIcon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/states";
import { ConversationList } from "@/components/messages/conversation-list";
import { MessageThread } from "@/components/messages/message-thread";
import { NewMessageForm } from "@/components/messages/new-message-form";

/*
 * Messages: the inbox (list of conversations) and an open conversation, for
 * both roles. CLIENT: their own conversations with the reviewer. TEAM: the
 * shared inbox of client conversations (MVP: every Team user sees all of
 * them). Scope comes from src/lib/messages/access.ts.
 */

const DESCRIPTION: Record<Role, string> = {
  TEAM: "Questions from clients about their submissions. Replies here don't change a review: official decisions are made in the review itself.",
  CLIENT: "Ask your Clyntique reviewer about your submissions, evidence, findings or required changes.",
};

export async function MessagesView({ role, conversationId }: { role: Role; conversationId?: string }) {
  const user = await requireRole(role);
  const base = `${basePathFor(role)}/messages`;
  const now = requestTime();
  const [rows, thread] = await Promise.all([listConversations(user), conversationId ? getThread(user, conversationId) : Promise.resolve(null)]);
  if (conversationId && !thread) notFound();

  const team = role === "TEAM";
  const open = Boolean(thread);

  return (
    <>
      {open ? (
        <Breadcrumb trail={[{ label: "Messages", href: base }]} current={team ? thread!.clientName : thread!.subject} />
      ) : null}
      <PageHeader
        title="Messages"
        description={DESCRIPTION[role]}
        className={cn(open && "max-lg:hidden")}
        action={
          !team ? (
            <Link href={`${base}/new`} className={buttonClasses({ variant: "primary" })}>
              <PlusIcon className="size-4" /> New message
            </Link>
          ) : undefined
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Card className={cn("self-start overflow-hidden", open && "max-lg:hidden")}>
          {rows.length ? (
            <ConversationList rows={rows} role={role} activeId={conversationId} now={now} />
          ) : (
            <EmptyState
              className="border-0"
              icon={<MessageIcon />}
              title={team ? "No client messages yet." : "No conversations yet."}
              description={team ? "When a client writes to you, it will appear here." : "Start one with your reviewer. Your submissions and evidence stay in the review."}
            />
          )}
        </Card>

        <div className={cn("min-w-0", !open && "max-lg:hidden")}>
          {thread ? (
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                <div className="min-w-0">
                  <Link href={base} className="text-caption mb-1 inline-flex items-center gap-1 font-medium text-brand-700 lg:hidden">
                    <ChevronLeftIcon className="size-3.5" /> All messages
                  </Link>
                  <h2 className="text-section-title truncate text-ink">{team ? thread.clientName : thread.subject}</h2>
                  <p className="text-small text-muted">{team ? `About: ${thread.subject}` : "With your Clyntique reviewer"}</p>
                </div>
                {thread.submissionHref && (
                  <Link href={thread.submissionHref} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    View submission <ExternalLinkIcon className="size-3.5" />
                  </Link>
                )}
              </div>
              <MessageThread thread={thread} viewer={role} now={now} />
            </Card>
          ) : (
            <EmptyState
              icon={<MessageIcon />}
              title="Select a conversation"
              description={team ? "Pick a client conversation to read and reply." : "Pick a conversation, or start a new message."}
            />
          )}
        </div>
      </div>
    </>
  );
}

/**
 * CLIENT: start (or continue) a conversation, optionally about one submission.
 * If the conversation already exists it opens it, so no duplicate is created.
 * A draft or earlier-workflow creative falls back to General.
 */
export async function NewMessageView({ about }: { about?: string }) {
  const user = await requireRole("CLIENT");
  const base = `${basePathFor("CLIENT")}/messages`;
  const subject = await resolveSubject(user, about);
  const existing = await prisma.conversation.findUnique({
    where: { clientId_subjectKey: { clientId: user.id, subjectKey: subject.subjectKey } },
    select: { id: true, _count: { select: { messages: true } } },
  });
  if (existing && existing._count.messages > 0) redirect(`${base}/${existing.id}`);

  const subjects = await listChatSubjects(user);
  return (
    <>
      <Breadcrumb trail={[{ label: "Messages", href: base }]} current="New message" />
      <PageHeader title="Chat with your reviewer" description="Ask about a submission, its evidence, findings or required changes. Your reviewer replies here." />
      <Card className="max-w-2xl p-5">
        {subject.fellBackToGeneral && (
          <p role="status" className="text-small mb-4 rounded-md bg-brand-50 px-3 py-2 text-ink-soft">
            That submission isn&apos;t submitted for review yet, so this message goes to your General conversation.
          </p>
        )}
        <NewMessageForm
          subjects={subjects.map((s) => ({ id: s.id, name: s.name }))}
          initialCreativeId={subject.creativeId ?? ""}
          redirectTo={base}
        />
      </Card>
    </>
  );
}
