"use client";

import { useState, useTransition } from "react";
import type { PolicyRule, PolicyRuleVersion, PolicySource } from "@/lib/policy/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { CloseIcon } from "@/components/ui/icons";
import {
  createPolicyRuleServerAction,
  proposeVersionServerAction,
  submitVersionServerAction,
  updateDraftVersionServerAction,
} from "@/lib/policy/actions";
import { AUTHORITY_TYPES, LIMITS, MAX_QUOTATION, POLICY_CATEGORIES, RESTRICTION_LEVELS, RULE_INDUSTRIES } from "@/lib/policy/validate";
import { AUTHORITY_LABEL, CATEGORY_LABEL, RESTRICTION_LABEL, RULE_INDUSTRY_LABEL, VERIFICATION_LABEL } from "@/lib/policy/labels";

// Structured editor for Policy Library rule versions (P0, Oct 27): create a
// rule, propose a new version of one, or edit a draft (new or returned).
// Summaries are the author's own words; a citation carries at most a short
// quotation. Unknown dates stay empty. Every value is re-validated on the
// server (src/lib/policy/validate.ts); these checks only fail fast.

export type EditorMode = "CREATE_RULE" | "PROPOSE_VERSION" | "EDIT_DRAFT";

const MARKETS = [
  { code: "US", name: "United States" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "CA", name: "Canada" },
  { code: "GLOBAL", name: "All markets" },
];
const PLATFORMS = [
  { code: "META", name: "Meta (Facebook, Instagram)" },
  { code: "GOOGLE", name: "Google Ads" },
  { code: "TIKTOK", name: "TikTok" },
];

type Citation = {
  sourceId: string;
  sectionReference: string;
  sectionTitle: string;
  directUrl: string;
  excerpt: string;
  sourceUpdatedAt: string;
  retrievedAt: string;
};

const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : "");
const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function citationsOf(version: PolicyRuleVersion | null | undefined): Citation[] {
  return (version?.sources ?? []).map((s) => ({
    sourceId: s.sourceId,
    sectionReference: s.sectionReference,
    sectionTitle: s.sectionTitle,
    directUrl: s.directUrl,
    excerpt: s.excerpt ?? "",
    sourceUpdatedAt: day(s.sourceUpdatedAt),
    retrievedAt: day(s.retrievedAt),
  }));
}

