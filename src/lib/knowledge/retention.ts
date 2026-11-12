// Retention of the knowledge-search question log (KnowledgeQuery). Pure
// rules plus one narrow delete; no scheduler, route or cron calls this.
//
// Status (Nov 10): PREPARED, NOT ACTIVE. Nothing is ever deleted unless
//   1. a retention period has been approved and set in
//      KNOWLEDGE_QUERY_RETENTION_DAYS, and
//   2. a person runs prisma/knowledge-query-retention.ts with its explicit
//      write flags (see that file).
// With the variable unset, empty or invalid, retention is disabled.
//
// Safety by construction: the only database access this module has is the
// QuestionLogStore below, which exposes count and deleteMany of the question
// log and nothing else. It cannot reach uploaded documents, passages,
// evidence records, submissions, review or policy history, messages, audit
// events or accounts. No other table references KnowledgeQuery, so deleting
// a question-log row cannot cascade anywhere (asserted in tests against the
// Prisma schema).

export const RETENTION_ENV = "KNOWLEDGE_QUERY_RETENTION_DAYS";
/** Shortest and longest period accepted; anything else disables retention rather than guessing. */
export const RETENTION_MIN_DAYS = 30;
export const RETENTION_MAX_DAYS = 3650;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The configured retention period in whole days, or null when retention is disabled (unset, empty, malformed or out of range). */
export function questionLogRetentionDays(env: Record<string, string | undefined> = process.env): number | null {
  const raw = (env[RETENTION_ENV] ?? "").trim();
  if (!/^\d{1,5}$/.test(raw)) return null;
  const days = Number(raw);
  return Number.isSafeInteger(days) && days >= RETENTION_MIN_DAYS && days <= RETENTION_MAX_DAYS ? days : null;
}

/** Rows created strictly before this moment are past the retention period. */
export function retentionCutoff(days: number, now: Date = new Date()): Date {
  if (!Number.isSafeInteger(days) || days < RETENTION_MIN_DAYS || days > RETENTION_MAX_DAYS) throw new Error("Retention period out of range.");
  return new Date(now.getTime() - days * DAY_MS);
}

type CreatedBefore = { where: { createdAt: { lt: Date } } };

/** The only database surface retention may use: the question log, count and delete by age. */
export type QuestionLogStore = {
  knowledgeQuery: {
    count(args?: CreatedBefore): Promise<number>;
    deleteMany(args: CreatedBefore): Promise<{ count: number }>;
  };
};

export type RetentionOutcome =
  | { enabled: false; reason: string }
  | { enabled: true; days: number; cutoff: Date; applied: boolean; total: number; eligible: number; deleted: number };

/**
 * Counts, and with `apply` deletes, question-log rows older than the
 * configured period. Disabled configuration: reads nothing, deletes nothing.
 * Without `apply` (the default) it only counts.
 */
export async function purgeExpiredQuestionLogs(
  store: QuestionLogStore,
  options: { apply?: boolean; now?: Date; env?: Record<string, string | undefined> } = {},
): Promise<RetentionOutcome> {
  const days = questionLogRetentionDays(options.env ?? process.env);
  if (days === null) return { enabled: false, reason: `${RETENTION_ENV} is not set to a whole number of days between ${RETENTION_MIN_DAYS} and ${RETENTION_MAX_DAYS}; question-log retention is disabled and nothing is deleted.` };
  const cutoff = retentionCutoff(days, options.now ?? new Date());
  const where = { createdAt: { lt: cutoff } };
  const [total, eligible] = await Promise.all([store.knowledgeQuery.count(), store.knowledgeQuery.count({ where })]);
  if (options.apply !== true) return { enabled: true, days, cutoff, applied: false, total, eligible, deleted: 0 };
  const { count } = await store.knowledgeQuery.deleteMany({ where });
  return { enabled: true, days, cutoff, applied: true, total, eligible, deleted: count };
}
