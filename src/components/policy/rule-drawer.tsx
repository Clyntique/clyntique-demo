"use client";

import { useEffect, useState, useTransition } from "react";
import type { PolicyRule, PolicyRuleVersion } from "@/lib/policy/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { CloseIcon, ExternalLinkIcon, ShieldIcon } from "@/components/ui/icons";
import {
  approveVersionServerAction,
  fetchPolicyHistoryServerAction,
  retireRuleServerAction,
  submitVersionServerAction,
  verifyVersionServerAction,
} from "@/lib/policy/actions";
import { canApprovePolicyVersion, canVerifyPolicyVersion } from "@/lib/policy/auth";
import {
  AUTHORITY_LABEL,
  CATEGORY_LABEL,
  NOT_STATED,
  POLICY_EVENT_LABEL,
  RESTRICTION_LABEL,
  RULE_INDUSTRY_LABEL,
  VERIFICATION_LABEL,
  versionStage,
} from "@/lib/policy/labels";

// One rule: every version (immutable once submitted), its structured content
// and citations, the Draft → Verified → Approved trail with both people, and
// the rule's history. Each action is a server action that re-checks the
// admin's rights and the two-person rules (src/lib/policy/db.ts); the
// checks here only decide which controls to show.

type History = Awaited<ReturnType<typeof fetchPolicyHistoryServerAction>>;

