import { describe, expect, it } from "vitest";
import { DEMO_POLICIES, DEMO_SUBMISSIONS, SIMULATED_AI_LABEL, SIMULATED_APPROVAL_LABEL } from "@/lib/demo/data";
import { demoHref, parseDemoRole, parseDemoView } from "@/lib/demo/links";
import {
  canView,
  counterpartName,
  demoReducer,
  eventsFor,
  evidenceFor,
  findingsVisibleTo,
  initialDemoState,
  isDemoState,
  messagesFor,
  projectsFor,
  reviewQueue,
  scanFor,
  submissionsFor,
  type DemoState,
} from "@/lib/demo/store";

const AT = "2026-10-31T12:00:00.000Z";

function run(state: DemoState, ...actions: Parameters<typeof demoReducer>[1][]): DemoState {
  return actions.reduce((s, a) => demoReducer(s, a), state);
}

describe("demo sandbox: fictional data", () => {
  it("names no real account, URL or Production identifier", () => {
    const text = JSON.stringify({ DEMO_SUBMISSIONS, DEMO_POLICIES });
    expect(text).not.toMatch(/clyntique\.demo/i);
    expect(text).not.toMatch(/https?:\/\//i);
    expect(text).not.toMatch(/cyntique_demo|vercel|render\.com|blob/i);
    for (const p of DEMO_POLICIES) expect(p.code.startsWith("SAMPLE-")).toBe(true);
  });

  it("labels simulated results explicitly", () => {
    expect(SIMULATED_AI_LABEL).toMatch(/simulated/i);
    expect(SIMULATED_AI_LABEL).toMatch(/no model call/i);
    expect(SIMULATED_APPROVAL_LABEL).toMatch(/not regulatory or platform approval/i);
  });
});

describe("demo sandbox: client isolation", () => {
  const state = initialDemoState();

  it("each client sees only its own projects, submissions and messages", () => {
    const c1 = submissionsFor(state, "client1");
    const c2 = submissionsFor(state, "client2");
    expect(c1.length).toBeGreaterThan(0);
    expect(c2.length).toBeGreaterThan(0);
    expect(c1.every((s) => s.clientId === "client1")).toBe(true);
    expect(c2.every((s) => s.clientId === "client2")).toBe(true);
    expect(projectsFor("client1").every((p) => p.clientId === "client1")).toBe(true);
    expect(messagesFor(state, "client1").every((m) => m.clientId === "client1")).toBe(true);
    expect(submissionsFor(state, "team").length).toBe(c1.length + c2.length);
  });

  it("a client cannot open, or read findings, evidence or history of, another client's record", () => {
    const other = state.submissions.find((s) => s.clientId === "client2")!;
    expect(canView("client1", other)).toBe(false);
    expect(canView("client2", other)).toBe(true);
    expect(canView("team", other)).toBe(true);
    expect(findingsVisibleTo(state, "client1", other.id)).toEqual([]);
    expect(evidenceFor(state, "client1", other.id)).toEqual([]);
    expect(eventsFor(state, "client1", other.id)).toEqual([]);
    expect(findingsVisibleTo(state, "client2", other.id).length).toBeGreaterThan(0);
  });

  it("clients see the reviewer as 'Clyntique Reviewer'; the team sees the client's name", () => {
    expect(counterpartName("client1", "client1")).toBe("Clyntique Reviewer");
    expect(counterpartName("team", "client1")).toBe("Alex Morgan");
  });
});

describe("demo sandbox: review workflow", () => {
  it("runs a simulated scan, accepts a suggestion as a draft, publishes it on request changes", () => {
    const id = "sub-c1-telehealth";
    let s = run(initialDemoState(), { type: "START_REVIEW", submissionId: id, at: AT }, { type: "RUN_SIMULATED_SCAN", submissionId: id, versionNumber: 1, at: AT });
    const scan = scanFor(s, id, 1)!;
    expect(scan.suggestions.length).toBe(2);
    expect(scan.policiesChecked).toBe(DEMO_POLICIES.length);
    expect(s.submissions.find((x) => x.id === id)!.status).toBe("IN_REVIEW");
    expect(s.events.at(-1)?.simulated).toBe(true);

    s = run(s, { type: "ACCEPT_SUGGESTION", submissionId: id, versionNumber: 1, suggestionId: scan.suggestions[0].id, at: AT });
    const draft = s.findings.at(-1)!;
    expect(draft.status).toBe("DRAFT");
    expect(draft.aiSuggested).toBe(true);
    expect(draft.claimText).toBe(scan.suggestions[0].claimText);
    expect(draft.suggestedRevision).toBeTruthy();
    // Drafts are team-only.
    expect(findingsVisibleTo(s, "client1", id).some((f) => f.id === draft.id)).toBe(false);
    expect(findingsVisibleTo(s, "team", id).some((f) => f.id === draft.id)).toBe(true);
    // Accepting twice does nothing.
    expect(run(s, { type: "ACCEPT_SUGGESTION", submissionId: id, versionNumber: 1, suggestionId: scan.suggestions[0].id, at: AT })).toBe(s);

    s = run(s, { type: "REQUEST_CHANGES", submissionId: id, note: "Please revise.", at: AT });
    expect(s.submissions.find((x) => x.id === id)!.status).toBe("CHANGES_REQUESTED");
    expect(findingsVisibleTo(s, "client1", id).some((f) => f.id === draft.id && f.status === "OPEN")).toBe(true);
  });

  it("client responds and resubmits; team resolves and completes with a simulated approval", () => {
    const id = "sub-c2-checkups";
    const findingId = "fd-c2-checkups-1";
    let s = run(
      initialDemoState(),
      { type: "RESPOND_TO_FINDING", findingId, response: "Headline rewritten.", at: AT },
      { type: "SUBMIT_REVISION", submissionId: id, headline: "Back-to-school checkups, booked in minutes", bodyCopy: "", disclosure: "", changeNote: "New headline.", at: AT },
      { type: "ADD_EVIDENCE", submissionId: id, name: "Headline-rationale.txt", kind: "Other", description: "", uploadedBy: "client", at: AT },
    );
    const sub = s.submissions.find((x) => x.id === id)!;
    expect(sub.status).toBe("SUBMITTED");
    expect(sub.versions.length).toBe(2);
    expect(sub.versions[1].bodyCopy).toBe(sub.versions[0].bodyCopy);
    expect(s.findings.find((f) => f.id === findingId)!.status).toBe("RESPONDED");
    expect(evidenceFor(s, "client2", id).at(-1)?.versionNumber).toBe(2);

    // Cannot complete as "no issues" while a finding is unresolved.
    expect(run(s, { type: "COMPLETE_REVIEW", submissionId: id, outcome: "ISSUES_RESOLVED", note: "", at: AT })).toBe(s);

    s = run(s, { type: "RESOLVE_FINDING", findingId, at: AT }, { type: "COMPLETE_REVIEW", submissionId: id, outcome: "ISSUES_RESOLVED", note: "", at: AT });
    const done = s.submissions.find((x) => x.id === id)!;
    expect(done.status).toBe("REVIEW_COMPLETE");
    expect(done.outcome).toBe("ISSUES_RESOLVED");
    const last = eventsFor(s, "client2", id)[0];
    expect(last.title).toMatch(/Review complete/);
    expect(last.detail).toMatch(/Simulated approval/);
    expect(last.detail).toMatch(/not platform or regulatory approval/);
    // No further revisions after completion.
    expect(run(s, { type: "SUBMIT_REVISION", submissionId: id, headline: "x", bodyCopy: "", disclosure: "", changeNote: "", at: AT })).toBe(s);
  });

  it("messages flow both ways and the queue orders waiting work first", () => {
    let s = initialDemoState();
    s = run(s, { type: "SEND_MESSAGE", clientId: "client1", from: "client", body: "Hello?", at: AT }, { type: "SEND_MESSAGE", clientId: "client1", from: "team", body: "Hi Alex.", at: AT }, { type: "SEND_MESSAGE", clientId: "client1", from: "team", body: "   ", at: AT });
    const msgs = messagesFor(s, "client1");
    expect(msgs.at(-1)?.body).toBe("Hi Alex.");
    expect(msgs.at(-2)?.from).toBe("client");
    expect(messagesFor(s, "client2").some((m) => m.body === "Hello?")).toBe(false);
    expect(reviewQueue(s)[0].status).toBe("SUBMITTED");
    expect(isDemoState(s)).toBe(true);
    expect(isDemoState({ version: 0 })).toBe(false);
    expect(demoReducer(s, { type: "RESET" })).toEqual(initialDemoState());
  });
});

describe("demo sandbox: links", () => {
  it("parses roles and views and builds /demo query links", () => {
    expect(parseDemoRole("team")).toBe("team");
    expect(parseDemoRole("admin")).toBeNull();
    expect(parseDemoView("policies", "team")).toBe("policies");
    expect(parseDemoView("policies", "client1")).toBe("overview");
    expect(parseDemoView(null, "team")).toBe("queue");
    expect(demoHref("client2", "submission", "sub-c2-allergy")).toBe("/demo?as=client2&view=submission&id=sub-c2-allergy");
  });
});
