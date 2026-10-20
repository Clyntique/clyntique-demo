import type { Thread, ThreadMessage } from "@/lib/messages/data";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import type { Role } from "@/generated/prisma/enums";
import { Avatar } from "@/components/ui/avatar";
import { LocalDateTime } from "./local-date-time";
import { MarkRead } from "./mark-read";
import { ReplyForm } from "./reply-form";
import { ThreadScroller } from "./thread-scroller";

/*
 * The conversation: history with sender, time and unread state, then the
 * composer. Chat is informal; the note above the composer says where official
 * answers (findings, evidence, decisions) go.
 */

export const CHAT_BOUNDARY_NOTE =
  "Messages don't change your review status. To answer a finding or add evidence, use the Findings and Evidence tabs. Official review decisions are made only in the review.";

export function MessageThread({
  thread,
  viewer,
  creativeId,
  compact = false,
  redirectTo,
  now,
}: {
  thread: Thread | null;
  viewer: Role;
  /** Set when there is no conversation yet and the first message should open one for this submission. */
  creativeId?: string;
  compact?: boolean;
  redirectTo?: string;
  now: number;
}) {
  const messages = thread?.messages ?? [];
  const firstUnread = messages.find((m) => !m.mine && !m.readAt && m.senderRole !== viewer);
  const lastSeenMine = [...messages].reverse().find((m) => m.mine && m.readAt);
  const team = viewer === "TEAM";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {thread && <MarkRead conversationId={thread.id} unread={thread.unread} />}

      {messages.length ? (
        <ThreadScroller count={messages.length} className={cn("flex flex-col gap-4 pr-1", compact ? "max-h-80" : "max-h-[32rem]")}>
          {messages.map((m) => (
            <div key={m.id} className="flex flex-col gap-4">
              {firstUnread?.id === m.id && (
                <div className="flex items-center gap-3 text-caption font-semibold text-attention-ink" role="separator" aria-label="New messages">
                  <span className="h-px flex-1 bg-attention-line" />
                  New
                  <span className="h-px flex-1 bg-attention-line" />
                </div>
              )}
              <Bubble message={m} viewer={viewer} clientName={thread?.clientName ?? ""} now={now} seen={lastSeenMine?.id === m.id} />
            </div>
          ))}
        </ThreadScroller>
      ) : (
        <p className="text-small rounded-md border border-dashed border-line-strong px-4 py-5 text-center text-muted">
          {team ? "No messages from the client yet." : "No messages yet. Ask your reviewer a question below."}
        </p>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <p className="text-caption rounded-md bg-subtle px-3 py-2 text-ink-soft">{CHAT_BOUNDARY_NOTE}</p>
        {thread || !team ? (
          <ReplyForm
            conversationId={thread?.id}
            creativeId={thread ? undefined : creativeId}
            redirectTo={thread ? undefined : redirectTo}
            label={team ? "Reply to client" : "Message to your reviewer"}
            placeholder={team ? "Reply to the client…" : "Ask your reviewer a question…"}
          />
        ) : null}
      </div>
    </div>
  );
}

function Bubble({ message, viewer, clientName, now, seen }: { message: ThreadMessage; viewer: Role; clientName: string; now: number; seen: boolean }) {
  const fromTeam = message.senderRole === "TEAM";
  const who = message.mine ? "You" : fromTeam ? `${message.senderName} · Reviewer` : viewer === "TEAM" ? clientName : message.senderName;
  const unread = !message.mine && !message.readAt;
  return (
    <div className={cn("flex gap-2.5", message.mine && "flex-row-reverse")}>
      <Avatar name={message.senderName} size="sm" className={cn("mt-5", fromTeam ? "bg-brand-600 text-white" : "")} />
      <div className={cn("flex min-w-0 max-w-[85%] flex-col gap-1", message.mine && "items-end")}>
        <p className="text-caption flex flex-wrap items-center gap-x-2 text-muted">
          <span className="font-medium text-ink-soft">{who}</span>
          <LocalDateTime iso={message.createdAt.toISOString()} fallback={formatRelative(message.createdAt, now)} />
          {unread && <span className="size-1.5 rounded-full bg-gold-500" role="img" aria-label="Unread" />}
        </p>
        <div
          className={cn(
            "text-small whitespace-pre-wrap break-words rounded-xl px-3.5 py-2.5",
            message.mine ? "rounded-tr-sm bg-brand-600 text-white" : "rounded-tl-sm bg-subtle text-ink",
          )}
        >
          {message.body}
        </div>
        {seen && message.readAt && <p className="text-micro text-muted">Seen · {formatRelative(message.readAt, now).toLowerCase()}</p>}
      </div>
    </div>
  );
}
