import Link from "next/link";
import type { Role } from "@/generated/prisma/enums";
import type { ConversationRow } from "@/lib/messages/data";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { basePathFor } from "@/lib/navigation";
import { Avatar } from "@/components/ui/avatar";

// The Messages inbox list: unread first, then newest. Each row shows who, what
// it is about, the last message and how many are unread.
export function ConversationList({ rows, role, activeId, now }: { rows: ConversationRow[]; role: Role; activeId?: string; now: number }) {
  const base = `${basePathFor(role)}/messages`;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {rows.map((c) => {
        const preview = c.lastMessage ? `${c.lastMessage.senderRole === role ? "You: " : ""}${c.lastMessage.body}` : "";
        return (
          <li key={c.id}>
            <Link
              href={`${base}/${c.id}`}
              aria-current={c.id === activeId ? "page" : undefined}
              className={cn("flex items-start gap-3 px-4 py-3 transition-colors hover:bg-subtle", c.id === activeId && "bg-brand-50")}
            >
              <Avatar name={role === "TEAM" ? c.clientName : "Clyntique Reviewer"} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("text-small truncate", c.unread ? "font-semibold text-ink" : "font-medium text-ink-soft")}>
                    {role === "TEAM" ? c.clientName : c.subject}
                  </span>
                  <span className="text-caption shrink-0 text-muted">{formatRelative(c.lastMessageAt, now)}</span>
                </span>
                <span className="text-caption block truncate text-muted">{role === "TEAM" ? `About: ${c.subject}` : "With your Clyntique reviewer"}</span>
                {preview && <span className={cn("text-small mt-0.5 block truncate", c.unread ? "text-ink" : "text-muted")}>{preview}</span>}
              </span>
              {c.unread > 0 && (
                <span className="text-record mt-0.5 rounded-full bg-gold-500 px-1.5 text-brand-900">
                  {c.unread}
                  <span className="sr-only"> unread</span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
