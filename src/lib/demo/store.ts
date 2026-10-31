/*
 * In-memory state for the /demo sandbox. A plain reducer so it can be unit
 * tested without React, and so the browser component only persists a copy in
 * sessionStorage. No database, storage or AI calls happen here.
 */

import {
  DEMO_CLIENTS,
  DEMO_EVENTS,
  DEMO_EVIDENCE,
  DEMO_FINDINGS,
  DEMO_MESSAGES,
  DEMO_POLICIES,
  DEMO_PROJECTS,
  DEMO_SCAN_SCRIPTS,
  DEMO_SUBMISSIONS,
  DEMO_TEAM,
  type DemoAISuggestion,
  type DemoClientRole,
  type DemoEvent,
  type DemoEvidence,
  type DemoFinding,
  type DemoMessage,
  type DemoReviewOutcome,
  type DemoRole,
  type DemoSubmission,
} from "./data";

export const DEMO_STATE_VERSION = 1;

export interface DemoScanResult {
  submissionId: string;
  versionNumber: number;
  summary: string;
  suggestions: DemoAISuggestion[];
  /** Suggestion ids already accepted as findings. */
  accepted: string[];
  ranAt: string;
  policiesChecked: number;
}

export interface DemoState {
  version: number;
  submissions: DemoSubmission[];
  evidence: DemoEvidence[];
  findings: DemoFinding[];
  events: DemoEvent[];
  messages: DemoMessage[];
  scans: DemoScanResult[];
  counter: number;
}

export type DemoAction =
  | { type: "RESET" }
  | { type: "SEND_MESSAGE"; clientId: DemoClientRole; from: "client" | "team"; body: string; at: string }
  | { type: "ADD_EVIDENCE"; submissionId: string; name: string; kind: string; description: string; uploadedBy: "client" | "team"; at: string }
  | { type: "MARK_EVIDENCE_REVIEWED"; evidenceId: string; at: string }
  | { type: "SUBMIT_REVISION"; submissionId: string; headline: string; bodyCopy: string; disclosure: string; changeNote: string; at: string }
  | { type: "RESPOND_TO_FINDING"; findingId: string; response: string; at: string }
  | { type: "START_REVIEW"; submissionId: string; at: string }
  | { type: "RUN_SIMULATED_SCAN"; submissionId: string; versionNumber: number; at: string }
  | { type: "ACCEPT_SUGGESTION"; submissionId: string; versionNumber: number; suggestionId: string; at: string }
  | { type: "RECORD_FINDING"; submissionId: string; versionNumber: number; policyCode: string; severity: DemoFinding["severity"]; requiredAction: DemoFinding["requiredAction"]; issue: string; claimText: string; claimLocation: string; explanation: string; suggestedRevision: string; at: string }
  | { type: "RESOLVE_FINDING"; findingId: string; at: string }
  | { type: "REQUEST_CHANGES"; submissionId: string; note: string; at: string }
  | { type: "COMPLETE_REVIEW"; submissionId: string; outcome: DemoReviewOutcome; note: string; at: string };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function initialDemoState(): DemoState {
  return {
    version: DEMO_STATE_VERSION,
    submissions: clone(DEMO_SUBMISSIONS),
    evidence: clone(DEMO_EVIDENCE),
    findings: clone(DEMO_FINDINGS),
    events: clone(DEMO_EVENTS),
    messages: clone(DEMO_MESSAGES),
    scans: [],
    counter: 1,
  };
}

function nextId(state: DemoState, prefix: string): [string, DemoState] {
  const id = `${prefix}-${state.counter}`;
  return [id, { ...state, counter: state.counter + 1 }];
}

function addEvent(state: DemoState, event: Omit<DemoEvent, "id">): DemoState {
  const [id, next] = nextId(state, "evt-demo");
  return { ...next, events: [...next.events, { id, ...event }] };
}

function updateSubmission(state: DemoState, id: string, patch: (s: DemoSubmission) => DemoSubmission): DemoState {
  return { ...state, submissions: state.submissions.map((s) => (s.id === id ? patch(s) : s)) };
}