function formatDate(iso?: string | null, withTime = false) {
  if (!iso) return null;
  const d = new Date(iso);
  return withTime
    ? d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function List({ items, empty }: { items?: string[]; empty: string }) {
  if (!items?.length) return <p className="text-caption italic text-muted">{empty}</p>;
  return (
    <ul className="list-disc space-y-1 pl-4 text-small text-ink-soft">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

export function RuleDrawer({
  rule,
  currentUser,
  isPolicyAdmin,
  onClose,
  onChanged,
  onProposeVersion,
  onEditDraft,
}: {
  rule: PolicyRule | null;
  currentUser: { id: string; name: string; email: string };
  isPolicyAdmin: boolean;
  onClose: () => void;
  /** After any successful action: reload the library. */
  onChanged: (message: string) => void;
  onProposeVersion: (rule: PolicyRule) => void;
  onEditDraft: (rule: PolicyRule, version: PolicyRuleVersion) => void;
}) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // The parent keys this drawer by rule, so local state starts fresh per rule;
  // history is tagged with its rule so a late response never shows on another.
  const [loaded, setLoaded] = useState<{ ruleId: string; events: History } | null>(null);
  const history = rule && loaded?.ruleId === rule.id ? loaded.events : null;

  useEffect(() => {
    if (!rule) return;
    let live = true;
    const ruleId = rule.id;
    fetchPolicyHistoryServerAction(ruleId)
      .then((events) => live && setLoaded({ ruleId, events }))
      .catch(() => live && setLoaded({ ruleId, events: [] }));
    return () => {
      live = false;
    };
  }, [rule]);

  if (!rule) return null;

  // The newest version is where the work is; the current (approved) one is shown first otherwise.
  const newest = [...rule.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? rule.currentVersion;
  const version = rule.versions.find((v) => v.id === selectedVersionId) ?? (newest.status === "DRAFT" || newest.status === "PENDING_APPROVAL" ? newest : rule.currentVersion);
  const me = { id: currentUser.id, name: currentUser.name, email: currentUser.email, role: "TEAM" as const, isPolicyAdmin };
  const verifyCheck = canVerifyPolicyVersion(me, version);
  const approveCheck = canApprovePolicyVersion(me, version);
  const editable = isPolicyAdmin && version.status === "DRAFT" && version.verificationStatus !== "REJECTED" && version.verificationStatus !== "VERIFIED";
  const inProgress = rule.versions.some((v) => v.status === "PENDING_APPROVAL" || (v.status === "DRAFT" && v.verificationStatus !== "REJECTED"));

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, message: string) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) return setError(res.error ?? "That didn't work. Refresh and try again.");
      setNote("");
      onChanged(message);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/30 backdrop-blur-xs">
      <div role="dialog" aria-label={`Rule ${rule.code}`} className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-700">
              <ShieldIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-small font-semibold text-brand-700">{rule.code}</span>
                <Badge tone="outline">{AUTHORITY_LABEL[rule.authorityType]}</Badge>
              </div>
              <h2 className="mt-0.5 truncate text-body font-semibold text-ink">{version.title}</h2>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-ink" aria-label="Close">
            <CloseIcon className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {error && (
            <p role="alert" className="rounded-md border border-critical-line bg-critical-soft p-3 text-small text-critical-ink">
              {error}
            </p>
          )}

          <dl className="grid grid-cols-2 gap-2.5 rounded-lg border border-line bg-subtle/50 p-3 text-caption sm:grid-cols-4">
            <div>
              <dt className="text-muted">Market</dt>
              <dd className="font-medium text-ink">
                {rule.jurisdictionCode}
                {rule.subJurisdiction ? ` · ${rule.subJurisdiction}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Platform</dt>
              <dd className="font-medium text-ink">{rule.platformCode ?? "All platforms"}</dd>
            </div>
            <div>
              <dt className="text-muted">Industry</dt>
              <dd className="font-medium text-ink">{RULE_INDUSTRY_LABEL[rule.industry] ?? rule.industry}</dd>
            </div>
            <div>
              <dt className="text-muted">Category</dt>
              <dd className="font-medium text-ink">{CATEGORY_LABEL[rule.category] ?? rule.category}</dd>
            </div>
          </dl>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-small font-semibold text-ink">Versions</span>
              {isPolicyAdmin && rule.currentVersion.status === "ACTIVE" && !inProgress && (
                <Button size="sm" variant="secondary" onClick={() => onProposeVersion(rule)}>
                  Propose new version
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[...rule.versions]
                .sort((a, b) => b.versionNumber - a.versionNumber)
                .map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVersionId(v.id)}
                    className={`rounded-md px-2.5 py-1 text-caption font-medium ${v.id === version.id ? "bg-brand-600 text-white" : "border border-line bg-surface text-ink-soft hover:bg-subtle"}`}
                  >
                    v{v.versionNumber} · {versionStage(v)}
                  </button>
                ))}
            </div>
          </div>

          {/* Draft → Verified → Approved, with both people and times. */}
          <ol className="grid grid-cols-1 gap-2 text-caption sm:grid-cols-3">
            <li className="rounded-md border border-line p-2.5">
              <p className="font-semibold text-ink">1 · Written</p>
              <p className="text-muted">
                {version.createdByName} · {formatDate(version.createdAt, true)}
              </p>
            </li>
            <li className={`rounded-md border p-2.5 ${version.verifiedAt ? "border-positive-line" : "border-line"}`}>
              <p className="font-semibold text-ink">2 · Verified against sources</p>
              <p className="text-muted">
                {version.verifiedAt ? `${version.verifiedByName ?? "Policy admin"} · ${formatDate(version.verifiedAt, true)}` : VERIFICATION_LABEL[version.verificationStatus]}
              </p>
              {version.verificationNote && <p className="mt-1 text-ink-soft">{version.verificationNote}</p>}
            </li>
            <li className={`rounded-md border p-2.5 ${version.approvedAt ? "border-positive-line" : "border-line"}`}>
              <p className="font-semibold text-ink">3 · Approved by a second admin</p>
              <p className="text-muted">{version.approvedAt ? `${version.approvedByName ?? "Policy admin"} · ${formatDate(version.approvedAt, true)}` : "Not approved"}</p>
            </li>
          </ol>
          {version.reviewNote && (
            <p className="rounded-md border border-attention-line bg-attention-soft px-3 py-2 text-small text-attention-ink">
              <span className="font-medium">{version.verificationStatus === "REJECTED" ? "Rejected:" : "Returned for changes:"}</span> {version.reviewNote}
            </p>
          )}

          <section className="space-y-4">
            <div>
              <h3 className="mb-1 text-small font-semibold text-ink">Summary</h3>
              <p className="whitespace-pre-line text-small leading-relaxed text-ink-soft">{version.summary}</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-1 text-caption font-semibold text-ink">Restriction level</h4>
                <p className="text-small text-ink-soft">{version.restrictionLevel ? RESTRICTION_LABEL[version.restrictionLevel] : "Not set"}</p>
              </div>
              <div>
                <h4 className="mb-1 text-caption font-semibold text-ink">Effective date stated by the source</h4>
                <p className="text-small text-ink-soft">{formatDate(version.officialEffectiveDate) ?? NOT_STATED}</p>
              </div>
              <div>
                <h4 className="mb-1 text-caption font-semibold text-ink">Restricted or prohibited claims</h4>
                <List items={version.restrictedClaims} empty="None listed." />
              </div>
              <div>
                <h4 className="mb-1 text-caption font-semibold text-ink">Evidence and substantiation required</h4>
                <List items={version.substantiationRequirements} empty="None listed." />
              </div>
            </div>
            {version.legalExplanation && (
              <div>
                <h4 className="mb-1 text-caption font-semibold text-ink">Explanation for reviewers</h4>
                <p className="whitespace-pre-line text-small text-ink-soft">{version.legalExplanation}</p>
              </div>
            )}
            {version.remediationAction && (
              <div>
                <h4 className="mb-1 text-caption font-semibold text-ink">What the advertiser should do</h4>
                <p className="whitespace-pre-line text-small text-ink-soft">{version.remediationAction}</p>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-1 text-caption font-semibold text-ink">When it applies</h4>
                <List items={version.applicabilityConditions} empty="No conditions recorded." />
              </div>
              <div>
                <h4 className="mb-1 text-caption font-semibold text-ink">Exceptions</h4>
                <List items={version.exceptions} empty="No exceptions recorded." />
              </div>
            </div>
            <p className="text-caption text-muted">
              Clyntique uses this version{" "}
              {version.status === "ACTIVE" || version.status === "DEPRECATED"
                ? `from ${formatDate(version.effectiveFrom)}${version.effectiveTo ? ` until ${formatDate(version.effectiveTo)}` : ""}`
                : "from its approval"}
              . {version.changeSummary && `Change note: ${version.changeSummary}`}
            </p>
          </section>

          <section>
            <h3 className="mb-2 text-small font-semibold text-ink">Official sources cited</h3>
            {version.sources.length === 0 ? (
              <p className="text-caption italic text-muted">No source cited yet. A version needs at least one before it can be verified.</p>
            ) : (
              <div className="space-y-2.5">
                {version.sources.map((s) => (
                  <div key={s.id} className="rounded-lg border border-line p-3.5 text-small">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink">
                          {s.sourceName} <span className="font-mono text-caption text-ink-soft">{s.sectionReference}</span>
                        </p>
                        <p className="mt-0.5 text-caption text-muted">
                          {s.authorityName}
                          {s.sectionTitle && s.sectionTitle !== s.sectionReference ? ` · ${s.sectionTitle}` : ""} · source {VERIFICATION_LABEL[s.sourceVerificationStatus ?? "UNVERIFIED"].toLowerCase()}
                        </p>
                        <p className="mt-0.5 text-caption text-muted">
                          Page updated: {formatDate(s.sourceUpdatedAt) ?? NOT_STATED} · Read: {formatDate(s.retrievedAt) ?? "Not recorded"}
                        </p>
                      </div>
                      <a href={s.directUrl} target="_blank" rel="noreferrer noopener" className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-caption font-medium text-brand-600 hover:text-brand-800">
                        Open <ExternalLinkIcon className="size-3.5" />
                      </a>
                    </div>
                    {s.excerpt && <blockquote className="mt-2.5 border-l-2 border-line-strong pl-3 text-caption italic text-muted">&ldquo;{s.excerpt}&rdquo;</blockquote>}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-small font-semibold text-ink">History</h3>
            {history === null ? (
              <p className="text-caption text-muted">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-caption text-muted">No history recorded.</p>
            ) : (
              <ol className="space-y-1.5">
                {history.map((e) => (
                  <li key={e.id} className="text-caption text-ink-soft">
                    <span className="font-medium text-ink">{POLICY_EVENT_LABEL[e.kind]}</span>
                    {e.versionNumber ? ` · v${e.versionNumber}` : ""}
                    {e.sourceName ? ` · ${e.sourceName}` : ""} · {e.actorName} · {formatDate(e.createdAt, true)}
                    {e.note && <span className="block text-muted">{e.note}</span>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-2.5 border-t border-line px-6 py-4">
          {isPolicyAdmin && (verifyCheck.allowed || approveCheck.allowed || version.status === "ACTIVE") && (
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the record (needed to return, reject or retire)…" className="min-h-14" maxLength={1000} />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-caption text-muted">
              {version.status === "PENDING_APPROVAL" && version.verificationStatus === "UNVERIFIED" && !verifyCheck.allowed && verifyCheck.reason}
              {version.status === "PENDING_APPROVAL" && version.verificationStatus === "VERIFIED" && !approveCheck.allowed && approveCheck.reason}
              {version.status === "ACTIVE" && "Approved versions can't be changed. Propose a new version instead."}
              {version.status === "DEPRECATED" && "Superseded or retired: kept for the record, never used by the AI."}
              {!isPolicyAdmin && "Policy Administrator rights are needed to change the library."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {editable && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => onEditDraft(rule, version)} disabled={pending}>
                    Edit draft
                  </Button>
                  <Button size="sm" onClick={() => act(() => submitVersionServerAction(version.id), "Submitted for verification.")} disabled={pending}>
                    Submit for verification
                  </Button>
                </>
              )}
              {verifyCheck.allowed && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => act(() => verifyVersionServerAction(version.id, { result: "REJECTED", note }), "Version rejected.")} disabled={pending}>
                    Reject
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => act(() => verifyVersionServerAction(version.id, { result: "REQUIRES_REVIEW", note }), "Returned to the author.")} disabled={pending}>
                    Return for changes
                  </Button>
                  <Button size="sm" onClick={() => act(() => verifyVersionServerAction(version.id, { result: "VERIFIED", note }), "Verified. A different admin must approve it.")} disabled={pending}>
                    Mark verified
                  </Button>
                </>
              )}
              {approveCheck.allowed && (
                <Button size="sm" onClick={() => act(() => approveVersionServerAction(rule.id, version.id, note || undefined), "Approved. The AI and reviewers can now use it.")} disabled={pending}>
                  Approve and activate
                </Button>
              )}
              {isPolicyAdmin && version.status === "ACTIVE" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm(`Retire ${rule.code}? The AI and reviewers stop using it; its history stays.`)) act(() => retireRuleServerAction(rule.id, note || undefined), "Rule retired.");
                  }}
                  disabled={pending}
                >
                  Retire rule
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
