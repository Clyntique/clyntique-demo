import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { notifySafely, type NotificationDraft, type NotifyOutcome } from "./emit";

/*
 * Event -> recipient mapping (PR D plan, "Event-to-recipient mapping").
 * Every function here is called from exactly one workflow or message command,
 * inside its transaction, after the step's own writes. Rules:
 * - Team = every TEAM user (shared queue and inbox), minus the actor.
 * - Client = the creative's project client, or the record's owner; always read
 *   inside the transaction, never taken from input.
 * - Team wording uses the submitted round snapshot, never live client edits.
 * - Client wording says "Clyntique Reviewer" and "internal review", never a
 *   reviewer's name and never "approved".
 * - No message text, claim text or file names are copied.
 */

type Tx = Prisma.TransactionClient;
type Actor = { id: string };

const quote = (name: string) => `“${name}”`;

async function teamIds(tx: Tx, assignedReviewerId?: string | null): Promise<string[]> {
  if (assignedReviewerId) return [assignedReviewerId];
  const rows = await tx.user.findMany({ where: { role: "TEAM" }, select: { id: true } });
  return rows.map((r) => r.id);
}

async function clientOf(tx: Tx, creativeId: string) {
  const c = await tx.creative.findUnique({
    where: { id: creativeId },
    select: { name: true, workflow: true, project: { select: { clientId: true } } },
  });
  return c && c.workflow === "SUBMISSION_REVIEW" ? { clientId: c.project.clientId, name: c.name } : null;
}

/** CLIENT submitted (round 1) or resubmitted (round n > 1): tell the Team. */
export function notifySubmissionReceived(
  tx: Tx,
  actor: Actor,
  input: { creativeId: string; roundId: string; roundNumber: number; cycleNumber: number; submittedName: string; resubmission: boolean },
): Promise<NotifyOutcome> {
  return notifySafely(tx, input.resubmission ? "resubmit" : "submit", actor.id, async () => {
    const ids = await teamIds(tx);
    const title = input.resubmission
      ? `Resubmitted: ${quote(input.submittedName)} (round ${input.roundNumber})`
      : `New submission: ${quote(input.submittedName)}`;
    return {
      drafts: ids.map<NotificationDraft>((recipientId) => ({
        recipientId,
        kind: input.resubmission ? "RESUBMISSION_RECEIVED" : "SUBMISSION_RECEIVED",
        dedupeKey: `round:${input.roundId}`,
        title,
        href: `/admin/creatives/${input.creativeId}`,
        creativeId: input.creativeId,
      })),
    };
  });
}

/** TEAM started reviewing a submitted round: tell the client. */
export function notifyReviewStarted(tx: Tx, actor: Actor, input: { creativeId: string }): Promise<NotifyOutcome> {
  return notifySafely(tx, "startReview", actor.id, async () => {
    const c = await clientOf(tx, input.creativeId);
    if (!c) return { drafts: [] };
    const round = await tx.submissionRound.findFirst({ where: { creativeId: input.creativeId }, orderBy: { submittedAt: "desc" }, select: { id: true } });
    if (!round) return { drafts: [] };
    return {
      drafts: [
        {
          recipientId: c.clientId,
          kind: "REVIEW_STARTED",
          dedupeKey: `review-started:${round.id}`,
          title: `Clyntique Reviewer started reviewing ${quote(c.name)}`,
          href: `/dashboard/creatives/${input.creativeId}`,
          creativeId: input.creativeId,
        },
      ],
    };
  });
}

/**
 * TEAM published a decision (changes requested, or the final internal outcome).
 * The client gets the decision and, separately, a note about evidence
 * assessments that became visible with it.
 */
