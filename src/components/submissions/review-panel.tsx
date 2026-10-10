"use client";

import { useActionState, useState } from "react";
import type { FindingAction, FindingSeverity, ReviewOutcome } from "@/generated/prisma/enums";
import {
  addFindingAction,
  completeReviewAction,
  dismissFindingAction,
  reopenFindingAction,
  requestChangesAction,
  resolveFindingAction,
  startReviewAction,
  updateFindingAction,
  type ReviewActionState,
} from "@/app/admin/review/actions";
import type { FindingView, OutcomeAvailability } from "@/lib/data/submission-review";
import { cn } from "@/lib/cn";
import {
  REQUIRED_ACTION_LABEL,
  REVIEW_DISCLAIMER,
  REVIEW_OUTCOME_DESCRIPTION,
  REVIEW_OUTCOME_LABEL,
  SEVERITY_DESCRIPTION,
  SEVERITY_LABEL,
} from "@/lib/workflow/labels";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { FormError } from "@/components/forms/form-error";

// TEAM review controls. Each form posts to a server action that re-checks the
// user, role, status, round and version (src/lib/workflow/commands.ts); these
// components only manage pending state and show the result.

export type TargetChoice = { code: string; name: string };

const SEVERITIES: FindingSeverity[] = ["HIGH", "MEDIUM", "LOW", "ADVISORY"];
const ACTIONS: FindingAction[] = ["REVISE_CONTENT", "PROVIDE_EVIDENCE", "CLARIFY", "ACKNOWLEDGE"];
const OUTCOMES: ReviewOutcome[] = ["NO_ISSUES_IDENTIFIED", "ISSUES_RESOLVED", "COMPLETED_WITH_OPEN_ISSUES", "NOT_REVIEWABLE"];

const optionCard =
  "flex cursor-pointer flex-col gap-0.5 rounded-md border border-line bg-surface px-3 py-2 shadow-card transition-colors hover:border-line-strong has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-brand-100 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50";
const chip =
  "inline-flex cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-soft has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-900";

function Ok({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
      {message}
    </p>
  );
}

// ---------------------------------------------------------------------------

export function StartReviewForm({ creativeId }: { creativeId: string }) {
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(startReviewAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="creativeId" value={creativeId} />
      <FormError message={state?.error} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Starting…" : "Start review"}
      </Button>
      <p className="text-meta">Marks it as in review, with you as the reviewer on record. The file and targeting stay locked.</p>
    </form>
  );
}

// ---------------------------------------------------------------------------

type FindingDefaults = {
  issue: string;
  explanation: string;
  severity: FindingSeverity | "";
  requiredAction: FindingAction | "";
  actionDetails: string;
  markets: string[];
  platforms: string[];
};

const EMPTY: FindingDefaults = { issue: "", explanation: "", severity: "", requiredAction: "", actionDetails: "", markets: [], platforms: [] };

