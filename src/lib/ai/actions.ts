"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { recordFinding } from "@/lib/workflow/commands";
import { analyzeCreativeCompliance, applicableRuleForAcceptance, citationFor } from "./service";
import type { AIAnalysisResult, AISuggestedFinding } from "./types";
import type { FindingSeverity } from "@/generated/prisma/enums";

export interface RunScanResponse {
  ok: boolean;
  result?: AIAnalysisResult;
  error?: string;
}

export async function runAICreativeScan(
  creativeId: string,
  versionId?: string,
  forceRefresh?: boolean
): Promise<RunScanResponse> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, error: "Authentication required." };
    }
    if (user.role !== "TEAM") {
      return { ok: false, error: "Access denied: AI review tools are restricted to TEAM reviewers." };
    }

    const result = await analyzeCreativeCompliance(user, {
      creativeId: String(creativeId ?? ""),
      versionId: versionId ? String(versionId) : undefined,
      forceRefresh: Boolean(forceRefresh),
    });

    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to run AI creative scan.",
    };
  }
}

function mapSeverity(severity: unknown): FindingSeverity {
  if (severity === "CRITICAL" || severity === "MAJOR") return "HIGH";
  if (severity === "MINOR") return "LOW";
  return "MEDIUM";
}

/**
 * A TEAM reviewer accepts one AI suggestion as a DRAFT finding (team-only until
 * they request changes or complete the review). The cited rule is re-checked
 * on the server and linked by its exact approved version; the citation the
 * browser sends back is ignored.
 */
export async function acceptAIFindingAction(params: {
  creativeId: string;
  finding: AISuggestedFinding;
  /** The scan the suggestion came from (checked on the server). */
  scanId?: string;
  marketCodes?: string[];
  platformCodes?: string[];
}): Promise<{ ok: boolean; findingId?: string; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { ok: false, error: "Authentication required." };
    }
    if (user.role !== "TEAM") {
      return { ok: false, error: "Access denied: Only TEAM reviewers can accept findings." };
    }

    const { finding, creativeId, scanId, marketCodes = [], platformCodes = [] } = params;
    const rule = await applicableRuleForAcceptance(user, String(creativeId ?? ""), String(finding?.policyCitation?.ruleCode ?? ""));
    if (!rule) {
      return {
        ok: false,
        error: "The cited policy is not an active, verified policy for this submission, so this suggestion can't be accepted. Record a finding manually if needed.",
      };
    }
    const citation = citationFor(rule);
    const section = citation.sectionReference ? ` (${citation.sectionReference})` : "";
    const explanation = `${String(finding.explanation ?? "").trim()}\n\nPolicy cited: ${citation.ruleCode} v${citation.ruleVersionNumber} — ${citation.ruleTitle}${section}. Suggested by AI and accepted by a TEAM reviewer.`;

    const res = await recordFinding(user, {
      creativeId,
      issue: String(finding.issue ?? ""),
      explanation,
      severity: mapSeverity(finding.severity),
      requiredAction: String(finding.requiredAction ?? ""),
      actionDetails: String(finding.actionDetails ?? ""),
      marketCodes,
      platformCodes,
      ruleVersionId: rule.currentVersion.id,
      aiSuggestion: { scanRunId: scanId ? String(scanId) : null },
    });

    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    revalidatePath("/admin", "layout");
    revalidatePath("/dashboard", "layout");

    return { ok: true, findingId: res.findingId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to accept AI finding.",
    };
  }
}
