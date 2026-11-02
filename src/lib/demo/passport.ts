/*
 * Compliance Passport for the /demo sandbox.
 *
 * The passport is derived, never stored: it is built from the sandbox state
 * for one creative and one version, so it can never disagree with the
 * findings, evidence and decisions it summarises. This mirrors the product's
 * review record (src/components/record/review-record.tsx), which is built
 * from the same loaders as the workspace. See
 * docs/demo/passport-and-evidence-dictionary.md for what is demo-only.
 *
 * Everything the viewer may not see elsewhere is left out here too: a client
 * never sees draft findings, and no one sees another client's creative.
 */

import {
  DEMO_CLIENTS,
  DEMO_POLICIES,
  DEMO_PROJECTS,
  DEMO_TEAM,
  EVIDENCE_RECORD_STATUS_LABEL,
  type DemoEvidence,
  type DemoEvidenceRecord,
  type DemoEvidenceRecordStatus,
  type DemoEvent,
  type DemoFinding,
  type DemoPolicy,
  type DemoRole,
  type DemoSubmission,
} from "./data";
import { canView, eventsFor, findingsVisibleTo, type DemoScanResult, type DemoState } from "./store";

export type PassportStatus = "IN_PROGRESS" | "ACTIVE" | "SUPERSEDED";

export const PASSPORT_STATUS_LABEL: Record<PassportStatus, string> = {
  IN_PROGRESS: "Review in progress · passport not final",
  ACTIVE: "Internal review complete · current version",
  SUPERSEDED: "Superseded · a newer version exists",
};

export const PASSPORT_DISCLAIMER =
  "This Compliance Passport is Clyntique's internal review record for one creative version. It is not legal advice, not government approval, not a certification, and not acceptance by any advertising platform. Findings marked as simulated came from sample policies, not from verified rules.";

export interface PassportFinding {
  finding: DemoFinding;
  policy: DemoPolicy | undefined;
  /** How the finding came to exist: an AI suggestion a reviewer accepted, or a reviewer's own entry. */
  origin: "AI_SUGGESTED_REVIEWER_ACCEPTED" | "REVIEWER_RECORDED";
}

export interface PassportEvidence {
  evidence: DemoEvidence;
  record: DemoEvidenceRecord | null;
  /** Verification as the passport states it, derived from the dictionary record when there is one. */
  verification: DemoEvidenceRecordStatus;
  verificationLabel: string;
}

export interface PassportPolicyReference {
  policy: DemoPolicy;
  /** Cited by at least one finding on this version. */
  cited: boolean;
  /** Included in a simulated scan of this version. */
  checked: boolean;
}

export interface PassportDecision {
  event: DemoEvent;
  kind: "DECISION" | "AI_CHECK" | "EVIDENCE" | "SUBMISSION" | "OTHER";
}

export interface CompliancePassport {
  recordCode: string;
  /** The newest timestamp among everything the passport summarises: it changes whenever the record changes. */
  updatedAt: string;
  status: PassportStatus;
  statusLabel: string;
  creative: {
    submissionId: string;
    title: string;
    versionNumber: number;
    currentVersionNumber: number;
    fileName: string;
    headline: string;
    bodyCopy: string;
    disclosure: string | null;
    submittedAt: string;
    changeNote: string;
    format: string;
  };
  client: { organization: string; contactName: string | null; project: string };
  target: { platform: string; market: string };
  review: {
    status: DemoSubmission["status"];
    outcome: DemoSubmission["outcome"];
    reviewerLabel: string;
    openFindings: number;
    resolvedFindings: number;
    draftFindings: number;
  };
  findings: PassportFinding[];
  evidence: PassportEvidence[];
  /** Findings asking for evidence that no attachment on this or a later version answers. */
  missingEvidence: DemoFinding[];
  policies: PassportPolicyReference[];
  coverage: {
    samplePolicies: number;
    verifiedPolicies: number;
    platformCovered: boolean;
    marketCovered: boolean;
    scansRun: number;
    limitations: string[];
  };
  aiChecks: DemoScanResult[];
  history: PassportDecision[];
  disclaimer: string;
}

function classify(event: DemoEvent): PassportDecision["kind"] {
  const t = event.title.toLowerCase();
  if (t.startsWith("review complete") || t.startsWith("changes requested") || t.startsWith("review started") || t.startsWith("finding resolved")) return "DECISION";
  if (t.includes("scan")) return "AI_CHECK";
  if (t.includes("evidence")) return "EVIDENCE";
  if (t.includes("submitted") || t.includes("responded")) return "SUBMISSION";
  return "OTHER";
}

/**
 * Build the passport for a creative version as seen by `role`. Returns null
 * when the viewer may not see the creative, so a client never gets another
 * client's passport.
 */