function currentVersionNumber(submission: DemoSubmission): number {
  return submission.versions[submission.versions.length - 1]?.number ?? 1;
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case "RESET":
      return initialDemoState();

    case "SEND_MESSAGE": {
      const body = action.body.trim();
      if (!body) return state;
      const [id, next] = nextId(state, "msg-demo");
      return { ...next, messages: [...next.messages, { id, clientId: action.clientId, from: action.from, body, at: action.at }] };
    }

    case "ADD_EVIDENCE": {
      const submission = state.submissions.find((s) => s.id === action.submissionId);
      if (!submission || !action.name.trim()) return state;
      const [id, next] = nextId(state, "ev-demo");
      const item: DemoEvidence = {
        id,
        submissionId: submission.id,
        name: action.name.trim(),
        kind: action.kind,
        description: action.description.trim() || "Added in the demo session.",
        uploadedBy: action.uploadedBy,
        versionNumber: currentVersionNumber(submission),
        uploadedAt: action.at,
        reviewed: action.uploadedBy === "team",
      };
      return addEvent({ ...next, evidence: [...next.evidence, item] }, {
        submissionId: submission.id,
        at: action.at,
        actor: action.uploadedBy,
        title: "Evidence added",
        detail: `${item.name} attached to version ${item.versionNumber} (simulated upload, no file stored).`,
        simulated: true,
      });
    }

    case "MARK_EVIDENCE_REVIEWED":
      return { ...state, evidence: state.evidence.map((e) => (e.id === action.evidenceId ? { ...e, reviewed: true } : e)) };

    case "SUBMIT_REVISION": {
      const submission = state.submissions.find((s) => s.id === action.submissionId);
      if (!submission || submission.status === "REVIEW_COMPLETE") return state;
      const number = currentVersionNumber(submission) + 1;
      const next = updateSubmission(state, submission.id, (s) => ({
        ...s,
        status: "SUBMITTED",
        versions: [
          ...s.versions,
          {
            number,
            fileName: `${s.id.replace("sub-", "")}-v${number}.txt`,
            headline: action.headline.trim() || s.versions[s.versions.length - 1].headline,
            bodyCopy: action.bodyCopy.trim() || s.versions[s.versions.length - 1].bodyCopy,
            disclosure: action.disclosure.trim() || null,
            changeNote: action.changeNote.trim() || "Revised in the demo session.",
            submittedAt: action.at,
          },
        ],
      }));
      return addEvent(next, {
        submissionId: submission.id,
        at: action.at,
        actor: "client",
        title: `Version ${number} submitted`,
        detail: action.changeNote.trim() || "Revised copy submitted for review.",
      });
    }

    case "RESPOND_TO_FINDING": {
      const finding = state.findings.find((f) => f.id === action.findingId);
      if (!finding || finding.status !== "OPEN" || !action.response.trim()) return state;
      const next = {
        ...state,
        findings: state.findings.map((f) => (f.id === finding.id ? { ...f, status: "RESPONDED" as const, clientResponse: action.response.trim() } : f)),
      };
      return addEvent(next, {
        submissionId: finding.submissionId,
        at: action.at,
        actor: "client",
        title: "Client responded to a finding",
        detail: `${finding.issue}: "${action.response.trim()}"`,
      });
    }

    case "START_REVIEW": {
      const submission = state.submissions.find((s) => s.id === action.submissionId);
      if (!submission || submission.status !== "SUBMITTED") return state;
      const next = updateSubmission(state, submission.id, (s) => ({ ...s, status: "IN_REVIEW" }));
      return addEvent(next, { submissionId: submission.id, at: action.at, actor: "team", title: "Review started", detail: `${DEMO_TEAM.reviewerName} opened the submission.` });
    }

    case "RUN_SIMULATED_SCAN": {
      const submission = state.submissions.find((s) => s.id === action.submissionId);
      if (!submission) return state;
      const script = DEMO_SCAN_SCRIPTS.find((s) => s.submissionId === submission.id && s.versionNumber === action.versionNumber);
      const existing = state.scans.find((s) => s.submissionId === submission.id && s.versionNumber === action.versionNumber);
      const alreadyFound = state.findings
        .filter((f) => f.submissionId === submission.id && f.versionNumber === action.versionNumber && f.aiSuggested)
        .map((f) => f.policyCode);
      const suggestions = script ? script.suggestions : [];
      const result: DemoScanResult = {
        submissionId: submission.id,
        versionNumber: action.versionNumber,
        summary: script
          ? script.summary
          : "No sample-policy matches above the reporting threshold for this version. Human review still required.",
        suggestions,
        accepted: existing?.accepted ?? suggestions.filter((s) => alreadyFound.includes(s.policyCode)).map((s) => s.id),
        ranAt: action.at,
        policiesChecked: DEMO_POLICIES.length,
      };
      const next = {
        ...state,
        scans: [...state.scans.filter((s) => !(s.submissionId === submission.id && s.versionNumber === action.versionNumber)), result],
      };
      return addEvent(next, {
        submissionId: submission.id,
        at: action.at,
        actor: "system",
        title: "Simulated AI scan completed",
        detail: `Version ${action.versionNumber} checked against ${DEMO_POLICIES.length} sample policies. ${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"}.`,
        simulated: true,
      });
    }

    case "ACCEPT_SUGGESTION": {
      const scan = state.scans.find((s) => s.submissionId === action.submissionId && s.versionNumber === action.versionNumber);
      const suggestion = scan?.suggestions.find((s) => s.id === action.suggestionId);
      if (!scan || !suggestion || scan.accepted.includes(suggestion.id)) return state;
      const [id, next] = nextId(state, "fd-demo");
      const finding: DemoFinding = {
        id,
        submissionId: action.submissionId,
        versionNumber: action.versionNumber,
        policyCode: suggestion.policyCode,
        severity: suggestion.severity,
        requiredAction: suggestion.requiredAction,
        status: "DRAFT",
        issue: suggestion.issue,
        claimText: suggestion.claimText,
        claimLocation: suggestion.claimLocation,
        explanation: suggestion.explanation,
        suggestedRevision: suggestion.suggestedRevision,
        aiSuggested: true,
        clientResponse: null,
        createdAt: action.at,
      };
      return {
        ...next,
        findings: [...next.findings, finding],
        scans: next.scans.map((s) => (s === scan ? { ...s, accepted: [...s.accepted, suggestion.id] } : s)),
      };
    }

    case "RECORD_FINDING": {
      if (!action.issue.trim()) return state;
      const [id, next] = nextId(state, "fd-demo");
      const finding: DemoFinding = {
        id,
        submissionId: action.submissionId,
        versionNumber: action.versionNumber,
        policyCode: action.policyCode,
        severity: action.severity,
        requiredAction: action.requiredAction,
        status: "DRAFT",
        issue: action.issue.trim(),
        claimText: action.claimText.trim(),
        claimLocation: action.claimLocation.trim(),
        explanation: action.explanation.trim(),
        suggestedRevision: action.suggestedRevision.trim(),
        aiSuggested: false,
        clientResponse: null,
        createdAt: action.at,
      };
      return { ...next, findings: [...next.findings, finding] };
    }

    case "RESOLVE_FINDING": {
      const finding = state.findings.find((f) => f.id === action.findingId);
      if (!finding || finding.status === "RESOLVED" || finding.status === "DRAFT") return state;
      const next = { ...state, findings: state.findings.map((f) => (f.id === finding.id ? { ...f, status: "RESOLVED" as const } : f)) };
      return addEvent(next, { submissionId: finding.submissionId, at: action.at, actor: "team", title: "Finding resolved", detail: finding.issue });
    }

    case "REQUEST_CHANGES": {
      const submission = state.submissions.find((s) => s.id === action.submissionId);
      if (!submission || submission.status === "REVIEW_COMPLETE") return state;
      const drafts = state.findings.filter((f) => f.submissionId === submission.id && f.status === "DRAFT");
      const published = drafts.length;
      const openCount = state.findings.filter((f) => f.submissionId === submission.id && (f.status === "OPEN" || f.status === "RESPONDED")).length + published;
      if (openCount === 0) return state;
      let next: DemoState = {
        ...state,
        findings: state.findings.map((f) => (f.submissionId === submission.id && f.status === "DRAFT" ? { ...f, status: "OPEN" as const } : f)),
      };
      next = updateSubmission(next, submission.id, (s) => ({ ...s, status: "CHANGES_REQUESTED" }));
      return addEvent(next, {
        submissionId: submission.id,
        at: action.at,
        actor: "team",
        title: "Changes requested",
        detail: `${published} finding${published === 1 ? "" : "s"} published to the client.${action.note.trim() ? ` Note: ${action.note.trim()}` : ""}`,
        simulated: true,
      });
    }

    case "COMPLETE_REVIEW": {
      const submission = state.submissions.find((s) => s.id === action.submissionId);
      if (!submission || submission.status === "REVIEW_COMPLETE") return state;
      const unresolved = state.findings.filter((f) => f.submissionId === submission.id && (f.status === "OPEN" || f.status === "RESPONDED"));
      if (action.outcome !== "COMPLETED_WITH_OPEN_ISSUES" && unresolved.length > 0) return state;
      const next = updateSubmission(
        { ...state, findings: state.findings.filter((f) => !(f.submissionId === submission.id && f.status === "DRAFT")) },
        submission.id,
        (s) => ({ ...s, status: "REVIEW_COMPLETE", outcome: action.outcome }),
      );
      return addEvent(next, {
        submissionId: submission.id,
        at: action.at,
        actor: "team",
        title: `Review complete · ${OUTCOME_TITLE[action.outcome]}`,
        detail: `Simulated approval. Internal human review only, not platform or regulatory approval.${action.note.trim() ? ` Note: ${action.note.trim()}` : ""}`,
        simulated: true,
      });
    }

    default:
      return state;
  }
}

