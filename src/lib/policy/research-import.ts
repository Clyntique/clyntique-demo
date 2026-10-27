import {
  ruleCode,
  validateCitations,
  validateRuleScope,
  validateSource,
  validateVersionContent,
  type ValidCitation,
  type ValidRuleScope,
  type ValidSource,
  type ValidVersionContent,
} from "./validate";

// Plans an import of the policy research pack (docs/p0-policy-evidence/research/)
// without touching a database. Pure, so the same checks run in tests and in
// prisma/policy-research-import.ts. The plan only ever creates new records:
// sources whose official URL is not stored yet, and rules whose code is not
// stored yet. Everything planned is DRAFT / UNVERIFIED; the pack can't ask
// for anything else, and existing rows are never changed.

export type ResearchPack = {
  sources: Array<Record<string, unknown> & { key: string }>;
  rules: Array<{
    code: string;
    scope: Record<string, unknown>;
    version: Record<string, unknown>;
    citations: Array<Record<string, unknown> & { sourceKey: string }>;
  }>;
};

export type ImportContext = {
  jurisdictions: readonly string[];
  platforms: readonly string[];
  /** Official URLs of sources already stored, mapped to their ids. */
  existingSourceUrls: ReadonlyMap<string, string>;
  existingRuleCodes: ReadonlySet<string>;
};

export type PlannedSource = { key: string; data: Omit<ValidSource, "warnings">; existingId: string | null };
export type PlannedRule = {
  code: string;
  scope: ValidRuleScope;
  content: ValidVersionContent;
  /** sourceId is the source key until the script resolves it. */
  citations: Array<ValidCitation & { sourceKey: string }>;
};

export type ImportPlan = {
  sources: PlannedSource[];
  rules: PlannedRule[];
  skippedRules: string[];
  warnings: string[];
  errors: string[];
};

const normalUrl = (url: string) => url.replace(/\/+$/, "").toLowerCase();

export function planResearchImport(pack: ResearchPack, ctx: ImportContext): ImportPlan {
  const plan: ImportPlan = { sources: [], rules: [], skippedRules: [], warnings: [], errors: [] };
  const existing = new Map([...ctx.existingSourceUrls].map(([url, id]) => [normalUrl(url), id]));
  const keys = new Set<string>();

  for (const s of pack.sources ?? []) {
    if (!s.key || keys.has(s.key)) {
      plan.errors.push(`Source key '${s.key}' is missing or repeated.`);
      continue;
    }
    keys.add(s.key);
    const valid = validateSource(
      { name: s.name, authorityName: s.authorityName, authorityType: s.authorityType, jurisdictionCode: s.jurisdictionCode, officialUrl: s.officialUrl, sourceKind: s.sourceKind, publishedAt: s.publishedAt, accessNote: s.accessNote },
      ctx.jurisdictions,
    );
    if (!valid.ok) {
      plan.errors.push(`Source '${s.key}': ${valid.error}`);
      continue;
    }
    const { warnings, ...data } = valid.value;
    plan.warnings.push(...warnings.map((w) => `Source '${s.key}': ${w}`));
    plan.sources.push({ key: s.key, data, existingId: existing.get(normalUrl(data.officialUrl)) ?? null });
  }

  const codes = new Set<string>();
  for (const r of pack.rules ?? []) {
    const code = ruleCode(r.code);
    if (!code.ok) {
      plan.errors.push(`Rule '${r.code}': ${code.error}`);
      continue;
    }
    if (codes.has(code.value)) {
      plan.errors.push(`Rule '${code.value}' appears twice.`);
      continue;
    }
    codes.add(code.value);
    if (ctx.existingRuleCodes.has(code.value)) {
      plan.skippedRules.push(code.value);
      continue;
    }
    const scope = validateRuleScope(r.scope as Parameters<typeof validateRuleScope>[0], ctx);
    if (!scope.ok) {
      plan.errors.push(`Rule '${code.value}': ${scope.error}`);
      continue;
    }
    const content = validateVersionContent(r.version as Parameters<typeof validateVersionContent>[0]);
    if (!content.ok) {
      plan.errors.push(`Rule '${code.value}': ${content.error}`);
      continue;
    }
    const unknown = (r.citations ?? []).filter((c) => !keys.has(c.sourceKey)).map((c) => c.sourceKey);
    if (unknown.length) {
      plan.errors.push(`Rule '${code.value}': cites unknown source ${unknown.join(", ")}.`);
      continue;
    }
    const cited = validateCitations((r.citations ?? []).map((c) => ({ ...c, sourceId: c.sourceKey })), { required: true });
    if (!cited.ok) {
      plan.errors.push(`Rule '${code.value}': ${cited.error}`);
      continue;
    }
    plan.warnings.push(...cited.value.warnings.map((w) => `Rule '${code.value}': ${w}`));
    plan.rules.push({ code: code.value, scope: scope.value, content: content.value, citations: cited.value.citations.map((c) => ({ ...c, sourceKey: c.sourceId })) });
  }
  return plan;
}