export function RuleEditorModal({
  mode,
  rule,
  version,
  sources,
  onClose,
  onSuccess,
}: {
  mode: EditorMode;
  /** The rule for PROPOSE_VERSION and EDIT_DRAFT. */
  rule?: PolicyRule | null;
  /** The draft for EDIT_DRAFT. */
  version?: PolicyRuleVersion | null;
  sources: PolicySource[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // What the form starts from: the draft being edited, or the current version for a new one.
  const base = mode === "EDIT_DRAFT" ? version : mode === "PROPOSE_VERSION" ? rule?.currentVersion : null;
  const scopeEditable = mode === "CREATE_RULE" || (mode === "EDIT_DRAFT" && Boolean(rule) && rule!.versions.every((v) => !v.approvedAt));

  const [code, setCode] = useState(rule?.code ?? "");
  const [title, setTitle] = useState(base?.title ?? rule?.title ?? "");
  const [authorityType, setAuthorityType] = useState<string>(rule?.authorityType ?? "PLATFORM_POLICY");
  const [jurisdictionCode, setJurisdictionCode] = useState(rule?.jurisdictionCode ?? "US");
  const [subJurisdiction, setSubJurisdiction] = useState(rule?.subJurisdiction ?? "");
  const [platformCode, setPlatformCode] = useState(rule?.platformCode ?? "META");
  const [industry, setIndustry] = useState(rule?.industry && (RULE_INDUSTRIES as readonly string[]).includes(rule.industry) ? rule.industry : "HEALTHCARE");
  const [category, setCategory] = useState<string>(rule?.category ?? "EFFICACY_CLAIM");
  const [summary, setSummary] = useState(base?.summary ?? "");
  const [restrictionLevel, setRestrictionLevel] = useState(base?.restrictionLevel ?? "");
  const [restrictedClaims, setRestrictedClaims] = useState((base?.restrictedClaims ?? []).join("\n"));
  const [substantiation, setSubstantiation] = useState((base?.substantiationRequirements ?? []).join("\n"));
  const [legalExplanation, setLegalExplanation] = useState(base?.legalExplanation ?? "");
  const [remediationAction, setRemediationAction] = useState(base?.remediationAction ?? "");
  const [conditions, setConditions] = useState((base?.applicabilityConditions ?? []).join("\n"));
  const [exceptions, setExceptions] = useState((base?.exceptions ?? []).join("\n"));
  const [officialEffectiveDate, setOfficialEffectiveDate] = useState(day(base?.officialEffectiveDate));
  // Clyntique's own in-use window; empty "from" = from approval. A new version starts empty.
  const [effectiveFrom, setEffectiveFrom] = useState(mode === "EDIT_DRAFT" ? day(version?.effectiveFrom) : "");
  const [effectiveTo, setEffectiveTo] = useState(mode === "EDIT_DRAFT" ? day(version?.effectiveTo) : "");
  const [changeSummary, setChangeSummary] = useState("");
  const [citations, setCitations] = useState<Citation[]>(() => citationsOf(base));

  const setCitation = (i: number, patch: Partial<Citation>) => setCitations((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const addCitation = () =>
    setCitations((list) => [...list, { sourceId: sources[0]?.id ?? "", sectionReference: "", sectionTitle: "", directUrl: "", excerpt: "", sourceUpdatedAt: "", retrievedAt: "" }]);

  function content() {
    return {
      title,
      summary,
      legalExplanation,
      remediationAction,
      applicabilityConditions: lines(conditions),
      exceptions: lines(exceptions),
      restrictionLevel: restrictionLevel || null,
      restrictedClaims: lines(restrictedClaims),
      substantiationRequirements: lines(substantiation),
      officialEffectiveDate: officialEffectiveDate || null,
      effectiveFrom: effectiveFrom || null,
      effectiveTo: effectiveTo || null,
      sources: citations.map((c) => ({
        sourceId: c.sourceId,
        sectionReference: c.sectionReference,
        sectionTitle: c.sectionTitle,
        directUrl: c.directUrl,
        excerpt: c.excerpt,
        sourceUpdatedAt: c.sourceUpdatedAt || null,
        retrievedAt: c.retrievedAt || null,
      })),
    };
  }

  function save(submit: boolean) {
    setError(null);
    if (submit && citations.length === 0) return setError("Cite at least one official source section before submitting for verification.");
    if (citations.some((c) => c.excerpt.length > MAX_QUOTATION)) return setError(`Keep each quotation to ${MAX_QUOTATION} characters; summarise the rest in your own words.`);
    const scope = { authorityType, jurisdictionCode, subJurisdiction: subJurisdiction || null, platformCode: platformCode || null, industry, category } as const;
    startTransition(async () => {
      if (mode === "CREATE_RULE") {
        const res = await createPolicyRuleServerAction({
          code,
          ...content(),
          ...scope,
          authorityType: authorityType as PolicyRule["authorityType"],
          category: category as PolicyRule["category"],
          status: submit ? "PENDING_APPROVAL" : "DRAFT",
        });
        if (!res.ok) return setError(res.error ?? "The rule couldn't be saved.");
        return onSuccess(submit ? "Rule submitted for verification." : "Draft saved.");
      }
      if (mode === "PROPOSE_VERSION" && rule) {
        const res = await proposeVersionServerAction({ ruleId: rule.id, changeSummary, ...content(), status: submit ? "PENDING_APPROVAL" : "DRAFT" });
        if (!res.ok) return setError(res.error ?? "The version couldn't be saved.");
        return onSuccess(submit ? "New version submitted for verification." : "Draft version saved.");
      }
      if (mode === "EDIT_DRAFT" && version) {
        const res = await updateDraftVersionServerAction({
          versionId: version.id,
          ...content(),
          ...(scopeEditable ? { scope: { ...scope, authorityType: authorityType as PolicyRule["authorityType"], category: category as PolicyRule["category"] } } : {}),
        });
        if (!res.ok) return setError(res.error ?? "The draft couldn't be saved.");
        if (submit) {
          const sent = await submitVersionServerAction(version.id);
          if (!sent.ok) return setError(sent.error ?? "Saved, but it couldn't be submitted.");
        }
        return onSuccess(submit ? "Draft saved and submitted for verification." : "Draft saved.");
      }
    });
  }

  const heading = mode === "CREATE_RULE" ? "New policy rule" : mode === "PROPOSE_VERSION" ? `New version of ${rule?.code}` : `Edit draft v${version?.versionNumber} of ${rule?.code}`;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 backdrop-blur-xs">
      <div role="dialog" aria-label={heading} className="w-full max-w-3xl rounded-xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <h2 className="text-body font-semibold text-ink">{heading}</h2>
            <p className="text-meta">Draft → verified by one policy admin → approved by a different one. Only then can the AI or a reviewer use it.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-ink" aria-label="Close editor">
            <CloseIcon className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-5 px-6 py-5">
          {error && (
            <p role="alert" className="rounded-md border border-critical-line bg-critical-soft px-3 py-2 text-small text-critical-ink">
              {error}
            </p>
          )}
          {mode === "EDIT_DRAFT" && version?.reviewNote && (
            <p className="rounded-md border border-attention-line bg-attention-soft px-3 py-2 text-small text-attention-ink">
              <span className="font-medium">Returned for changes:</span> {version.reviewNote}
            </p>
          )}

          <section className="flex flex-col gap-4">
            <h3 className="text-small font-semibold text-ink">Scope</h3>
            {!scopeEditable && <p className="text-meta">The scope is fixed once a version of this rule has been approved. Create a new rule for a different scope.</p>}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {mode === "CREATE_RULE" && (
                <Field label="Rule code" hint="Upper case and dashes, e.g. META-US-AES-01.">
                  <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={LIMITS.code} />
                </Field>
              )}
              <Field label="Authority">
                <Select value={authorityType} onChange={(e) => setAuthorityType(e.target.value)} disabled={!scopeEditable}>
                  {AUTHORITY_TYPES.map((a) => (
                    <option key={a} value={a}>
                      {AUTHORITY_LABEL[a]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Market">
                <Select value={jurisdictionCode} onChange={(e) => setJurisdictionCode(e.target.value)} disabled={!scopeEditable}>
                  {MARKETS.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Sub-jurisdiction (optional)" hint="e.g. Dubai. Leave empty for the whole market.">
                <Input value={subJurisdiction} onChange={(e) => setSubJurisdiction(e.target.value)} disabled={!scopeEditable} maxLength={80} />
              </Field>
              <Field label="Platform" hint={authorityType === "PLATFORM_POLICY" ? "A platform policy names its platform." : "Empty: applies on every platform."}>
                <Select value={platformCode} onChange={(e) => setPlatformCode(e.target.value)} disabled={!scopeEditable}>
                  <option value="">All platforms</option>
                  {PLATFORMS.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Industry">
                <Select value={industry} onChange={(e) => setIndustry(e.target.value)} disabled={!scopeEditable}>
                  {RULE_INDUSTRIES.map((i) => (
                    <option key={i} value={i}>
                      {RULE_INDUSTRY_LABEL[i]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Category">
                <Select value={category} onChange={(e) => setCategory(e.target.value)} disabled={!scopeEditable}>
                  {POLICY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </section>

          <section className="flex flex-col gap-4 border-t border-line pt-5">
            <h3 className="text-small font-semibold text-ink">Content, in your own words</h3>
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.title} />
            </Field>
            <Field label="Operational summary" hint="What a reviewer must check, summarised independently. Don't copy the source text.">
              <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={LIMITS.summary} className="min-h-24" />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Restriction level">
                <Select value={restrictionLevel} onChange={(e) => setRestrictionLevel(e.target.value)}>
                  <option value="">Not set</option>
                  {RESTRICTION_LEVELS.map((r) => (
                    <option key={r} value={r}>
                      {RESTRICTION_LABEL[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Source's own effective date (optional)" hint="Only if the source states one.">
                <Input type="date" value={officialEffectiveDate} onChange={(e) => setOfficialEffectiveDate(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Restricted or prohibited claims" hint="One per line, e.g. “Guaranteed results”.">
                <Textarea value={restrictedClaims} onChange={(e) => setRestrictedClaims(e.target.value)} className="min-h-20" />
              </Field>
              <Field label="Evidence and substantiation required" hint="One per line.">
                <Textarea value={substantiation} onChange={(e) => setSubstantiation(e.target.value)} className="min-h-20" />
              </Field>
            </div>
            <Field label="Explanation for reviewers">
              <Textarea value={legalExplanation} onChange={(e) => setLegalExplanation(e.target.value)} maxLength={LIMITS.text} className="min-h-20" />
            </Field>
            <Field label="What the advertiser should do">
              <Textarea value={remediationAction} onChange={(e) => setRemediationAction(e.target.value)} maxLength={LIMITS.text} className="min-h-16" />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="When it applies (optional)" hint="One condition per line.">
                <Textarea value={conditions} onChange={(e) => setConditions(e.target.value)} className="min-h-16" />
              </Field>
              <Field label="Exceptions (optional)" hint="One per line.">
                <Textarea value={exceptions} onChange={(e) => setExceptions(e.target.value)} className="min-h-16" />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Clyntique uses it from (optional)" hint="Empty: from approval.">
                <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
              </Field>
              <Field label="Until (optional)">
                <Input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="flex flex-col gap-3 border-t border-line pt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-small font-semibold text-ink">Official sources cited</h3>
              <Button size="sm" variant="secondary" onClick={addCitation} disabled={sources.length === 0 || citations.length >= LIMITS.citations}>
                + Add citation
              </Button>
            </div>
            {sources.length === 0 && <p className="text-meta">Add the official source in the Sources tab first.</p>}
            {citations.map((c, i) => {
              const src = sources.find((s) => s.id === c.sourceId);
              return (
                <div key={i} className="flex flex-col gap-3 rounded-lg border border-line bg-subtle/30 p-3.5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Source" hint={src ? VERIFICATION_LABEL[src.verificationStatus] : undefined}>
                      <Select value={c.sourceId} onChange={(e) => setCitation(i, { sourceId: e.target.value })}>
                        {sources.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} · {s.authorityName}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Section" hint="e.g. “Health and wellness” or “16 CFR § 255.2”.">
                      <Input value={c.sectionReference} onChange={(e) => setCitation(i, { sectionReference: e.target.value })} maxLength={LIMITS.section} />
                    </Field>
                    <Field label="Section title (optional)">
                      <Input value={c.sectionTitle} onChange={(e) => setCitation(i, { sectionTitle: e.target.value })} maxLength={LIMITS.section} />
                    </Field>
                    <Field label="Link to the section" hint="https only, on the publisher's own site.">
                      <Input type="url" value={c.directUrl} onChange={(e) => setCitation(i, { directUrl: e.target.value })} placeholder={src?.officialUrl ?? "https://"} />
                    </Field>
                    <Field label="Page's “last updated” date (optional)" hint="Only if the page shows one.">
                      <Input type="date" value={c.sourceUpdatedAt} onChange={(e) => setCitation(i, { sourceUpdatedAt: e.target.value })} />
                    </Field>
                    <Field label="Date you read it">
                      <Input type="date" value={c.retrievedAt} onChange={(e) => setCitation(i, { retrievedAt: e.target.value })} />
                    </Field>
                  </div>
                  <Field label={`Short quotation (optional, ${c.excerpt.length}/${MAX_QUOTATION})`} hint="A few words that anchor the summary, never the full text.">
                    <Textarea value={c.excerpt} onChange={(e) => setCitation(i, { excerpt: e.target.value })} className="min-h-14" />
                  </Field>
                  <div className="flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setCitations((list) => list.filter((_, j) => j !== i))}>
                      Remove citation
                    </Button>
                  </div>
                </div>
              );
            })}
          </section>

          {mode === "PROPOSE_VERSION" && (
            <Field label="What changed in this version">
              <Textarea value={changeSummary} onChange={(e) => setChangeSummary(e.target.value)} maxLength={LIMITS.note} className="min-h-14" />
            </Field>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => save(false)} disabled={pending}>
            {pending ? "Saving…" : "Save draft"}
          </Button>
          <Button onClick={() => save(true)} disabled={pending}>
            Submit for verification
          </Button>
        </div>
      </div>
    </div>
  );
}
