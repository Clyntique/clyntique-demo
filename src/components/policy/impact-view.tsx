import Link from "next/link";
import type { PolicyImpact, RuleChange } from "@/lib/data/policy-impact";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { PageHeader } from "@/components/layout/page-header";
import { ImpactReopenForm } from "@/components/record/lifecycle-forms";
import { Card, SectionHeader } from "@/components/ui/card";
import { StatusBadge, TonePill } from "@/components/ui/status-badge";
import { POLICY_EVENT_LABEL } from "@/lib/policy/labels";

/*
 * Rule-change impact (Oct 19 sprint, TEAM). For each approved or retired
 * rule version: which submissions were judged against the superseded
 * version, split into confirmed (a finding cited it) and potential (only an
 * AI pre-check ran against it). A reviewer decides, per submission, whether
 * to open a re-review; nothing is reopened or resubmitted automatically.
 */


function dateTime(date: Date) {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function PolicyImpactView({ impact }: { impact: PolicyImpact }) {
  return (
    <>
      <Breadcrumb trail={[{ label: "Policy Library", href: "/admin/policy-library" }]} current="Rule changes & impact" />
      <PageHeader
        eyebrow="Living rulebook"
        title="Rule changes and impact"
        description="Every change to a policy rule, and the submissions that were reviewed or pre-checked against a version that is no longer current. A reviewer decides what to re-review; clients are never asked to resubmit automatically."
      />

      <section className="mb-10 flex flex-col gap-4">
        <SectionHeader title="Changes with possible impact" description={impact.changes.length ? `${impact.changes.length} rule${impact.changes.length === 1 ? "" : "s"} with a superseded version` : undefined} />
        {impact.changes.length === 0 ? (
          <Card className="p-5">
            <p className="text-small text-muted">No rule version has been superseded or retired yet. When an administrator approves a new version of an active rule, it appears here with the submissions it may affect.</p>
          </Card>
        ) : (
          impact.changes.map((c) => <ChangeCard key={c.ruleId} change={c} />)
        )}
      </section>

      <section className="flex flex-col gap-4">
        <SectionHeader title="Rule history" description="Append-only log written by the Policy Library commands." />
        {impact.events.length === 0 ? (
          <Card className="p-5">
            <p className="text-small text-muted">No rule events recorded yet. Events are written from now on when a rule is created, a version is proposed or approved, or a rule is retired.</p>
          </Card>
        ) : (
          <Card className="overflow-x-auto p-4">
            <table className="w-full border-collapse text-small">
              <thead>
                <tr className="text-caption text-left text-muted">
                  <th className="py-1 pr-3 font-medium">When</th>
                  <th className="py-1 pr-3 font-medium">Event</th>
                  <th className="py-1 pr-3 font-medium">Rule</th>
                  <th className="py-1 pr-3 font-medium">By</th>
                  <th className="py-1 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {impact.events.map((e) => (
                  <tr key={e.id} className="border-t border-line align-top">
                    <td className="py-1.5 pr-3 whitespace-nowrap text-muted">{dateTime(e.createdAt)}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap font-medium text-ink">{POLICY_EVENT_LABEL[e.kind]}</td>
                    <td className="py-1.5 pr-3">
                      <span className="text-record">{e.ruleCode}</span>
                      {e.versionNumber != null && <span className="text-muted"> v{e.versionNumber}</span>}
                      <p className="text-muted">{e.ruleTitle}</p>
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{e.actorName}</td>
                    <td className="py-1.5 text-ink-soft">{e.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </>
  );
}

function ChangeCard({ change: c }: { change: RuleChange }) {
  const confirmed = c.impacted.filter((i) => i.tier === "CONFIRMED");
  const potential = c.impacted.filter((i) => i.tier === "POTENTIAL");
  const label = c.newVersion ? `${c.ruleCode} v${c.newVersion.versionNumber}` : `${c.ruleCode} (retired)`;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-body font-semibold text-ink">
              <span className="text-record">{c.ruleCode}</span> · {c.ruleTitle}
            </h3>
            <TonePill tone={c.kind === "RULE_RETIRED" ? "neutral" : "accent"}>{c.kind === "RULE_RETIRED" ? "Retired" : `v${c.newVersion?.versionNumber} approved`}</TonePill>
          </div>
          <p className="text-small mt-1 text-muted">
            {dateTime(c.changedAt)} · {c.changedByName} · supersedes {c.supersededVersions.map((v) => `v${v.versionNumber}`).join(", ")}
          </p>
          {c.newVersion && <p className="text-small mt-1 text-ink-soft">{c.newVersion.changeSummary}</p>}
        </div>
        <div className="text-small flex gap-4 text-muted">
          <span>
            <span className="font-semibold text-ink">{confirmed.length}</span> confirmed
          </span>
          <span>
            <span className="font-semibold text-ink">{potential.length}</span> potential
          </span>
        </div>
      </div>

      {c.impacted.length === 0 ? (
        <p className="text-small text-muted">No submission was reviewed or pre-checked against the superseded version.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {c.impacted.map((i) => (
            <li key={i.creativeId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <TonePill tone={i.tier === "CONFIRMED" ? "attention" : "neutral"}>{i.tier === "CONFIRMED" ? "Confirmed" : "Potentially affected"}</TonePill>
                  <Link href={`/admin/creatives/${i.creativeId}`} className="text-small font-medium text-ink hover:underline">
                    {i.name}
                  </Link>
                  <StatusBadge status={i.status} />
                </div>
                <p className="text-caption mt-0.5 text-muted">
                  {i.clientName} · {i.projectName} · {i.via}
                </p>
              </div>
              <div className="shrink-0 sm:max-w-sm">
                {i.reReviewOpened ? (
                  <TonePill tone="positive">Re-review opened</TonePill>
                ) : i.reviewInProgress ? (
                  <span className="text-caption text-muted">Review in progress; re-check applies in the current cycle.</span>
                ) : c.newVersion && i.status === "REVIEW_COMPLETE" ? (
                  <ImpactReopenForm creativeId={i.creativeId} ruleVersionId={c.newVersion.id} ruleLabel={label} />
                ) : (
                  <span className="text-caption text-muted">{c.newVersion ? "Not in a state that allows a re-review." : "Rule retired; no re-check needed unless a reviewer decides otherwise."}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
