import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_EVIDENCE_RECORDS, DEMO_POLICIES, EVIDENCE_RECORD_STATUS_LABEL } from "@/lib/demo/data";
import { demoHref, parseDemoView } from "@/lib/demo/links";
import { buildPassport, PASSPORT_DISCLAIMER, PASSPORT_FORBIDDEN_CLAIMS, PASSPORT_STATUS_LABEL } from "@/lib/demo/passport";
import {
  attachableRecords,
  canViewRecord,
  demoReducer,
  evidenceFor,
  evidenceRecordsFor,
  filterEvidenceRecords,
  initialDemoState,
  isDemoState,
  recordUsage,
  scanFor,
  type DemoState,
} from "@/lib/demo/store";

const AT = "2026-11-02T12:00:00.000Z";

function run(state: DemoState, ...actions: Parameters<typeof demoReducer>[1][]): DemoState {
  return actions.reduce((s, a) => demoReducer(s, a), state);
}

describe("evidence dictionary: fictional, isolated records", () => {
  it("names no real URL, account or Production identifier", () => {
    const text = JSON.stringify(DEMO_EVIDENCE_RECORDS);
    expect(text).not.toMatch(/https?:\/\//i);
    expect(text).not.toMatch(/clyntique\.demo|cyntique_demo|vercel|render\.com|blob/i);
    for (const r of DEMO_EVIDENCE_RECORDS) expect(r.source).toMatch(/fictional|simulated|no official document/i);
  });

  it("each client sees only its own records; the team sees every record", () => {
    const state = initialDemoState();
    const c1 = evidenceRecordsFor(state, "client1");
    const c2 = evidenceRecordsFor(state, "client2");
    const team = evidenceRecordsFor(state, "team");
    expect(c1.length).toBeGreaterThan(0);
    expect(c2.length).toBeGreaterThan(0);
    expect(c1.every((r) => r.ownerId === "client1")).toBe(true);
    expect(c2.every((r) => r.ownerId === "client2")).toBe(true);
    expect(team.length).toBe(state.records.length);
    const other = c2[0];
    expect(canViewRecord("client1", other)).toBe(false);
    expect(canViewRecord("team", other)).toBe(true);
    // A client cannot see where another client's record is used either.
    expect(recordUsage(state, "client1", "rec-c2-physical")).toEqual([]);
    expect(recordUsage(state, "client2", "rec-c2-physical").length).toBe(1);
  });

  it("search and filters narrow the list by text, type and status", () => {
    const all = evidenceRecordsFor(initialDemoState(), "team");
    expect(filterEvidenceRecords(all, { query: "licence" }).every((r) => r.type === "CERTIFICATION")).toBe(true);
    expect(filterEvidenceRecords(all, { query: "LICENCE" }).length).toBe(filterEvidenceRecords(all, { query: "licence" }).length);
    expect(filterEvidenceRecords(all, { type: "REGULATORY_DOCUMENT" }).map((r) => r.id)).toEqual(["rec-team-substantiation"]);
    expect(filterEvidenceRecords(all, { status: "VERIFIED" }).every((r) => r.status === "VERIFIED")).toBe(true);
    expect(filterEvidenceRecords(all, { query: "60 seconds" }).map((r) => r.id)).toEqual(["rec-c1-booking"]);
    expect(filterEvidenceRecords(all, { query: "nothing matches this" })).toEqual([]);
    expect(filterEvidenceRecords(all, {}).length).toBe(all.length);
  });

  it("a record's usage lists the creatives it is attached to", () => {
    const state = initialDemoState();
    const uses = recordUsage(state, "client1", "rec-c1-vaccine");
    expect(uses.map((u) => u.submission.id)).toEqual(["sub-c1-flu"]);
    expect(uses[0].evidence.versionNumber).toBe(2);
  });
});

describe("evidence dictionary: attaching and checking records", () => {
  it("attaches a record to the current version once, refusing other clients' records and closed reviews", () => {
    let s = initialDemoState();
    const id = "sub-c1-telehealth";
    expect(attachableRecords(s, "client1", id).map((r) => r.id)).toContain("rec-c1-booking");
    expect(attachableRecords(s, "client1", id).some((r) => r.ownerId !== "client1")).toBe(false);

    s = run(s, { type: "ATTACH_EVIDENCE_RECORD", submissionId: id, recordId: "rec-c1-booking", attachedBy: "client", at: AT });
    const attached = evidenceFor(s, "client1", id).at(-1)!;
    expect(attached.recordId).toBe("rec-c1-booking");
    expect(attached.versionNumber).toBe(1);
    expect(attached.reviewed).toBe(false);
    expect(s.events.at(-1)?.title).toMatch(/attached from the dictionary/i);
    // Twice on the same version does nothing.
    expect(run(s, { type: "ATTACH_EVIDENCE_RECORD", submissionId: id, recordId: "rec-c1-booking", attachedBy: "client", at: AT })).toBe(s);
    // Client 2's record cannot be attached to Client 1's creative, by the client or the team.
    expect(run(s, { type: "ATTACH_EVIDENCE_RECORD", submissionId: id, recordId: "rec-c2-physical", attachedBy: "client", at: AT })).toBe(s);
    expect(run(s, { type: "ATTACH_EVIDENCE_RECORD", submissionId: id, recordId: "rec-c2-physical", attachedBy: "team", at: AT })).toBe(s);
    // A completed review takes no new evidence.
    expect(run(s, { type: "ATTACH_EVIDENCE_RECORD", submissionId: "sub-c1-flu", recordId: "rec-c1-licence", attachedBy: "client", at: AT })).toBe(s);
    expect(attachableRecords(s, "client1", "sub-c1-flu")).toEqual([]);
  });

  it("a reviewer check updates the record, its attachments and each creative's history", () => {
    let s = run(initialDemoState(), { type: "ATTACH_EVIDENCE_RECORD", submissionId: "sub-c1-telehealth", recordId: "rec-c1-booking", attachedBy: "client", at: AT });
    s = run(s, { type: "REVIEW_EVIDENCE_RECORD", recordId: "rec-c1-booking", verdict: "VERIFIED", note: "Median 48 s in the export.", at: AT });
    const record = s.records.find((r) => r.id === "rec-c1-booking")!;
    expect(record.status).toBe("VERIFIED");
    expect(record.reviewNote).toBe("Median 48 s in the export.");
    expect(s.evidence.find((e) => e.recordId === "rec-c1-booking")!.reviewed).toBe(true);
    expect(s.events.at(-1)).toMatchObject({ submissionId: "sub-c1-telehealth", actor: "team", title: "Evidence checked by reviewer" });
    // Same verdict again is a no-op; a different verdict applies.
    expect(run(s, { type: "REVIEW_EVIDENCE_RECORD", recordId: "rec-c1-booking", verdict: "VERIFIED", note: "", at: AT })).toBe(s);
    const back = run(s, { type: "REVIEW_EVIDENCE_RECORD", recordId: "rec-c1-booking", verdict: "NEEDS_MORE_INFO", note: "", at: AT });
    expect(back.records.find((r) => r.id === "rec-c1-booking")!.status).toBe("NEEDS_MORE_INFO");
    expect(back.evidence.find((e) => e.recordId === "rec-c1-booking")!.reviewed).toBe(false);
  });

  it("a new record starts unverified for a client and a manual upload is filed as a record", () => {
    let s = run(initialDemoState(), { type: "ADD_EVIDENCE_RECORD", ownerId: "client2", title: "Wait-time report", recordType: "CLAIM_SUBSTANTIATION", description: "", source: "", supportedClaim: "Same-week appointments", at: AT });
    const added = s.records.at(-1)!;
    expect(added).toMatchObject({ ownerId: "client2", status: "UNVERIFIED", title: "Wait-time report", supportedClaim: "Same-week appointments" });
    expect(evidenceRecordsFor(s, "client1").some((r) => r.id === added.id)).toBe(false);
    expect(run(s, { type: "ADD_EVIDENCE_RECORD", ownerId: "client2", title: "   ", recordType: "OTHER", description: "", source: "", supportedClaim: "", at: AT })).toBe(s);

    s = run(s, { type: "ADD_EVIDENCE", submissionId: "sub-c2-allergy", name: "Consent-form.pdf", kind: "Certification", description: "Signed consent.", uploadedBy: "client", at: AT });
    const upload = s.evidence.at(-1)!;
    const filed = s.records.find((r) => r.id === upload.recordId)!;
    expect(filed).toMatchObject({ ownerId: "client2", type: "CERTIFICATION", status: "UNVERIFIED", title: "Consent-form.pdf" });
    expect(recordUsage(s, "client2", filed.id).map((u) => u.submission.id)).toEqual(["sub-c2-allergy"]);
    expect(isDemoState(s)).toBe(true);
    // A session copy from before the dictionary existed is discarded.
    expect(isDemoState({ ...initialDemoState(), version: 1 })).toBe(false);
  });
});

describe("compliance passport: content matches the selected creative and version", () => {
  it("describes the chosen version, its findings and its evidence; older versions are superseded", () => {
    const s = initialDemoState();
    const v2 = buildPassport(s, "client1", "sub-c1-flu", undefined)!;
    expect(v2.creative.versionNumber).toBe(2);
    expect(v2.creative.headline).toBe("Flu season is here. We are ready.");
    expect(v2.status).toBe("ACTIVE");
    expect(v2.statusLabel).toBe(PASSPORT_STATUS_LABEL.ACTIVE);
    expect(v2.recordCode).toBe("C1-FLU-V2");
    expect(v2.client.organization).toBe("Northside Family Practice");
    expect(v2.client.contactName).toBeNull();
    expect(v2.target).toEqual({ platform: "Meta", market: "United States" });
    expect(v2.review.outcome).toBe("ISSUES_RESOLVED");
    // Findings were raised on version 1, evidence was attached to version 2.
    expect(v2.findings).toEqual([]);
    expect(v2.evidence.map((e) => e.evidence.id).sort()).toEqual(["ev-c1-flu-1", "ev-c1-flu-2"]);
    expect(v2.evidence.find((e) => e.evidence.id === "ev-c1-flu-1")!.verification).toBe("VERIFIED");
    expect(v2.evidence.find((e) => e.evidence.id === "ev-c1-flu-1")!.record?.id).toBe("rec-c1-vaccine");
    expect(v2.missingEvidence).toEqual([]);

    const v1 = buildPassport(s, "client1", "sub-c1-flu", 1)!;
    expect(v1.status).toBe("SUPERSEDED");
    expect(v1.creative.headline).toBe("Stop the flu before it stops you");
    expect(v1.findings.map((f) => f.finding.id).sort()).toEqual(["fd-c1-flu-1", "fd-c1-flu-2"]);
    expect(v1.findings.find((f) => f.finding.id === "fd-c1-flu-1")!.origin).toBe("AI_SUGGESTED_REVIEWER_ACCEPTED");
    expect(v1.findings.find((f) => f.finding.id === "fd-c1-flu-2")!.origin).toBe("REVIEWER_RECORDED");
    expect(v1.evidence).toEqual([]);
    expect(v1.policies.filter((p) => p.cited).map((p) => p.policy.code).sort()).toEqual(["SAMPLE-FTC-HC-01", "SAMPLE-META-PA-01"]);
    expect(v1.history.length).toBeGreaterThan(0);
    expect(v1.history.some((h) => h.kind === "DECISION")).toBe(true);
    expect(v1.updatedAt >= v1.creative.submittedAt).toBe(true);

    // The team sees the client contact; a client never does.
    expect(buildPassport(s, "team", "sub-c1-flu", 2)!.client.contactName).toBe("Alex Morgan");
    expect(buildPassport(s, "team", "sub-c1-flu", 2)!.review.reviewerLabel).toBe("Sam Rivera");
    expect(v2.review.reviewerLabel).toBe("Clyntique Reviewer");
  });

  it("is in progress until the review completes, hides drafts from clients, and reports missing evidence", () => {
    const id = "sub-c1-telehealth";
    let s = run(initialDemoState(), { type: "START_REVIEW", submissionId: id, at: AT }, { type: "RUN_SIMULATED_SCAN", submissionId: id, versionNumber: 1, at: AT });
    const scan = scanFor(s, id, 1)!;
    const evidenceAsk = scan.suggestions.find((x) => x.requiredAction === "PROVIDE_EVIDENCE")!;
    s = run(s, { type: "ACCEPT_SUGGESTION", submissionId: id, versionNumber: 1, suggestionId: evidenceAsk.id, at: AT });

    const team = buildPassport(s, "team", id, 1)!;
    expect(team.status).toBe("IN_PROGRESS");
    expect(team.review.draftFindings).toBe(1);
    expect(team.aiChecks.length).toBe(1);
    expect(team.policies.length).toBe(DEMO_POLICIES.length);
    expect(team.policies.filter((p) => p.cited).map((p) => p.policy.code)).toEqual([evidenceAsk.policyCode]);
    expect(team.coverage.verifiedPolicies).toBe(0);
    expect(team.coverage.limitations.join(" ")).toMatch(/sample policies/i);

    // The client does not see the draft, so nothing is "missing" for them yet.
    const client = buildPassport(s, "client1", id, 1)!;
    expect(client.findings).toEqual([]);
    expect(client.missingEvidence).toEqual([]);
    expect(client.aiChecks.length).toBe(1);

    s = run(s, { type: "REQUEST_CHANGES", submissionId: id, note: "", at: AT });
    const published = buildPassport(s, "client1", id, 1)!;
    expect(published.findings.length).toBe(1);
    expect(published.findings[0].origin).toBe("AI_SUGGESTED_REVIEWER_ACCEPTED");
    expect(published.missingEvidence.map((f) => f.claimText)).toEqual(["Book online in 60 seconds."]);

    s = run(s, { type: "ATTACH_EVIDENCE_RECORD", submissionId: id, recordId: "rec-c1-booking", attachedBy: "client", at: AT });
    const withEvidence = buildPassport(s, "client1", id, 1)!;
    expect(withEvidence.missingEvidence).toEqual([]);
    expect(withEvidence.evidence[0].verification).toBe("UNVERIFIED");
    expect(withEvidence.evidence[0].verificationLabel).toBe(EVIDENCE_RECORD_STATUS_LABEL.UNVERIFIED);

    s = run(s, { type: "REVIEW_EVIDENCE_RECORD", recordId: "rec-c1-booking", verdict: "VERIFIED", note: "", at: AT }, { type: "RESOLVE_FINDING", findingId: s.findings.at(-1)!.id, at: AT }, { type: "COMPLETE_REVIEW", submissionId: id, outcome: "ISSUES_RESOLVED", note: "", at: AT });
    const done = buildPassport(s, "client1", id, 1)!;
    expect(done.status).toBe("ACTIVE");
    expect(done.evidence[0].verification).toBe("VERIFIED");
    expect(done.review.resolvedFindings).toBe(1);
    expect(done.history[0].kind).toBe("DECISION");
  });

  it("never exists for another client's creative", () => {
    const s = initialDemoState();
    expect(buildPassport(s, "client1", "sub-c2-checkups", undefined)).toBeNull();
    expect(buildPassport(s, "client2", "sub-c2-checkups", undefined)).not.toBeNull();
    expect(buildPassport(s, "team", "sub-c2-checkups", undefined)).not.toBeNull();
    expect(buildPassport(s, "team", "does-not-exist", undefined)).toBeNull();
  });

  it("never calls a creative compliant, certified or approved by a platform or government", () => {
    const s = initialDemoState();
    const texts = [
      JSON.stringify(buildPassport(s, "team", "sub-c1-flu", 2)),
      JSON.stringify(buildPassport(s, "client2", "sub-c2-checkups", 1)),
      JSON.stringify(PASSPORT_STATUS_LABEL),
      readFileSync("src/components/demo/compliance-passport.tsx", "utf8"),
      readFileSync("src/lib/demo/passport.ts", "utf8").replace(/PASSPORT_FORBIDDEN_CLAIMS = \[[^\]]*\]/, ""),
    ].join("\n");
    for (const phrase of PASSPORT_FORBIDDEN_CLAIMS) expect(texts.toLowerCase()).not.toContain(phrase);
    expect(PASSPORT_DISCLAIMER).toMatch(/not legal advice/i);
    expect(PASSPORT_DISCLAIMER).toMatch(/not government approval/i);
    expect(PASSPORT_DISCLAIMER).toMatch(/not a certification/i);
    expect(PASSPORT_DISCLAIMER).toMatch(/not acceptance by any advertising platform/i);
  });
});

