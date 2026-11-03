import Link from "next/link";
import { notFound } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth/dal";
import { getEvidenceRecord } from "@/lib/data/evidence-records";
import { basePathFor } from "@/lib/navigation";
import { EVIDENCE_DICTIONARY_NOTICE, EVIDENCE_RECORD_CHECK_LABEL, EVIDENCE_RECORD_NOTICE, EVIDENCE_RECORD_STATUS_DESCRIPTION } from "@/lib/workflow/labels";
import { cn } from "@/lib/cn";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Card, SectionHeader } from "@/components/ui/card";
import { ExternalLinkIcon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { EVIDENCE_TYPES } from "@/components/review/evidence-types";
import { AttachRecordForm, CheckRecordForm } from "./evidence-record-forms";
import { RecordStatusPill, formatDateTime, formatDay } from "./record-status";

/*
 * One dictionary record (both roles): what it is, where it is used, what
 * reviewers recorded about it, and the two actions the loader allows:
 * attaching it to a submission, and (team) recording a check. The loader
 * (getEvidenceRecord) decides visibility; missing and forbidden both 404.
 */

export async function EvidenceRecordView({ role, params }: { role: Role; params: Promise<{ recordId: string }> }) {
  const [user, { recordId }] = await Promise.all([requireRole(role), params]);
  const record = await getEvidenceRecord(user, recordId);
  if (!record) notFound();
  const base = basePathFor(role);
  const team = role === "TEAM";

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <Breadcrumb trail={[{ label: "Evidence Dictionary", href: `${base}/evidence` }]} current={record.title} />

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="outline">{EVIDENCE_TYPES[record.type]}</Badge>
          {team && (record.isClyntique ? <Badge tone="brand">Clyntique record</Badge> : <Badge>{record.ownerName ?? "Client"} workspace</Badge>)}
          <RecordStatusPill status={record.status} expired={record.expired} />
        </div>
        <h1 className="text-page-title min-w-0 text-balance break-words text-ink">{record.title}</h1>
        <p className="text-small text-muted">{EVIDENCE_RECORD_STATUS_DESCRIPTION[record.status]}</p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="flex flex-col gap-3 p-4 sm:p-5">
            {record.claimText && (
              <p className="text-small break-words text-ink">
                <span className="font-medium text-ink-soft">Claim it supports:</span> “{record.claimText}”
              </p>
            )}
            {record.description ? (
              <p className="text-small break-words whitespace-pre-line text-ink-soft">{record.description}</p>
            ) : (
              <p className="text-meta">No description.</p>
            )}
            <dl className="grid gap-x-6 gap-y-1.5 text-small sm:grid-cols-[9rem_1fr]">
              {record.document && (
                <>
                  <dt className="text-muted">Quoted from</dt>
                  <dd className="min-w-0 break-words text-ink">
                    <Link href={record.document.href} className="font-medium text-brand-700 hover:underline">
                      {record.document.title}
                    </Link>{" "}
                    <span className="text-muted">({record.document.fileName}{record.document.deleted ? ", document since deleted" : ""})</span>
                  </dd>
                </>
              )}
              <dt className="text-muted">Source</dt>
              <dd className="min-w-0 break-words text-ink">
                {record.source ?? "—"}
                {record.url && (
                  <>
                    {" "}
                    <a href={record.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                      Open link <ExternalLinkIcon className="size-3" />
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </>
                )}
              </dd>
              <dt className="text-muted">Valid until</dt>
              <dd className={cn("text-ink", record.expired && "text-attention-ink")}>
                {record.validUntil ? `${formatDay(record.validUntil)}${record.expired ? " · passed" : ""}` : "Not stated"}
              </dd>
              <dt className="text-muted">Added</dt>
              <dd className="text-ink">
                {formatDateTime(record.createdAt)} by {record.createdByName}
              </dd>
            </dl>
          </Card>

          <section className="flex flex-col gap-3">
            <SectionHeader title="Used in submissions" description={team ? "Attachments the team has received through a submission." : "Each attachment is a copy of this record in that submission's evidence."} />
            {record.usages.length === 0 ? (
              <p className="text-meta">Not attached to any submission yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {record.usages.map((u) => (
                  <li key={u.evidenceId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2.5">
                    <div className="min-w-0">
                      <Link href={u.href} className="text-small font-medium text-ink hover:underline">
                        {u.creativeName}
                      </Link>
                      <p className="text-meta">
                        {u.projectName}
                        {u.versionNumber !== null ? ` · attached with V${u.versionNumber}` : ""} · {formatDay(u.attachedAt)}
                        {u.withdrawn ? " · withdrawn" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={u.creativeStatus} />
                      <Link href={u.recordHref} className="text-caption font-medium text-brand-700 hover:underline">
                        Compliance Passport
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader title="Reviewer checks" description="Append-only. The latest check is the record's status; earlier checks stay in the history." />
            {record.checks.length === 0 ? (
              <p className="text-meta">No reviewer check recorded yet.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {record.checks.map((c, i) => (
                  <li key={c.id} className={cn("rounded-md border border-line bg-surface px-3 py-2.5 text-small", i > 0 && "text-muted")}>
                    <span className="font-medium text-ink">{EVIDENCE_RECORD_CHECK_LABEL[c.result]}</span>
                    {i > 0 && <span className="text-meta"> (superseded)</span>}
                    {c.note && <span className="block break-words whitespace-pre-line text-ink-soft">{c.note}</span>}
                    <span className="text-meta block">
                      {c.reviewerName} · <time dateTime={c.createdAt.toISOString()}>{formatDateTime(c.createdAt)}</time>
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {record.canCheck && <CheckRecordForm recordId={record.id} />}
            <p className="text-caption text-muted">{EVIDENCE_RECORD_NOTICE}</p>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          {(team ? record.isClyntique : true) && (
            <Card className="flex flex-col gap-3 p-4">
              <SectionHeader title="Attach to a submission" description={team ? "As Clyntique evidence on the version under review." : "To a draft, or while changes are requested."} />
              <AttachRecordForm role={role} recordId={record.id} targets={record.attachTargets} />
            </Card>
          )}
          <p className="text-meta">{EVIDENCE_DICTIONARY_NOTICE}</p>
        </aside>
      </div>
    </div>
  );
}
