import { describe, expect, it } from "vitest";
import { EXTERNAL_STATUS_LABEL, latestOutcome, overallExternalStatus, statusByDestination, submissionStatus } from "@/lib/workflow/external";

// External submission status (Oct 19 sprint): pure derivation from the
// append-only ExternalSubmission / ExternalOutcome records.

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const outcome = (kind: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED", basis: "CLIENT_REPORTED" | "TEAM_VERIFIED", on: string, at = on) => ({ kind, basis, outcomeOn: d(on), createdAt: d(at) });
const sub = (destinationType: "AD_PLATFORM" | "REGULATOR", outcomes: ReturnType<typeof outcome>[] = []) => ({ destinationType, outcomes });

describe("external status", () => {
  it("uses the exact labels from the brief and never a bare 'Approved'", () => {
    expect(EXTERNAL_STATUS_LABEL.NOT_SUBMITTED).toBe("Not submitted");
    expect(EXTERNAL_STATUS_LABEL.CHANGES_REQUESTED).toBe("Changes requested externally");
    expect(EXTERNAL_STATUS_LABEL.REJECTED).toBe("Rejected externally");
    expect(EXTERNAL_STATUS_LABEL.APPROVED_REPORTED).toBe("Approved by external authority/platform (reported, not independently verified)");
    for (const label of Object.values(EXTERNAL_STATUS_LABEL)) expect(label).not.toMatch(/^Approved$/);
  });

  it("a submission with no outcome is awaiting an outcome", () => {
    expect(submissionStatus(sub("AD_PLATFORM"))).toBe("AWAITING_OUTCOME");
  });

  it("the latest outcome by date wins; ties go to the one recorded last", () => {
    const outcomes = [outcome("APPROVED", "CLIENT_REPORTED", "2026-10-01"), outcome("REJECTED", "TEAM_VERIFIED", "2026-10-05"), outcome("CHANGES_REQUESTED", "CLIENT_REPORTED", "2026-10-03")];
    expect(latestOutcome(outcomes)?.kind).toBe("REJECTED");
    expect(submissionStatus(sub("REGULATOR", outcomes))).toBe("REJECTED");
    const tie = [outcome("REJECTED", "CLIENT_REPORTED", "2026-10-05", "2026-10-05"), outcome("APPROVED", "TEAM_VERIFIED", "2026-10-05", "2026-10-06")];
    expect(submissionStatus(sub("REGULATOR", tie))).toBe("APPROVED_VERIFIED");
  });

  it("distinguishes a client-reported approval from one the team checked", () => {
    expect(submissionStatus(sub("AD_PLATFORM", [outcome("APPROVED", "CLIENT_REPORTED", "2026-10-01")]))).toBe("APPROVED_REPORTED");
    expect(submissionStatus(sub("AD_PLATFORM", [outcome("APPROVED", "TEAM_VERIFIED", "2026-10-01")]))).toBe("APPROVED_VERIFIED");
  });

  it("overall: the most demanding state wins, and nothing recorded means not submitted", () => {
    expect(overallExternalStatus([])).toBe("NOT_SUBMITTED");
    const approved = sub("AD_PLATFORM", [outcome("APPROVED", "TEAM_VERIFIED", "2026-10-01")]);
    const rejected = sub("REGULATOR", [outcome("REJECTED", "CLIENT_REPORTED", "2026-10-02")]);
    const pending = sub("AD_PLATFORM");
    expect(overallExternalStatus([approved, rejected])).toBe("REJECTED");
    expect(overallExternalStatus([approved, pending])).toBe("AWAITING_OUTCOME");
    expect(overallExternalStatus([approved])).toBe("APPROVED_VERIFIED");
  });

  it("keeps platform and regulator outcomes apart", () => {
    const approvedOnMeta = sub("AD_PLATFORM", [outcome("APPROVED", "CLIENT_REPORTED", "2026-10-01")]);
    const regulatorPending = sub("REGULATOR");
    expect(statusByDestination([approvedOnMeta, regulatorPending])).toEqual({ AD_PLATFORM: "APPROVED_REPORTED", REGULATOR: "AWAITING_OUTCOME" });
    expect(statusByDestination([approvedOnMeta])).toEqual({ AD_PLATFORM: "APPROVED_REPORTED", REGULATOR: "NOT_SUBMITTED" });
  });
});
