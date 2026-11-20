import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toPublicPolicyRules } from "@/lib/policy/public-rules";
import type { PolicyRule, PolicyRuleVersion } from "@/lib/policy/types";

function version(over: Partial<PolicyRuleVersion>): PolicyRuleVersion {
  return {
    id: "ver-1",
    ruleId: "rule-1",
    versionNumber: 1,
    title: "Title",
    summary: "Summary",
    legalExplanation: "Explanation",
    remediationAction: "Action",
    applicabilityConditions: [],
    effectiveFrom: "2026-10-01T00:00:00.000Z",
    status: "DRAFT",
    verificationStatus: "UNVERIFIED",
    sources: [],
    changeSummary: "Initial",
    createdById: "user-secret-1",
    createdByName: "Staff Author",
    createdAt: "2026-10-01T00:00:00.000Z",
    approvedById: "user-secret-2",
    approvedByName: "Staff Approver",
    verifiedById: "user-secret-3",
    verifiedByName: "Staff Verifier",
    verificationNote: "INTERNAL verification note",
    reviewNote: "INTERNAL review note",
    ...over,
  };
}

function rule(code: string, versions: PolicyRuleVersion[]): PolicyRule {
  return {
    id: `id-${code}`,
    code,
    title: code,
    authorityType: "PLATFORM_POLICY",
    jurisdictionCode: "US",
    industry: "HEALTHCARE",
    category: "OTHER" as PolicyRule["category"],
    currentVersionNumber: versions[0].versionNumber,
    currentVersion: versions[0],
    versions,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

const active = (over: Partial<PolicyRuleVersion> = {}) =>
  version({ status: "ACTIVE", verificationStatus: "VERIFIED", approvedAt: "2026-10-05T00:00:00.000Z", ...over });

describe("public policy dashboard data", () => {
  it("sends nothing for rules that are not active and verified", () => {
    const rules = [
      rule("DRAFT-1", [version({})]),
      rule("PENDING-1", [version({ status: "PENDING_APPROVAL", verificationStatus: "VERIFIED" })]),
      rule("ACTIVE-UNVERIFIED", [version({ status: "ACTIVE" })]),
      rule("DEPRECATED-1", [version({ status: "DEPRECATED", verificationStatus: "VERIFIED" })]),
    ];
    expect(toPublicPolicyRules(rules)).toEqual([]);
  });

  it("keeps published rules but removes staff identities and internal notes", () => {
    const out = toPublicPolicyRules([rule("LIVE-1", [active()])]);
    expect(out).toHaveLength(1);
    const text = JSON.stringify(out);
    for (const secret of ["Staff Author", "Staff Approver", "Staff Verifier", "INTERNAL", "user-secret"]) {
      expect(text).not.toContain(secret);
    }
    expect(out[0].currentVersion.summary).toBe("Summary");
  });

  it("drops draft, pending and never-approved versions from a published rule's history", () => {
    const versions = [
      active({ id: "v2", versionNumber: 2 }),
      version({ id: "v3", versionNumber: 3, summary: "UNPUBLISHED draft wording" }),
      version({ id: "v1", versionNumber: 1, status: "DEPRECATED", verificationStatus: "VERIFIED", approvedAt: "2026-10-02T00:00:00.000Z" }),
      version({ id: "v0", versionNumber: 0, status: "DEPRECATED", summary: "UNPUBLISHED superseded draft" }),
      version({ id: "v4", versionNumber: 4, status: "PENDING_APPROVAL", verificationStatus: "VERIFIED" }),
    ];
    const out = toPublicPolicyRules([rule("LIVE-2", versions)]);
    expect(out[0].versions.map((v) => v.id)).toEqual(["v2", "v1"]);
    expect(JSON.stringify(out)).not.toContain("UNPUBLISHED");
  });

  it("is applied on the server by the public page, and not by the team page", () => {
    const publicPage = readFileSync("src/app/policy-dashboard/page.tsx", "utf8");
    expect(publicPage).toContain("toPublicPolicyRules(await getDbPolicyRules())");
    expect(publicPage).not.toMatch(/dbRules = await getDbPolicyRules\(\)/);
  });
});
