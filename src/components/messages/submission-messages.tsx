import type { Role } from "@/generated/prisma/enums";
import type { CurrentUser } from "@/lib/auth/dal";
import { getSubmissionThread, type Thread } from "@/lib/messages/data";
import { requestTime } from "@/lib/format";
import { MessageThread } from "./message-thread";

/**
 * Loads the conversation about one submission for the "Messages" tab. Resolves
 * to null when chat is unavailable (for example before the chat tables exist),
 * so the submission page simply omits the tab instead of failing.
 */
export async function loadSubmissionChat(user: CurrentUser, creativeId: string): Promise<{ thread: Thread | null } | null> {
  try {
    return { thread: await getSubmissionThread(user, creativeId) };
  } catch {
    return null;
  }
}

/*
 * Content of the "Messages" tab on a submission: that submission's conversation
 * with the reviewer. Only offered for submitted SUBMISSION_REVIEW work; drafts
 * and earlier-workflow creatives use the client's General conversation instead.
 */
export function SubmissionMessages({ role, creativeId, thread }: { role: Role; creativeId: string; thread: Thread | null }) {
  const team = role === "TEAM";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-small text-muted">
        {team ? "Messages from the client about this submission." : "Ask the Clyntique reviewer about this submission, its evidence, findings or required changes."}
      </p>
      <MessageThread thread={thread} viewer={role} creativeId={team ? undefined : creativeId} compact now={requestTime()} />
    </div>
  );
}