describe("demo links and isolation of the new screens", () => {
  it("routes the passport and evidence views for every role", () => {
    expect(parseDemoView("passport", "client1")).toBe("passport");
    expect(parseDemoView("evidence", "team")).toBe("evidence");
    expect(parseDemoView("evidence", "client2")).toBe("evidence");
    expect(demoHref("client1", "passport", "sub-c1-flu")).toBe("/demo?as=client1&view=passport&id=sub-c1-flu");
    expect(demoHref("team", "evidence", "rec-c1-vaccine")).toBe("/demo?as=team&view=evidence&id=rec-c1-vaccine");
  });

  it("keeps the new components client-side and free of database, AI, storage and auth code", () => {
    for (const file of ["src/components/demo/compliance-passport.tsx", "src/components/demo/evidence-dictionary.tsx", "src/lib/demo/passport.ts"]) {
      const src = readFileSync(file, "utf8");
      if (file.endsWith(".tsx")) expect(src).toContain('"use client"');
      expect(src).not.toContain("@/lib/prisma");
      expect(src).not.toContain('"use server"');
      expect(src).not.toContain("@/lib/ai/");
      expect(src).not.toContain("@/lib/auth/");
      expect(src).not.toContain("@/lib/review/");
      expect(src).not.toMatch(/fetch\(/);
    }
  });
});
