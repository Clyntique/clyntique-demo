import type { NotificationKind } from "./types";

type KindMeta = {
  /** Shown in preferences. */
  label: string;
  /** Who can receive this kind. */
  audience: "TEAM" | "CLIENT" | "BOTH";
  /** false = required: a preference can't switch it off. */
  mutable: boolean;
};

export const NOTIFICATION_KIND_META: Record<NotificationKind, KindMeta> = {
  SUBMISSION_RECEIVED: { label: "New submissions", audience: "TEAM", mutable: true },
  RESUBMISSION_RECEIVED: { label: "Resubmissions after changes", audience: "TEAM", mutable: true },
  REVIEW_STARTED: { label: "Review started", audience: "CLIENT", mutable: true },
  CHANGES_REQUESTED: { label: "Changes requested", audience: "CLIENT", mutable: false },
  REVIEW_COMPLETED: { label: "Internal review completed", audience: "CLIENT", mutable: false },
  REVIEW_REOPENED: { label: "Re-review opened", audience: "CLIENT", mutable: true },
  NEW_MESSAGE: { label: "New messages", audience: "BOTH", mutable: true },
  EVIDENCE_REVIEWED: { label: "Evidence reviewed", audience: "CLIENT", mutable: true },
};

export function kindsFor(role: "TEAM" | "CLIENT"): NotificationKind[] {
  return (Object.keys(NOTIFICATION_KIND_META) as NotificationKind[]).filter((k) => {
    const a = NOTIFICATION_KIND_META[k].audience;
    return a === "BOTH" || a === role;
  });
}