function FindingFields({ d, markets, platforms, idPrefix }: { d: FindingDefaults; markets: TargetChoice[]; platforms: TargetChoice[]; idPrefix: string }) {
  return (
    <>
      <Field label="Issue" hint="One line, e.g. “Unsupported ‘clinically proven’ claim”.">
        <Input name="issue" defaultValue={d.issue} maxLength={300} required />
      </Field>
      <Field label="Explanation" hint="Why this is an issue for the selected markets and platforms.">
        <Textarea name="explanation" defaultValue={d.explanation} maxLength={4000} className="min-h-20" required />
      </Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-[13px] font-medium text-ink-soft">Severity</legend>
        <div className="grid grid-cols-2 gap-2">
          {SEVERITIES.map((s) => (
            <label key={s} className={optionCard} title={SEVERITY_DESCRIPTION[s]}>
              <input type="radio" name="severity" value={s} defaultChecked={d.severity === s} className="sr-only" id={`${idPrefix}-sev-${s}`} />
              <span className="text-[13px] font-medium text-ink">{SEVERITY_LABEL[s]}</span>
              <span className="text-meta leading-snug">{SEVERITY_DESCRIPTION[s]}</span>
            </label>
          ))}
        </div>
        <span className="text-meta">Reviewer-assessed, not a legal classification.</span>
      </fieldset>
      <Field label="Required client action">
        <Select name="requiredAction" defaultValue={d.requiredAction} required>
          <option value="" disabled>
            Choose…
          </option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {REQUIRED_ACTION_LABEL[a]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="What exactly should the client do?" hint="Specific and actionable, e.g. “Provide the study behind the 2× claim, or remove the claim.”">
        <Textarea name="actionDetails" defaultValue={d.actionDetails} maxLength={4000} className="min-h-20" required />
      </Field>
      {(markets.length > 0 || platforms.length > 0) && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-[13px] font-medium text-ink-soft">Relevant to (optional)</legend>
          <div className="flex flex-wrap gap-1.5">
            {markets.map((m) => (
              <label key={m.code} className={chip}>
                <input type="checkbox" name="markets" value={m.code} defaultChecked={d.markets.includes(m.code)} className="size-3 accent-brand-600" />
                {m.name}
              </label>
            ))}
            {platforms.map((p) => (
              <label key={p.code} className={chip}>
                <input type="checkbox" name="platforms" value={p.code} defaultChecked={d.platforms.includes(p.code)} className="size-3 accent-brand-600" />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </>
  );
}

function fromState(state: ReviewActionState, fallback: FindingDefaults): FindingDefaults {
  const v = state?.values;
  if (!v) return fallback;
  const s = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
  const a = (k: string) => (Array.isArray(v[k]) ? (v[k] as string[]) : []);
  return {
    issue: s("issue"),
    explanation: s("explanation"),
    severity: s("severity") as FindingSeverity,
    requiredAction: s("requiredAction") as FindingAction,
    actionDetails: s("actionDetails"),
    markets: a("markets"),
    platforms: a("platforms"),
  };
}

export function AddFindingForm({ creativeId, markets, platforms }: { creativeId: string; markets: TargetChoice[]; platforms: TargetChoice[] }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(async (prev, fd) => {
    const result = await addFindingAction(prev, fd);
    if (result?.ok) setFormKey((k) => k + 1); // fresh, empty form for the next finding
    return result;
  }, undefined);

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <Ok message={state?.ok} />
        <Button variant="secondary" onClick={() => setOpen(true)} className="self-start">
          + Add finding
        </Button>
      </div>
    );
  }
  return (
    <form key={formKey} action={action} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 shadow-card" noValidate>
      <input type="hidden" name="creativeId" value={creativeId} />
      <div>
        <h3 className="text-card-title">New finding</h3>
        <p className="text-meta">Saved as a draft. The client sees it only when you request changes or complete the review.</p>
      </div>
      <FormError message={state?.error} />
      <Ok message={state?.ok} />
      <FindingFields d={fromState(state?.ok ? undefined : state, EMPTY)} markets={markets} platforms={platforms} idPrefix={`new-${formKey}`} />
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save draft finding"}
        </Button>
      </div>
    </form>
  );
}

export function DraftFindingControls({ finding, markets, platforms }: { finding: FindingView; markets: TargetChoice[]; platforms: TargetChoice[] }) {
  const [mode, setMode] = useState<"idle" | "edit" | "dismiss">("idle");
  const [editState, editAction, editing] = useActionState<ReviewActionState, FormData>(async (prev, fd) => {
    const r = await updateFindingAction(prev, fd);
    if (r?.ok) setMode("idle");
    return r;
  }, undefined);
  const [dismissState, dismissAction, dismissing] = useActionState<ReviewActionState, FormData>(dismissFindingAction, undefined);

  const defaults: FindingDefaults = {
    issue: finding.issue,
    explanation: finding.explanation,
    severity: finding.severity,
    requiredAction: finding.requiredAction,
    actionDetails: finding.actionDetails,
    markets: finding.marketCodes,
    platforms: finding.platformCodes,
  };

  return (
    <div className="mt-3 border-t border-line pt-3">
      {mode === "idle" && (
        <div className="flex flex-wrap items-center gap-2">
          <Ok message={editState?.ok} />
          <Button size="sm" variant="secondary" onClick={() => setMode("edit")}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("dismiss")}>
            Dismiss
          </Button>
        </div>
      )}
      {mode === "edit" && (
        <form action={editAction} className="flex flex-col gap-4" noValidate>
          <input type="hidden" name="findingId" value={finding.id} />
          <FormError message={editState?.error} />
          <FindingFields d={fromState(editState, defaults)} markets={markets} platforms={platforms} idPrefix={`edit-${finding.id}`} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMode("idle")}>
              Cancel
            </Button>
            <Button type="submit" disabled={editing}>
              {editing ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      )}
      {mode === "dismiss" && (
        <form action={dismissAction} className="flex flex-col gap-3">
          <input type="hidden" name="findingId" value={finding.id} />
          <FormError message={dismissState?.error} />
          <Field label="Reason for dismissing" hint="Kept in the finding's history. The client never sees draft findings.">
            <Input name="note" required maxLength={2000} placeholder="e.g. Not applicable to the selected markets." />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMode("idle")}>
              Cancel
            </Button>
            <Button type="submit" variant="secondary" disabled={dismissing}>
              {dismissing ? "Dismissing…" : "Dismiss finding"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

type DecisionTarget = { creativeId: string; roundId: string; versionId: string; versionNumber: number; roundNumber: number };

function TargetLine({ t }: { t: DecisionTarget }) {
  return (
    <p className="text-meta">
      Decision on <strong className="font-medium text-ink">V{t.versionNumber}</strong>, round {t.roundNumber}.
    </p>
  );
}

export function RequestChangesForm({ target, drafts, open, awaiting }: { target: DecisionTarget; drafts: number; open: number; awaiting: number }) {
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(requestChangesAction, undefined);
  const canRequest = drafts + open > 0 && awaiting === 0;
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="creativeId" value={target.creativeId} />
      <input type="hidden" name="roundId" value={target.roundId} />
      <input type="hidden" name="versionId" value={target.versionId} />
      <TargetLine t={target} />
      <p className="text-[13px] text-ink-soft">
        {awaiting > 0
          ? `Resolve or reopen the ${awaiting} finding${awaiting === 1 ? "" : "s"} the client responded to first.`
          : canRequest
            ? `${drafts} draft finding${drafts === 1 ? "" : "s"} will be shared with the client${open ? `, plus ${open} open` : ""}.`
            : "Add or reopen at least one finding before requesting changes."}
      </p>
      <FormError message={state?.error} />
      <Field label="Summary for the client">
        <Textarea
          name="summary"
          required
          maxLength={4000}
          className="min-h-20"
          defaultValue={(state?.values?.summary as string) ?? ""}
          placeholder="What needs to change before the review can be completed."
        />
      </Field>
      <Button type="submit" disabled={!canRequest || pending} className="w-full">
        {pending ? "Requesting…" : "Request changes"}
      </Button>
    </form>
  );
}

export function CompleteReviewForm({
  target,
  drafts,
  availability,
  defaultScope,
}: {
  target: DecisionTarget;
  drafts: number;
  availability: { asIs: OutcomeAvailability; withDrafts: OutcomeAvailability };
  defaultScope: string;
}) {
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(completeReviewAction, undefined);
  const [shareDrafts, setShareDrafts] = useState(false);
  const map = shareDrafts ? availability.withDrafts : availability.asIs;
  const blockedByDrafts = drafts > 0 && !shareDrafts;
  const v = state?.values;

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="creativeId" value={target.creativeId} />
      <input type="hidden" name="roundId" value={target.roundId} />
      <input type="hidden" name="versionId" value={target.versionId} />
      <TargetLine t={target} />

      {drafts > 0 && (
        <div className="rounded-md bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
          <p>
            {drafts} draft finding{drafts === 1 ? " is" : "s are"} unresolved. Dismiss {drafts === 1 ? "it" : "them"}, or share{" "}
            {drafts === 1 ? "it" : "them"} with the client as part of this outcome.
          </p>
          <label className="mt-2 flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              name="publishDrafts"
              value="1"
              checked={shareDrafts}
              onChange={(e) => setShareDrafts(e.target.checked)}
              className="size-3.5 accent-brand-600"
            />
            Share the {drafts} draft finding{drafts === 1 ? "" : "s"} with this outcome
          </label>
        </div>
      )}

      <fieldset className="flex flex-col gap-2" disabled={blockedByDrafts}>
        <legend className="mb-1 text-[13px] font-medium text-ink-soft">Outcome</legend>
        {OUTCOMES.map((o) => {
          const a = map[o];
          return (
            <label key={o} className={optionCard}>
              <input type="radio" name="outcome" value={o} disabled={!a.ok} defaultChecked={v?.outcome === o} className="sr-only" />
              <span className="text-[13px] font-medium text-ink">{REVIEW_OUTCOME_LABEL[o]}</span>
              <span className="text-meta leading-snug">{a.ok ? REVIEW_OUTCOME_DESCRIPTION[o] : a.reason}</span>
            </label>
          );
        })}
      </fieldset>

      <FormError message={state?.error} />
      <Field label="Review summary">
        <Textarea name="summary" required maxLength={4000} className="min-h-20" defaultValue={(v?.summary as string) ?? ""} disabled={blockedByDrafts} />
      </Field>
      <Field label="Scope reviewed (optional)" hint="Which markets, platforms and materials this review covered.">
        <Textarea name="scopeNote" maxLength={2000} className="min-h-14" defaultValue={(v?.scopeNote as string) ?? defaultScope} disabled={blockedByDrafts} />
      </Field>
      <p className={cn("text-meta rounded-md bg-subtle px-3 py-2")}>{REVIEW_DISCLAIMER}</p>
      <Button type="submit" disabled={blockedByDrafts || pending} className="w-full">
        {pending ? "Recording…" : "Complete review"}
      </Button>
    </form>
  );
}

/**
 * TEAM, while reviewing a resubmission: decide on each finding the client
 * responded to. Resolve or reopen with a note; a resolved finding stays
 * closed (if the issue returns, record a new finding). Published findings can
 * also be withdrawn with a reason. The client sees these once you record a
 * decision (request changes or complete the review).
 */
export function PublishedFindingControls({ finding }: { finding: FindingView }) {
  const [mode, setMode] = useState<"idle" | "resolve" | "reopen" | "dismiss">("idle");
  const done = (r: ReviewActionState) => {
    if (r?.ok) setMode("idle");
    return r;
  };
  const [resolveState, resolveAction, resolving] = useActionState<ReviewActionState, FormData>(async (p, fd) => done(await resolveFindingAction(p, fd)), undefined);
  const [reopenState, reopenAction, reopening] = useActionState<ReviewActionState, FormData>(async (p, fd) => done(await reopenFindingAction(p, fd)), undefined);
  const [dismissState, dismissAction, dismissing] = useActionState<ReviewActionState, FormData>(async (p, fd) => done(await dismissFindingAction(p, fd)), undefined);
  const responded = finding.status === "RESPONDED";
  const last = resolveState?.ok ?? reopenState?.ok ?? dismissState?.ok;

  const noteForm = (
    action: (fd: FormData) => void,
    state: ReviewActionState,
    pending: boolean,
    label: string,
    hint: string,
    button: string,
    variant: "primary" | "secondary",
  ) => (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="findingId" value={finding.id} />
      <FormError message={state?.error} />
      <Field label={label} hint={hint}>
        <Textarea name="note" required maxLength={2000} className="min-h-16" defaultValue={(state?.values?.note as string) ?? ""} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setMode("idle")}>
          Cancel
        </Button>
        <Button type="submit" variant={variant} disabled={pending}>
          {pending ? "Saving…" : button}
        </Button>
      </div>
    </form>
  );

  return (
    <div className="mt-3 border-t border-line pt-3">
      {mode === "idle" && (
        <div className="flex flex-wrap items-center gap-2">
          {responded ? (
            <>
              <Button size="sm" onClick={() => setMode("resolve")}>
                Resolve
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setMode("reopen")}>
                Reopen
              </Button>
            </>
          ) : (
            <span className="text-meta">Waiting for the client&apos;s response.</span>
          )}
          <Button size="sm" variant="ghost" onClick={() => setMode("dismiss")}>
            Withdraw finding
          </Button>
          <Ok message={last} />
        </div>
      )}
      {mode === "resolve" &&
        noteForm(resolveAction, resolveState, resolving, "Resolution note", "Why the response or revision resolves this finding.", "Resolve finding", "primary")}
      {mode === "reopen" &&
        noteForm(reopenAction, reopenState, reopening, "What's still needed", "Shown to the client with the next change request.", "Reopen finding", "secondary")}
      {mode === "dismiss" &&
        noteForm(dismissAction, dismissState, dismissing, "Reason for withdrawing", "Kept in the finding's history and shown to the client after your next decision.", "Withdraw finding", "secondary")}
    </div>
  );
}