const OUTCOME_TITLE: Record<DemoReviewOutcome, string> = {
  NO_ISSUES_IDENTIFIED: "No issues identified",
  ISSUES_RESOLVED: "Issues resolved",
  COMPLETED_WITH_OPEN_ISSUES: "Completed with open issues",
};

// ---------------------------------------------------------------------------
// Selectors. Client roles only ever see their own records; Team sees all.

export function clientIdForRole(role: DemoRole): DemoClientRole | null {
  return role === "team" ? null : role;
}

export function canView(role: DemoRole, submission: DemoSubmission | undefined): submission is DemoSubmission {
  if (!submission) return false;
  return role === "team" || submission.clientId === role;
}

export function submissionsFor(state: DemoState, role: DemoRole): DemoSubmission[] {
  return state.submissions.filter((s) => canView(role, s));
}

export function projectsFor(role: DemoRole) {
  return DEMO_PROJECTS.filter((p) => role === "team" || p.clientId === role);
}

export function findingsVisibleTo(state: DemoState, role: DemoRole, submissionId: string): DemoFinding[] {
  const submission = state.submissions.find((s) => s.id === submissionId);
  if (!canView(role, submission)) return [];
  return state.findings.filter((f) => f.submissionId === submissionId && (role === "team" || f.status !== "DRAFT"));
}

