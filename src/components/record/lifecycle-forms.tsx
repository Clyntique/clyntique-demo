"use client";

import { useActionState, useState } from "react";
import type { ExternalDestinationType, ExternalOutcomeKind, ExternalRecordBasis, ReviewCycleReason, Role } from "@/generated/prisma/enums";
import { recordExternalOutcomeAction, recordExternalSubmissionAction, reopenReviewAction, type LifecycleActionState } from "@/lib/lifecycle/actions";
import { DECISION_SOURCE_LABEL, EXTERNAL_BASIS_LABEL, EXTERNAL_DESTINATION_LABEL, EXTERNAL_DISCLAIMER, EXTERNAL_OUTCOME_LABEL, REVIEW_CYCLE_REASON_LABEL } from "@/lib/workflow/labels";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormError } from "@/components/forms/form-error";

/*
 * Lifecycle forms (Oct 19 sprint). Each posts to a server action that
 * re-checks the user, role and status (src/lib/workflow/commands.ts); these
 * components only manage pending state and show the result. None of them
 * submits anything outside Clyntique: they record what happened elsewhere.
 */

const DESTINATIONS: ExternalDestinationType[] = ["AD_PLATFORM", "REGULATOR"];
const OUTCOMES: ExternalOutcomeKind[] = ["APPROVED", "CHANGES_REQUESTED", "REJECTED"];
const BASES: ExternalRecordBasis[] = ["CLIENT_REPORTED", "TEAM_VERIFIED"];
const REASONS: ReviewCycleReason[] = ["POLICY_CHANGE", "EXTERNAL_OUTCOME", "CLIENT_UPDATE", "EVIDENCE_EXPIRED", "TEAM_REQUEST"];