export function buildPassport(state: DemoState, role: DemoRole, submissionId: string, versionNumber: number | undefined): CompliancePassport | null {
  const submission = state.submissions.find((s) => s.id === submissionId);
  if (!canView(role, submission)) return null;
  const current = submission.versions[submission.versions.length - 1];
  const version = submission.versions.find((v) => v.number === versionNumber) ?? current;
  const isCurrent = version.number === current.number;
  const project = DEMO_PROJECTS.find((p) => p.id === submission.projectId);
  const client = DEMO_CLIENTS[submission.clientId];

  const visible = findingsVisibleTo(state, role, submission.id);
  const onVersion = visible.filter((f) => f.versionNumber === version.number);
  const findings: PassportFinding[] = onVersion.map((finding) => ({
    finding,
    policy: DEMO_POLICIES.find((p) => p.code === finding.policyCode),
    origin: finding.aiSuggested ? "AI_SUGGESTED_REVIEWER_ACCEPTED" : "REVIEWER_RECORDED",
  }));

  const attachments = state.evidence.filter((e) => e.submissionId === submission.id && e.versionNumber === version.number);
  const evidence: PassportEvidence[] = attachments.map((item) => {
    const record = state.records.find((r) => r.id === item.recordId) ?? null;
    const verification: DemoEvidenceRecordStatus = record ? record.status : item.reviewed ? "VERIFIED" : "UNVERIFIED";
    return { evidence: item, record, verification, verificationLabel: EVIDENCE_RECORD_STATUS_LABEL[verification] };
  });

  // A request for evidence is answered when anything was attached on the same or a later version.
  const laterAttachments = state.evidence.filter((e) => e.submissionId === submission.id);
  const missingEvidence = visible.filter(
    (f) =>
      f.requiredAction === "PROVIDE_EVIDENCE" &&
      f.status !== "RESOLVED" &&
      f.versionNumber <= version.number &&
      !laterAttachments.some((e) => e.versionNumber >= f.versionNumber),
  );

  const scans = state.scans.filter((s) => s.submissionId === submission.id);
  const scansOnVersion = scans.filter((s) => s.versionNumber === version.number);
  const cited = new Set(onVersion.map((f) => f.policyCode));
  const policies: PassportPolicyReference[] = DEMO_POLICIES.filter((p) => cited.has(p.code) || scansOnVersion.length > 0).map((policy) => ({
    policy,
    cited: cited.has(policy.code),
    checked: scansOnVersion.length > 0,
  }));

  const platformCovered = DEMO_POLICIES.some((p) => p.platform === null || p.platform === submission.platform);
  const marketCovered = DEMO_POLICIES.some((p) => p.jurisdiction === "US") && submission.market === "United States";
  const limitations = [
    `Checked against ${DEMO_POLICIES.length} sample policies written for this demo. None is a verified rule; 0 verified policies were available.`,
    platformCovered ? `Sample coverage exists for ${submission.platform}.` : `No sample policy covers ${submission.platform}; the AI would abstain here.`,
    marketCovered ? `Sample coverage exists for ${submission.market}.` : `No sample policy covers ${submission.market}.`,
    "Policies for other platforms, markets or industries were not checked.",
  ];

  const status: PassportStatus = !isCurrent ? "SUPERSEDED" : submission.status === "REVIEW_COMPLETE" ? "ACTIVE" : "IN_PROGRESS";
  const history: PassportDecision[] = eventsFor(state, role, submission.id).map((event) => ({ event, kind: classify(event) }));
  const updatedAt = [
    ...submission.versions.map((v) => v.submittedAt),
    ...history.map((h) => h.event.at),
    ...attachments.map((e) => e.uploadedAt),
    ...evidence.flatMap((e) => (e.record ? [e.record.updatedAt] : [])),
    ...scans.map((s) => s.ranAt),
    ...visible.map((f) => f.createdAt),
  ].reduce((a, b) => (a > b ? a : b), submission.createdAt);

  return {
    recordCode: `${submission.id.replace(/^sub-/, "").toUpperCase()}-V${version.number}`,
    updatedAt,
    status,
    statusLabel: PASSPORT_STATUS_LABEL[status],
    creative: {
      submissionId: submission.id,
      title: submission.title,
      versionNumber: version.number,
      currentVersionNumber: current.number,
      fileName: version.fileName,
      headline: version.headline,
      bodyCopy: version.bodyCopy,
      disclosure: version.disclosure,
      submittedAt: version.submittedAt,
      changeNote: version.changeNote,
      format: submission.format,
    },
    client: {
      organization: client.organization,
      contactName: role === "team" ? client.contactName : null,
      project: project?.name ?? "",
    },
    target: { platform: submission.platform, market: submission.market },
    review: {
      status: submission.status,
      outcome: submission.outcome,
      reviewerLabel: role === "team" ? DEMO_TEAM.reviewerName : DEMO_TEAM.clientFacingName,
      openFindings: onVersion.filter((f) => f.status === "OPEN" || f.status === "RESPONDED").length,
      resolvedFindings: onVersion.filter((f) => f.status === "RESOLVED").length,
      draftFindings: onVersion.filter((f) => f.status === "DRAFT").length,
    },
    findings,
    evidence,
    missingEvidence,
    policies,
    coverage: {
      samplePolicies: DEMO_POLICIES.length,
      verifiedPolicies: 0,
      platformCovered,
      marketCovered,
      scansRun: scans.length,
      limitations,
    },
    aiChecks: scans,
    history,
    disclaimer: PASSPORT_DISCLAIMER,
  };
}

/** Words a passport must never use about a creative; tested, and kept out of every label above. */
export const PASSPORT_FORBIDDEN_CLAIMS = ["legally compliant", "government approved", "certified compliant", "platform approved"];