export function evidenceFor(state: DemoState, role: DemoRole, submissionId: string): DemoEvidence[] {
  const submission = state.submissions.find((s) => s.id === submissionId);
  if (!canView(role, submission)) return [];
  return state.evidence.filter((e) => e.submissionId === submissionId);
}

export function eventsFor(state: DemoState, role: DemoRole, submissionId: string): DemoEvent[] {
  const submission = state.submissions.find((s) => s.id === submissionId);
  if (!canView(role, submission)) return [];
  return state.events.filter((e) => e.submissionId === submissionId).sort((a, b) => (a.at < b.at ? 1 : -1));
}

export function messagesFor(state: DemoState, clientId: DemoClientRole): DemoMessage[] {
  return state.messages.filter((m) => m.clientId === clientId);
}

export function scanFor(state: DemoState, submissionId: string, versionNumber: number): DemoScanResult | undefined {
  return state.scans.find((s) => s.submissionId === submissionId && s.versionNumber === versionNumber);
}

export function reviewQueue(state: DemoState): DemoSubmission[] {
  const order: Record<DemoSubmission["status"], number> = { SUBMITTED: 0, IN_REVIEW: 1, CHANGES_REQUESTED: 2, REVIEW_COMPLETE: 3 };
  return [...state.submissions].sort((a, b) => order[a.status] - order[b.status] || (a.createdAt < b.createdAt ? -1 : 1));
}

/** The name a given viewer sees for the other side of a conversation. */
export function counterpartName(role: DemoRole, clientId: DemoClientRole): string {
  return role === "team" ? DEMO_CLIENTS[clientId].contactName : DEMO_TEAM.clientFacingName;
}

export function policyByCode(code: string) {
  return DEMO_POLICIES.find((p) => p.code === code);
}

export function isDemoState(value: unknown): value is DemoState {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<DemoState>;
  return v.version === DEMO_STATE_VERSION && Array.isArray(v.submissions) && Array.isArray(v.findings) && Array.isArray(v.messages);
}
