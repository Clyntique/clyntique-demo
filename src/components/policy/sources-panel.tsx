"use client";

import { useState, useTransition } from "react";
import type { PolicySource } from "@/lib/policy/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ExternalLinkIcon } from "@/components/ui/icons";
import {
  createPolicySourceServerAction,
  updatePolicySourceServerAction,
  verifyPolicySourceServerAction,
} from "@/lib/policy/actions";
import { AUTHORITY_TYPES, SOURCE_KINDS } from "@/lib/policy/validate";
import { AUTHORITY_LABEL, NOT_STATED, SOURCE_KIND_LABEL, VERIFICATION_LABEL } from "@/lib/policy/labels";

// Official sources behind the rules (P0, Oct 27). A policy admin records a
// source, then someone checks that the URL is the publisher's own, current
// page. A rule can reach the AI only when every source it cites is verified
// (src/lib/ai/applicability.ts). The server re-checks every value and right.

const JURISDICTIONS = [
  { code: "US", name: "United States" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "CA", name: "Canada" },
  { code: "GLOBAL", name: "All markets" },
];

type Draft = {
  name: string;
  authorityName: string;
  authorityType: string;
  jurisdictionCode: string;
  officialUrl: string;
  sourceKind: string;
  publishedAt: string;
  accessNote: string;
};

const EMPTY: Draft = {
  name: "",
  authorityName: "",
  authorityType: "PLATFORM_POLICY",
  jurisdictionCode: "GLOBAL",
  officialUrl: "",
  sourceKind: "PLATFORM_POLICY_PAGE",
  publishedAt: "",
  accessNote: "",
};

function draftOf(s: PolicySource): Draft {
  return {
    name: s.name,
    authorityName: s.authorityName,
    authorityType: s.authorityType,
    jurisdictionCode: s.jurisdictionCode,
    officialUrl: s.officialUrl,
    sourceKind: s.sourceKind ?? "",
    publishedAt: s.publishedAt ? s.publishedAt.slice(0, 10) : "",
    accessNote: s.accessNote ?? "",
  };
}

function formatDay(iso?: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
}

function statusTone(status: PolicySource["verificationStatus"]) {
  if (status === "VERIFIED") return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (status === "REJECTED") return "bg-critical-soft text-critical-ink border-critical-line";
  return "bg-amber-50 text-amber-800 border-amber-300";
}