function Ok({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-md bg-positive-soft px-3 py-2 text-small text-positive-ink">
      {message}
    </p>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------

export type Option = { code: string; name: string };

export function ExternalSubmissionForm({
  creativeId,
  role,
  versions,
  markets,
  platforms,
}: {
  creativeId: string;
  role: Role;
  versions: { id: string; versionNumber: number }[];
  markets: Option[];
  platforms: Option[];
}) {
  const [state, action, pending] = useActionState<LifecycleActionState, FormData>(recordExternalSubmissionAction, undefined);
  const [destination, setDestination] = useState<ExternalDestinationType>((state?.values?.destinationType as ExternalDestinationType) || "AD_PLATFORM");
  const v = state?.values ?? {};
  const team = role === "TEAM";
  return (
    <form action={action} className="flex flex-col gap-3 print:hidden">
      <input type="hidden" name="creativeId" value={creativeId} />
      <FormError message={state?.error} />
      <Ok message={state?.ok} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Submitted to">
          <Select name="destinationType" value={destination} onChange={(e) => setDestination(e.target.value as ExternalDestinationType)} required>
            {DESTINATIONS.map((d) => (
              <option key={d} value={d}>
                {EXTERNAL_DESTINATION_LABEL[d]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={destination === "REGULATOR" ? "Regulator" : "Platform or account"} hint="As named in the submission or application">
          <Input name="destinationName" defaultValue={v.destinationName} placeholder={destination === "REGULATOR" ? "e.g. Advertising Standards Authority" : "e.g. Meta Ads Manager"} required minLength={2} maxLength={120} />
        </Field>
        <Field label="Version submitted" hint="Only versions that Clyntique reviewed">
          <Select name="versionId" defaultValue={v.versionId ?? versions[0]?.id} required>
            {versions.map((ver) => (
              <option key={ver.id} value={ver.id}>
                V{ver.versionNumber}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date submitted">
          <Input name="submittedOn" type="date" defaultValue={v.submittedOn ?? today()} max={today()} required />
        </Field>
        {destination === "AD_PLATFORM" && platforms.length > 0 && (
          <Field label="Platform (from this submission's targeting)">
            <Select name="platformCode" defaultValue={v.platformCode ?? ""}>
              <option value="">Not specified</option>
              {platforms.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {markets.length > 0 && (
          <Field label="Market">
            <Select name="marketCode" defaultValue={v.marketCode ?? ""}>
              <option value="">Not specified</option>
              {markets.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="External reference" hint="Case, ticket or ad ID, if any">
          <Input name="externalReference" defaultValue={v.externalReference} maxLength={200} />
        </Field>
        {team ? (
          <Field label="Recorded as">
            <Select name="basis" defaultValue={v.basis ?? "TEAM_VERIFIED"} required>
              {BASES.map((b) => (
                <option key={b} value={b}>
                  {EXTERNAL_BASIS_LABEL[b]}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="basis" value="CLIENT_REPORTED" />
        )}
      </div>
      <Field label="Note (optional)">
        <Textarea name="note" defaultValue={v.note} maxLength={2000} rows={2} />
      </Field>
      <Button type="submit" disabled={pending || versions.length === 0}>
        {pending ? "Recording…" : "Record external submission"}
      </Button>
      <p className="text-meta">
        {DECISION_SOURCE_LABEL.EXTERNAL_OUTCOME}. {EXTERNAL_DISCLAIMER}
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------

export function ExternalOutcomeForm({
  submissionId,
  role,
  evidence,
}: {
  submissionId: string;
  role: Role;
  evidence: { id: string; title: string }[];
}) {
  const [state, action, pending] = useActionState<LifecycleActionState, FormData>(recordExternalOutcomeAction, undefined);
  const [open, setOpen] = useState(false);
  const v = state?.values ?? {};
  const team = role === "TEAM";
  if (!open && !state) {
    return (
      <Button type="button" variant="secondary" size="sm" className="self-start print:hidden" onClick={() => setOpen(true)}>
        Record outcome
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3 rounded-md border border-line bg-subtle/50 p-3 print:hidden">
      <input type="hidden" name="submissionId" value={submissionId} />
      <FormError message={state?.error} />
      <Ok message={state?.ok} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What they answered">
          <Select name="kind" defaultValue={v.kind ?? ""} required>
            <option value="" disabled>
              Choose…
            </option>
            {OUTCOMES.map((k) => (
              <option key={k} value={k}>
                {EXTERNAL_OUTCOME_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date of the outcome">
          <Input name="outcomeOn" type="date" defaultValue={v.outcomeOn ?? today()} max={today()} required />
        </Field>
        {evidence.length > 0 && (
          <Field label="Supporting document (optional)" hint="An evidence item of this submission, e.g. the decision letter">
            <Select name="evidenceId" defaultValue={v.evidenceId ?? ""}>
              <option value="">None</option>
              {evidence.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {team ? (
          <Field label="Recorded as" hint="“Checked by the team” means a team member read the platform's or regulator's own document">
            <Select name="basis" defaultValue={v.basis ?? "CLIENT_REPORTED"} required>
              {BASES.map((b) => (
                <option key={b} value={b}>
                  {EXTERNAL_BASIS_LABEL[b]}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="basis" value="CLIENT_REPORTED" />
        )}
      </div>
      <Field label="What was said" hint="Required unless approved: quote or summarise the reason given">
        <Textarea name="note" defaultValue={v.note} maxLength={2000} rows={3} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Recording…" : "Record outcome"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

export function ReopenReviewForm({
  creativeId,
  ruleVersions,
}: {
  creativeId: string;
  /** Approved rule versions the reviewer may cite as the trigger (POLICY_CHANGE). */
  ruleVersions: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState<LifecycleActionState, FormData>(reopenReviewAction, undefined);
  const [reason, setReason] = useState<ReviewCycleReason>((state?.values?.reason as ReviewCycleReason) || "TEAM_REQUEST");
  const v = state?.values ?? {};
  return (
    <form action={action} className="flex flex-col gap-3 print:hidden">
      <input type="hidden" name="creativeId" value={creativeId} />
      <FormError message={state?.error} />
      <Ok message={state?.ok} />
      <Field label="Why another review is needed">
        <Select name="reason" value={reason} onChange={(e) => setReason(e.target.value as ReviewCycleReason)} required>
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {REVIEW_CYCLE_REASON_LABEL[r]}
            </option>
          ))}
        </Select>
      </Field>
      {reason === "POLICY_CHANGE" && ruleVersions.length > 0 && (
        <Field label="Rule version that changed (optional)">
          <Select name="triggerRuleVersionId" defaultValue={v.triggerRuleVersionId ?? ""}>
            <option value="">Not tied to one rule version</option>
            {ruleVersions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Note to the client" hint="Shown on the submission and in this record">
        <Textarea name="note" defaultValue={v.note} minLength={10} maxLength={2000} rows={3} required placeholder="e.g. The claims policy for this market changed on 1 October; the approved version needs re-checking against the new rule." />
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Opening…" : "Open re-review"}
      </Button>
      <p className="text-meta">
        Starts a new review cycle on the latest version. The previous cycle, its findings and its decision stay in the record unchanged; nothing is copied
        forward. The client is not asked to resubmit.
      </p>
    </form>
  );
}

// ---------------------------------------------------------------------------

/** From the impact list: open a policy-change re-review on one submission, citing the new rule version. */
export function ImpactReopenForm({ creativeId, ruleVersionId, ruleLabel }: { creativeId: string; ruleVersionId: string; ruleLabel: string }) {
  const [state, action, pending] = useActionState<LifecycleActionState, FormData>(reopenReviewAction, undefined);
  const [open, setOpen] = useState(false);
  if (state?.ok) return <Ok message={state.ok} />;
  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Open re-review
      </Button>
    );
  }
  return (
    <form action={action} className="flex w-full flex-col gap-2 rounded-md border border-line bg-subtle/50 p-3">
      <input type="hidden" name="creativeId" value={creativeId} />
      <input type="hidden" name="reason" value="POLICY_CHANGE" />
      <input type="hidden" name="triggerRuleVersionId" value={ruleVersionId} />
      <FormError message={state?.error} />
      <Field label="Note to the client" hint={`Cites ${ruleLabel}. Shown on the submission.`}>
        <Textarea name="note" defaultValue={state?.values?.note} minLength={10} maxLength={2000} rows={2} required placeholder="e.g. This rule changed; we are re-checking the approved version against the new text." />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Opening…" : "Open re-review"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
