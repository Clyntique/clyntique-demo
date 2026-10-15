"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/dal";
import { recordFinding } from "@/lib/workflow/commands";
import { analyzeCreativeCompliance } from "./service";
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
      creativeId,
      versionId,
      forceRefresh,
    });

    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to run AI creative compliance scan.",
    };
  }
}

export async function acceptAIFindingAction(params: {
  creativeId: string;
  finding: AISuggestedFinding;
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

    const { finding, creativeId, marketCodes = [], platformCodes = [] } = params;

    // Map AI severity to Prisma FindingSeverity
    let mappedSeverity: FindingSeverity = "MEDIUM";
    if (finding.severity === "CRITICAL" || finding.severity === "MAJOR") {
      mappedSeverity = "HIGH";
    } else if (finding.severity === "MODERATE") {
      mappedSeverity = "MEDIUM";
    } else if (finding.severity === "MINOR") {
      mappedSeverity = "LOW";
    }

    const formattedExplanation = `${finding.explanation}\n\n[Grounded Policy Citation: ${finding.policyCitation.ruleCode} — ${finding.policyCitation.ruleTitle} (${finding.policyCitation.sectionReference})]`;

    const res = await recordFinding(user, {
      creativeId,
      issue: finding.issue,
      explanation: formattedExplanation,
      severity: mappedSeverity,
      requiredAction: finding.requiredAction,
      actionDetails: finding.actionDetails,
      marketCodes,
      platformCodes,
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