export function SourcesPanel({
  sources,
  isPolicyAdmin,
  onChanged,
}: {
  sources: PolicySource[];
  isPolicyAdmin: boolean;
  onChanged: (message: string) => void;
}) {
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (key: keyof Draft, value: string) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, [key]: value } } : e));

  const save = () => {
    if (!editing) return;
    setError(null);
    const input = { ...editing.draft, sourceKind: editing.draft.sourceKind || null, publishedAt: editing.draft.publishedAt || null, accessNote: editing.draft.accessNote || null };
    startTransition(async () => {
      const res = editing.id ? await updatePolicySourceServerAction(editing.id, input) : await createPolicySourceServerAction(input);
      if (!res.ok) return setError(res.error ?? "The source could not be saved.");
      const warnings = res.warnings?.length ? ` ${res.warnings.join(" ")}` : "";
      setEditing(null);
      onChanged((editing.id ? "Source updated. It needs verifying again." : "Source added. It needs verifying before rules that cite it can reach the AI.") + warnings);
    });
  };

  const review = (sourceId: string, result: "VERIFIED" | "REQUIRES_REVIEW" | "REJECTED") => {
    setError(null);
    startTransition(async () => {
      const res = await verifyPolicySourceServerAction(sourceId, { result, note });
      if (!res.ok) return setError(res.error ?? "The source review could not be saved.");
      setReviewing(null);
      setNote("");
      onChanged(result === "VERIFIED" ? "Source marked verified." : result === "REJECTED" ? "Source rejected." : "Source marked as needing review.");
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-small text-muted">
          Each rule cites one or more official sources. A source is usable only after a policy admin checks that the link is the
          publisher&apos;s own, current page. Clyntique stores the link and its own summary, never a copy of the page.
        </p>
        {isPolicyAdmin && !editing && (
          <Button size="sm" variant="primary" onClick={() => { setError(null); setEditing({ id: null, draft: EMPTY }); }}>
            Add source
          </Button>
        )}
      </div>

      {error && <p className="rounded-md border border-critical-line bg-critical-soft p-3 text-small text-critical-ink">{error}</p>}

      {editing && (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <h3 className="text-small font-semibold text-ink">{editing.id ? "Edit source" : "New source"}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Source name">
              <Input value={editing.draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Meta Advertising Standards: Health and wellness" />
            </Field>
            <Field label="Publisher">
              <Input value={editing.draft.authorityName} onChange={(e) => set("authorityName", e.target.value)} placeholder="e.g. Meta Platforms" />
            </Field>
            <Field label="Official URL" hint="The publisher's own page (https).">
              <Input value={editing.draft.officialUrl} onChange={(e) => set("officialUrl", e.target.value)} placeholder="https://" />
            </Field>
            <Field label="Kind of source">
              <Select value={editing.draft.sourceKind} onChange={(e) => set("sourceKind", e.target.value)}>
                <option value="">Not set</option>
                {SOURCE_KINDS.map((k) => (
                  <option key={k} value={k}>{SOURCE_KIND_LABEL[k]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Authority type">
              <Select value={editing.draft.authorityType} onChange={(e) => set("authorityType", e.target.value)}>
                {AUTHORITY_TYPES.map((a) => (
                  <option key={a} value={a}>{AUTHORITY_LABEL[a]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Market">
              <Select value={editing.draft.jurisdictionCode} onChange={(e) => set("jurisdictionCode", e.target.value)}>
                {JURISDICTIONS.map((j) => (
                  <option key={j.code} value={j.code}>{j.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Publication date" hint="Only if the source states one. Leave empty otherwise.">
              <Input type="date" value={editing.draft.publishedAt} onChange={(e) => set("publishedAt", e.target.value)} />
            </Field>
            <Field label="Access note" hint="e.g. needs sign-in, regional page, terms of use.">
              <Textarea value={editing.draft.accessNote} onChange={(e) => set("accessNote", e.target.value)} className="min-h-16" />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save source"}</Button>
          </div>
        </div>
      )}

      {sources.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-8 text-center text-small text-muted">No sources recorded yet.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {sources.map((s) => (
            <li key={s.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{s.name}</p>
                  <p className="text-caption text-muted">
                    {s.authorityName} · {AUTHORITY_LABEL[s.authorityType]} · {s.jurisdictionCode}
                    {s.sourceKind ? ` · ${SOURCE_KIND_LABEL[s.sourceKind]}` : ""}
                  </p>
                  <a href={s.officialUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-caption text-brand-700 hover:underline">
                    <span className="truncate">{s.officialUrl}</span> <ExternalLinkIcon className="size-3 shrink-0" />
                  </a>
                </div>
                <span className={`rounded-sm border px-2 py-0.5 text-micro font-semibold ${statusTone(s.verificationStatus)}`}>
                  {VERIFICATION_LABEL[s.verificationStatus]}
                </span>
              </div>
              <dl className="grid gap-x-4 gap-y-1 text-caption sm:grid-cols-3">
                <div><dt className="inline text-muted">Published: </dt><dd className="inline text-ink-soft">{formatDay(s.publishedAt) ?? NOT_STATED}</dd></div>
                <div>
                  <dt className="inline text-muted">Checked: </dt>
                  <dd className="inline text-ink-soft">{s.verifiedAt ? `${formatDay(s.verifiedAt)}${s.verifiedByName ? ` by ${s.verifiedByName}` : ""}` : "Not yet"}</dd>
                </div>
                {s.accessNote && <div className="sm:col-span-3"><dt className="inline text-muted">Access: </dt><dd className="inline text-ink-soft">{s.accessNote}</dd></div>}
                {s.verificationNote && <div className="sm:col-span-3"><dt className="inline text-muted">Review note: </dt><dd className="inline text-ink-soft">{s.verificationNote}</dd></div>}
              </dl>
              {isPolicyAdmin && (
                reviewing === s.id ? (
                  <div className="space-y-2 rounded-md border border-line bg-subtle/40 p-3">
                    <Field label="Note" hint="Required when the source needs review or is rejected.">
                      <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />
                    </Field>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => { setReviewing(null); setNote(""); }} disabled={pending}>Cancel</Button>
                      <Button size="sm" variant="secondary" onClick={() => review(s.id, "REJECTED")} disabled={pending}>Reject</Button>
                      <Button size="sm" variant="secondary" onClick={() => review(s.id, "REQUIRES_REVIEW")} disabled={pending}>Needs review</Button>
                      <Button size="sm" variant="primary" onClick={() => review(s.id, "VERIFIED")} disabled={pending}>I checked it: verified</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { setError(null); setEditing({ id: s.id, draft: draftOf(s) }); }}>Edit</Button>
                    <Button size="sm" variant="secondary" onClick={() => { setError(null); setNote(""); setReviewing(s.id); }}>Review source</Button>
                  </div>
                )
              )}
            </li>
          ))}
        </ul>
      )}
      {!isPolicyAdmin && <Badge tone="outline">Only policy admins can add or verify sources.</Badge>}
    </div>
  );
}
