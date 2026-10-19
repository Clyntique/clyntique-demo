import Link from "next/link";
import type { CurrentUser } from "@/lib/auth/dal";
import { getUnreadSummary } from "@/lib/messages/data";
import { pluralize } from "@/lib/format";
import { basePathFor } from "@/lib/navigation";
import { buttonClasses } from "@/components/ui/button";
import { MessageIcon } from "@/components/ui/icons";

/*
 * Overview card for reviewer chat, shown on both dashboards. A failure to
 * read messages (for example before the chat tables exist) hides the card
 * rather than breaking the dashboard.
 */
export async function MessagesCard({ user }: { user: CurrentUser }) {
  let unread;
  try {
    unread = await getUnreadSummary(user);
  } catch {
    return null;
  }
  const team = user.role === "TEAM";
  const href = `${basePathFor(user.role)}/messages`;
  const title = team ? "Client messages" : "Chat with your reviewer";
  const text = unread.messages
    ? team
      ? `${pluralize(unread.messages, "unread message")} from ${pluralize(unread.conversations, "client")}.`
      : `${unread.messages} unread ${unread.messages === 1 ? "reply" : "replies"} from your reviewer.`
    : team
      ? "No unread messages from clients."
      : "Ask your reviewer about a submission, evidence, findings or required changes.";

  return (
    <section aria-label={title} className="overflow-hidden rounded-xl border border-line bg-surface shadow-xs">
      <div className="flex items-center gap-4 p-5">
        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <MessageIcon className="size-5" />
          {unread.messages > 0 && <span className="absolute -top-1 -right-1 size-3 rounded-full bg-gold-500 ring-2 ring-surface" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <p className="text-small text-muted">{text}</p>
        </div>
        <Link href={href} className={buttonClasses({ variant: unread.messages ? "primary" : "secondary", size: "sm" })}>
          {unread.messages ? "Open messages" : team ? "Open inbox" : "Chat with reviewer"}
        </Link>
      </div>
    </section>
  );
}