export function notifyDecisionPublished(
  tx: Tx,
  actor: Actor,
  input: { creativeId: string; cycleId: string; decisionId: string; final: boolean },
): Promise<NotifyOutcome> {
  return notifySafely(tx, input.final ? "completeReview" : "requestChanges", actor.id, async () => {
    const c = await clientOf(tx, input.creativeId);
    if (!c) return { drafts: [] };
    const previous = await tx.reviewDecision.findFirst({
      where: { cycleId: input.cycleId, id: { not: input.decisionId } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const [openFindings, assessed] = await Promise.all([
      input.final ? Promise.resolve(0) : tx.finding.count({ where: { cycleId: input.cycleId, status: "OPEN" } }),
      tx.evidenceAssessment.count({ where: { cycleId: input.cycleId, ...(previous ? { createdAt: { gt: previous.createdAt } } : {}) } }),
    ]);
    const drafts: NotificationDraft[] = [
      input.final
        ? {
            recipientId: c.clientId,
            kind: "REVIEW_COMPLETED",
            dedupeKey: `decision:${input.decisionId}`,
            title: `Internal review completed for ${quote(c.name)}`,
            body: "Clyntique's internal review outcome is ready. This is not a platform or regulatory decision.",
            href: `/dashboard/creatives/${input.creativeId}/record`,
            creativeId: input.creativeId,
          }
        : {
            recipientId: c.clientId,
            kind: "CHANGES_REQUESTED",
            dedupeKey: `decision:${input.decisionId}`,
            title: `Changes requested on ${quote(c.name)}`,
            body: openFindings ? `Clyntique Reviewer shared ${openFindings} finding${openFindings === 1 ? "" : "s"} to address.` : null,
            href: `/dashboard/creatives/${input.creativeId}`,
            creativeId: input.creativeId,
          },
    ];
    if (assessed) {
      drafts.push({
        recipientId: c.clientId,
        kind: "EVIDENCE_REVIEWED",
        dedupeKey: `decision:${input.decisionId}:evidence`,
        title: `${assessed} evidence item${assessed === 1 ? "" : "s"} reviewed on ${quote(c.name)}`,
        href: `/dashboard/creatives/${input.creativeId}`,
        creativeId: input.creativeId,
      });
    }
    return { drafts };
  });
}

/** TEAM opened a new review cycle on a completed submission: tell the client. */
export function notifyReviewReopened(tx: Tx, actor: Actor, input: { creativeId: string; cycleId: string; cycleNumber: number }): Promise<NotifyOutcome> {
  return notifySafely(tx, "openReviewCycle", actor.id, async () => {
    const c = await clientOf(tx, input.creativeId);
    if (!c) return { drafts: [] };
    return {
      drafts: [
        {
          recipientId: c.clientId,
          kind: "REVIEW_REOPENED",
          dedupeKey: `cycle:${input.cycleId}`,
          title: `Clyntique Reviewer opened a new review of ${quote(c.name)}`,
          href: `/dashboard/creatives/${input.creativeId}`,
          creativeId: input.creativeId,
        },
      ],
    };
  });
}

/** TEAM checked a client's Evidence Dictionary record: tell its owner. */
export function notifyRecordChecked(tx: Tx, actor: Actor, input: { recordId: string; checkId: string }): Promise<NotifyOutcome> {
  return notifySafely(tx, "checkEvidenceRecord", actor.id, async () => {
    const r = await tx.evidenceRecord.findUnique({ where: { id: input.recordId }, select: { ownerClientId: true, title: true } });
    if (!r?.ownerClientId) return { drafts: [] }; // Clyntique's own records have no client to tell
    return {
      drafts: [
        {
          recipientId: r.ownerClientId,
          kind: "EVIDENCE_REVIEWED",
          dedupeKey: `record-check:${input.checkId}`,
          title: `Clyntique Reviewer checked your evidence record ${quote(r.title)}`,
          href: `/dashboard/evidence/${input.recordId}`,
          evidenceRecordId: input.recordId,
        },
      ],
    };
  });
}

/** A message was posted: tell the other side. One re-arming row per conversation and recipient. */
export function notifyNewMessage(tx: Tx, actor: Actor & { role: "TEAM" | "CLIENT" }, input: { conversationId: string }): Promise<NotifyOutcome> {
  return notifySafely(tx, "postMessage", actor.id, async () => {
    const conv = await tx.conversation.findUnique({
      where: { id: input.conversationId },
      select: {
        clientId: true,
        creativeId: true,
        assignedReviewerId: true,
        client: { select: { name: true } },
        creative: { select: { name: true, rounds: { orderBy: { submittedAt: "desc" }, take: 1, select: { submittedName: true } } } },
      },
    });
    if (!conv) return { drafts: [] };
    const dedupeKey = `conversation:${input.conversationId}`;
    if (actor.role === "CLIENT") {
      // Team only learns of a submission's conversation through its submitted snapshot.
      const subject = conv.creative ? (conv.creative.rounds[0]?.submittedName ?? conv.creative.name) : "General";
      const ids = await teamIds(tx, conv.assignedReviewerId);
      return {
        coalesce: true,
        drafts: ids.map<NotificationDraft>((recipientId) => ({
          recipientId,
          kind: "NEW_MESSAGE",
          dedupeKey,
          title: `New message from ${conv.client.name} about ${conv.creative ? quote(subject) : subject}`,
          href: `/admin/messages/${input.conversationId}`,
          conversationId: input.conversationId,
        })),
      };
    }
    const subject = conv.creative ? quote(conv.creative.name) : "your general conversation";
    return {
      coalesce: true,
      drafts: [
        {
          recipientId: conv.clientId,
          kind: "NEW_MESSAGE",
          dedupeKey,
          title: `Clyntique Reviewer replied about ${subject}`,
          href: `/dashboard/messages/${input.conversationId}`,
          conversationId: input.conversationId,
        },
      ],
    };
  });
}
