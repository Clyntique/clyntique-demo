"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import {
  checkDbPolicySource,
  getDbChangeProposal,
  getDbMonitoringOverview,
  reviewDbChangeProposal,
  runDueSourceChecks,
  setDbSourceDiscontinued,
  setDbSourceMonitoring,
  type ChangeProposalView,
  type CheckResult,
  type MonitoringOverview,
  type ProposalDecision,
} from "./service";

/*
 * Server actions for the monitoring page. Reads need a TEAM session; every
 * write needs a policy admin (checked again inside the service). Checks use
 * the live HTTP fetcher against the source's registered official URL.
 */

const PAGE = "/admin/policy-library/monitoring";

function fail(err: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

export async function fetchMonitoringOverview(): Promise<MonitoringOverview> {
  const user = await requireRole("TEAM");
  return getDbMonitoringOverview(user);
}

export async function fetchChangeProposalAction(proposalId: string): Promise<{ ok: boolean; proposal?: ChangeProposalView; error?: string }> {
  await requireRole("TEAM");
  try {
    const proposal = await getDbChangeProposal(String(proposalId ?? ""));
    if (!proposal) return { ok: false, error: "Change proposal not found." };
    return { ok: true, proposal };
  } catch (err) {
    return fail(err, "Failed to load the change.");
  }
}

export async function checkSourceNowAction(sourceId: string): Promise<{ ok: boolean; result?: CheckResult; error?: string }> {
  const user = await requireRole("TEAM");
  try {
    const result = await checkDbPolicySource(String(sourceId ?? ""), user);
    revalidatePath(PAGE);
    return { ok: true, result };
  } catch (err) {
    return fail(err, "Failed to check the source.");
  }
}

export async function runDueChecksAction(): Promise<{ ok: boolean; results?: CheckResult[]; error?: string }> {
  const user = await requireRole("TEAM");
  try {
    const results = await runDueSourceChecks(user);
    revalidatePath(PAGE);
    return { ok: true, results };
  } catch (err) {
    return fail(err, "Failed to run the due checks.");
  }
}

export async function setSourceMonitoringAction(sourceId: string, input: { enabled: boolean; intervalHours?: number }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("TEAM");
  try {
    await setDbSourceMonitoring(String(sourceId ?? ""), { enabled: Boolean(input?.enabled), intervalHours: input?.intervalHours }, user);
    revalidatePath(PAGE);
    return { ok: true };
  } catch (err) {
    return fail(err, "Failed to update monitoring.");
  }
}

export async function setSourceDiscontinuedAction(sourceId: string, input: { discontinued: boolean; note?: string }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("TEAM");
  try {
    await setDbSourceDiscontinued(String(sourceId ?? ""), { discontinued: Boolean(input?.discontinued), note: input?.note }, user);
    revalidatePath(PAGE);
    return { ok: true };
  } catch (err) {
    return fail(err, "Failed to update the source.");
  }
}

export async function reviewChangeProposalAction(proposalId: string, input: { decision: ProposalDecision; note?: string; resultingVersionId?: string | null }): Promise<{ ok: boolean; error?: string }> {
  const user = await requireRole("TEAM");
  try {
    await reviewDbChangeProposal(String(proposalId ?? ""), { decision: input?.decision, note: input?.note, resultingVersionId: input?.resultingVersionId ?? null }, user);
    revalidatePath(PAGE);
    revalidatePath("/admin/policy-library");
    return { ok: true };
  } catch (err) {
    return fail(err, "Failed to record the review.");
  }
}
