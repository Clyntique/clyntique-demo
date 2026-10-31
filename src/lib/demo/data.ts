/*
 * Fictional data for the public /demo sandbox.
 *
 * Everything here is invented for the YC demo: two sample clinics, one
 * reviewer, sample policies and sample submissions. Nothing is read from or
 * written to the database, Blob storage or the AI provider. The demo store
 * (./store.ts) copies this seed into memory and mutates only that copy.
 */

export type DemoRole = "client1" | "client2" | "team";
export type DemoClientRole = Exclude<DemoRole, "team">;

export type DemoSeverity = "HIGH" | "MEDIUM" | "LOW" | "ADVISORY";
export type DemoRequiredAction = "REVISE_CONTENT" | "PROVIDE_EVIDENCE" | "CLARIFY" | "ACKNOWLEDGE";
export type DemoFindingStatus = "DRAFT" | "OPEN" | "RESPONDED" | "RESOLVED";
export type DemoSubmissionStatus = "SUBMITTED" | "IN_REVIEW" | "CHANGES_REQUESTED" | "REVIEW_COMPLETE";
export type DemoReviewOutcome = "NO_ISSUES_IDENTIFIED" | "ISSUES_RESOLVED" | "COMPLETED_WITH_OPEN_ISSUES";

export interface DemoClient {
  id: DemoClientRole;
  organization: string;
  contactName: string;
  contactEmail: string;
  industry: string;
  market: string;
}

export interface DemoPolicy {
  code: string;
  title: string;
  authority: string;
  jurisdiction: string;
  platform: string | null;
  section: string;
  summary: string;
  explanation: string;
  versionNumber: number;
}

export interface DemoProject {
  id: string;
  clientId: DemoClientRole;
  name: string;
  description: string;
  platforms: string[];
  createdAt: string;
}

export interface DemoVersion {
  number: number;
  fileName: string;
  headline: string;
  bodyCopy: string;
  disclosure: string | null;
  changeNote: string;
  submittedAt: string;
}

export interface DemoEvidence {
  id: string;
  submissionId: string;
  name: string;
  kind: string;
  description: string;
  uploadedBy: "client" | "team";
  versionNumber: number;
  uploadedAt: string;
  reviewed: boolean;
}

export interface DemoFinding {
  id: string;
  submissionId: string;
  versionNumber: number;
  policyCode: string;
  severity: DemoSeverity;
  requiredAction: DemoRequiredAction;
  status: DemoFindingStatus;
  issue: string;
  claimText: string;
  claimLocation: string;
  explanation: string;
  suggestedRevision: string;
  /** Set when the finding started as a simulated AI suggestion. */
  aiSuggested: boolean;
  clientResponse: string | null;
  createdAt: string;
}

export interface DemoEvent {
  id: string;
  submissionId: string;
  at: string;
  actor: "client" | "team" | "system";
  title: string;
  detail: string;
  simulated?: boolean;
}

export interface DemoSubmission {
  id: string;
  clientId: DemoClientRole;
  projectId: string;
  title: string;
  format: string;
  platform: string;
  market: string;
  status: DemoSubmissionStatus;
  outcome: DemoReviewOutcome | null;
  versions: DemoVersion[];
  createdAt: string;
}

export interface DemoMessage {
  id: string;
  clientId: DemoClientRole;
  from: "client" | "team";
  body: string;
  at: string;
}

/** A canned "AI" suggestion the simulated scan returns for a given version. */
export interface DemoAISuggestion {
  id: string;
  policyCode: string;
  severity: DemoSeverity;
  requiredAction: DemoRequiredAction;
  issue: string;
  claimText: string;
  claimLocation: string;
  explanation: string;
  suggestedRevision: string;
  confidence: number;
}

export interface DemoScanScript {
  submissionId: string;
  versionNumber: number;
  summary: string;
  suggestions: DemoAISuggestion[];
}

export const DEMO_CLIENTS: Record<DemoClientRole, DemoClient> = {
  client1: {
    id: "client1",
    organization: "Northside Family Practice",
    contactName: "Alex Morgan",
    contactEmail: "alex@northside.example",
    industry: "Healthcare",
    market: "United States",
  },
  client2: {
    id: "client2",
    organization: "Lakeview Pediatrics",
    contactName: "Jordan Lee",
    contactEmail: "jordan@lakeview.example",
    industry: "Healthcare",
    market: "United States",
  },
};

export const DEMO_TEAM = {
  reviewerName: "Sam Rivera",
  /** Clients only ever see this label, never the reviewer's name. */
  clientFacingName: "Clyntique Reviewer",
};

export const DEMO_ROLE_LABEL: Record<DemoRole, string> = {
  client1: "Client 1 · Northside Family Practice",
  client2: "Client 2 · Lakeview Pediatrics",
  team: "Clyntique Team",
};

export const DEMO_POLICIES: DemoPolicy[] = [
  {
    code: "SAMPLE-META-PA-01",
    title: "Personal attributes: do not imply a health condition",
    authority: "Platform policy (sample)",
    jurisdiction: "US",
    platform: "Meta",
    section: "Personal attributes · Health",
    summary:
      "Ads must not assert or imply that the viewer has a medical or mental health condition, based on wording that addresses them directly.",
    explanation:
      "Copy that speaks to 'your diabetes' or 'your anxiety' singles out the reader. Describing the service and who it is for, without addressing the reader's own condition, keeps the ad within the sample rule.",
    versionNumber: 1,
  },
  {
    code: "SAMPLE-FTC-HC-01",
    title: "Health claims need competent and reliable evidence",
    authority: "Regulation (sample)",
    jurisdiction: "US",
    platform: null,
    section: "Health claims · Substantiation",
    summary:
      "Objective health or efficacy claims must be supported by competent and reliable scientific evidence before they run.",
    explanation:
      "A claim such as 'prevents the flu' or 'cures seasonal allergies' is a health claim. The advertiser holds the evidence, so the reviewer asks for it or asks for softer wording.",
    versionNumber: 2,
  },
  {
    code: "SAMPLE-GOOG-HC-01",
    title: "Healthcare services: restricted terms and certification",
    authority: "Platform policy (sample)",
    jurisdiction: "US",
    platform: "Google Ads",
    section: "Healthcare and medicines · Services",
    summary:
      "Telehealth and prescription-related ads are restricted; some require advertiser certification before the ad can serve.",
    explanation:
      "Mentioning prescriptions in search ad copy triggers the sample restriction. The reviewer flags it so the client can confirm certification or remove the term.",
    versionNumber: 1,
  },
  {
    code: "SAMPLE-DISC-01",
    title: "Material connections and disclosures",
    authority: "Regulation (sample)",
    jurisdiction: "US",
    platform: null,
    section: "Endorsements · Disclosures",
    summary:
      "Testimonials and endorsements must disclose any material connection, and typical results must be stated when results are atypical.",
    explanation:
      "A patient quote in an ad is an endorsement. If the patient was compensated or the result is not typical, the ad needs a clear disclosure.",
    versionNumber: 1,
  },
];

const AT = (day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 9, day, hour, minute)).toISOString();

export const DEMO_PROJECTS: DemoProject[] = [
  {
    id: "proj-c1-seasonal",
    clientId: "client1",
    name: "Seasonal Clinic Campaign",
    description: "Autumn flu-shot clinic and telehealth follow-up promotion.",
    platforms: ["Meta", "Google Ads"],
    createdAt: AT(12, 9),
  },
  {
    id: "proj-c1-portal",
    clientId: "client1",
    name: "Patient Portal Launch",
    description: "Announcing online appointment booking and records access.",
    platforms: ["Meta"],
    createdAt: AT(20, 10),
  },
  {
    id: "proj-c2-school",
    clientId: "client2",
    name: "Back-to-School Checkups",
    description: "Well-child visits, sports physicals and allergy-season tips.",
    platforms: ["Meta"],
    createdAt: AT(14, 11),
  },
];

export const DEMO_SUBMISSIONS: DemoSubmission[] = [
  {
    id: "sub-c1-flu",
    clientId: "client1",
    projectId: "proj-c1-seasonal",
    title: "Flu shot clinic · Instagram carousel",
    format: "Image carousel · 1080×1350",
    platform: "Meta",
    market: "United States",
    status: "REVIEW_COMPLETE",
    outcome: "ISSUES_RESOLVED",
    createdAt: AT(13, 9, 10),
    versions: [
      {
        number: 1,
        fileName: "flu-clinic-carousel-v1.png",
        headline: "Stop the flu before it stops you",
        bodyCopy: "Our flu shot prevents the flu. Walk in any weekday, no appointment needed.",
        disclosure: null,
        changeNote: "Initial submission.",
        submittedAt: AT(13, 9, 10),
      },
      {
        number: 2,
        fileName: "flu-clinic-carousel-v2.png",
        headline: "Flu season is here. We are ready.",
        bodyCopy: "Flu shots available on weekdays, walk-ins welcome. Vaccination helps reduce the risk of flu.",
        disclosure: "Talk to a clinician about whether vaccination is right for you.",
        changeNote: "Replaced the prevention guarantee with risk-reduction wording and added a disclosure line.",
        submittedAt: AT(16, 14, 5),
      },
    ],
  },
  {
    id: "sub-c1-telehealth",
    clientId: "client1",
    projectId: "proj-c1-seasonal",
    title: "Telehealth follow-up visits · Google search ad",
    format: "Responsive search ad",
    platform: "Google Ads",
    market: "United States",
    status: "SUBMITTED",
    outcome: null,
    createdAt: AT(28, 15, 30),
    versions: [
      {
        number: 1,
        fileName: "telehealth-rsa-v1.txt",
        headline: "Same-day telehealth follow-ups",
        bodyCopy: "See your doctor from home. Prescription refills in minutes. Book online in 60 seconds.",
        disclosure: null,
        changeNote: "Initial submission.",
        submittedAt: AT(28, 15, 30),
      },
    ],
  },
  {
    id: "sub-c1-portal",
    clientId: "client1",
    projectId: "proj-c1-portal",
    title: "Patient portal announcement · Facebook feed",
    format: "Single image · 1200×628",
    platform: "Meta",
    market: "United States",
    status: "IN_REVIEW",
    outcome: null,
    createdAt: AT(27, 11),
    versions: [
      {
        number: 1,
        fileName: "portal-launch-v1.png",
        headline: "Your records, your schedule",
        bodyCopy: "Book visits, read results and message our team from the new Northside patient portal.",
        disclosure: null,
        changeNote: "Initial submission.",
        submittedAt: AT(27, 11),
      },
    ],
  },
  {
    id: "sub-c2-checkups",
    clientId: "client2",
    projectId: "proj-c2-school",
    title: "Back-to-school checkups · Facebook feed image",
    format: "Single image · 1080×1080",
    platform: "Meta",
    market: "United States",
    status: "CHANGES_REQUESTED",
    outcome: null,
    createdAt: AT(21, 10, 15),
    versions: [
      {
        number: 1,
        fileName: "checkups-feed-v1.png",
        headline: "Is your child's asthma under control?",
        bodyCopy: "Book a back-to-school checkup and sports physical this month. Same-week appointments available.",
        disclosure: null,
        changeNote: "Initial submission.",
        submittedAt: AT(21, 10, 15),
      },
    ],
  },
  {
    id: "sub-c2-allergy",
    clientId: "client2",
    projectId: "proj-c2-school",
    title: "Allergy season tips · Instagram Reel",
    format: "Vertical video · 15s",
    platform: "Meta",
    market: "United States",
    status: "SUBMITTED",
    outcome: null,
    createdAt: AT(29, 9, 45),
    versions: [
      {
        number: 1,
        fileName: "allergy-reel-v1.mp4",
        headline: "Allergy season survival guide",
        bodyCopy:
          "\"Lakeview cured my son's allergies in one visit.\" — a Lakeview parent. Three tips from our pediatricians, then book a visit.",
        disclosure: null,
        changeNote: "Initial submission.",
        submittedAt: AT(29, 9, 45),
      },
    ],
  },
];

export const DEMO_EVIDENCE: DemoEvidence[] = [
  {
    id: "ev-c1-flu-1",
    submissionId: "sub-c1-flu",
    name: "Vaccine-effectiveness-summary.pdf",
    kind: "Reference summary",
    description: "Summary of published effectiveness ranges used for the risk-reduction wording.",
    uploadedBy: "client",
    versionNumber: 2,
    uploadedAt: AT(16, 14, 8),
    reviewed: true,
  },
  {
    id: "ev-c1-flu-2",
    submissionId: "sub-c1-flu",
    name: "Reviewer-note-flu-v2.txt",
    kind: "Reviewer note",
    description: "Reviewer confirmed the revised wording no longer states an outcome guarantee.",
    uploadedBy: "team",
    versionNumber: 2,
    uploadedAt: AT(17, 9, 30),
    reviewed: true,
  },
  {
    id: "ev-c2-checkups-1",
    submissionId: "sub-c2-checkups",
    name: "Sports-physical-service-description.pdf",
    kind: "Service description",
    description: "Describes the checkup and sports physical offer shown in the ad.",
    uploadedBy: "client",
    versionNumber: 1,
    uploadedAt: AT(21, 10, 20),
    reviewed: true,
  },
];

export const DEMO_FINDINGS: DemoFinding[] = [
  {
    id: "fd-c1-flu-1",
    submissionId: "sub-c1-flu",
    versionNumber: 1,
    policyCode: "SAMPLE-FTC-HC-01",
    severity: "HIGH",
    requiredAction: "REVISE_CONTENT",
    status: "RESOLVED",
    issue: "Prevention guarantee stated as fact",
    claimText: "Our flu shot prevents the flu.",
    claimLocation: "Slide 1 body copy",
    explanation:
      "An absolute prevention claim is an objective health claim that needs evidence of that level. Published effectiveness is a range, so the claim overstates it.",
    suggestedRevision: "Vaccination helps reduce the risk of flu.",
    aiSuggested: true,
    clientResponse: "Reworded in version 2 and attached an effectiveness summary.",
    createdAt: AT(14, 10, 2),
  },
  {
    id: "fd-c1-flu-2",
    submissionId: "sub-c1-flu",
    versionNumber: 1,
    policyCode: "SAMPLE-META-PA-01",
    severity: "LOW",
    requiredAction: "ACKNOWLEDGE",
    status: "RESOLVED",
    issue: "Headline addresses the reader's own illness",
    claimText: "Stop the flu before it stops you",
    claimLocation: "Slide 1 headline",
    explanation:
      "The headline speaks to the reader as a person at risk. It does not imply a current condition, so it is advisory, but softer wording avoids the question entirely.",
    suggestedRevision: "Flu season is here. We are ready.",
    aiSuggested: false,
    clientResponse: "Headline changed in version 2.",
    createdAt: AT(14, 10, 6),
  },
  {
    id: "fd-c2-checkups-1",
    submissionId: "sub-c2-checkups",
    versionNumber: 1,
    policyCode: "SAMPLE-META-PA-01",
    severity: "HIGH",
    requiredAction: "REVISE_CONTENT",
    status: "OPEN",
    issue: "Headline implies the reader's child has a health condition",
    claimText: "Is your child's asthma under control?",
    claimLocation: "Image headline",
    explanation:
      "Asking about 'your child's asthma' implies the viewer's child has asthma, which the sample personal-attributes rule prohibits. Describe the checkup instead of the condition.",
    suggestedRevision: "Back-to-school checkups and sports physicals, booked in minutes.",
    aiSuggested: true,
    clientResponse: null,
    createdAt: AT(22, 9, 40),
  },
];

export const DEMO_EVENTS: DemoEvent[] = [
  { id: "evt-1", submissionId: "sub-c1-flu", at: AT(13, 9, 10), actor: "client", title: "Version 1 submitted", detail: "Alex Morgan submitted the carousel for review." },
  { id: "evt-2", submissionId: "sub-c1-flu", at: AT(14, 9, 55), actor: "system", title: "Simulated AI scan completed", detail: "Checked against 4 sample policies. 1 suggestion.", simulated: true },
  { id: "evt-3", submissionId: "sub-c1-flu", at: AT(14, 10, 20), actor: "team", title: "Changes requested", detail: "2 findings published to the client (1 high, 1 low)." },
  { id: "evt-4", submissionId: "sub-c1-flu", at: AT(16, 14, 5), actor: "client", title: "Version 2 submitted", detail: "Wording revised and an effectiveness summary attached as evidence." },
  { id: "evt-5", submissionId: "sub-c1-flu", at: AT(17, 9, 45), actor: "team", title: "Review complete · Issues resolved", detail: "Internal human review only. Not platform or regulatory approval." },
  { id: "evt-6", submissionId: "sub-c1-telehealth", at: AT(28, 15, 30), actor: "client", title: "Version 1 submitted", detail: "Alex Morgan submitted the search ad copy for review." },
  { id: "evt-7", submissionId: "sub-c1-portal", at: AT(27, 11), actor: "client", title: "Version 1 submitted", detail: "Alex Morgan submitted the portal announcement." },
  { id: "evt-8", submissionId: "sub-c1-portal", at: AT(27, 16, 10), actor: "team", title: "Review started", detail: "A Clyntique reviewer opened the submission." },
  { id: "evt-9", submissionId: "sub-c2-checkups", at: AT(21, 10, 15), actor: "client", title: "Version 1 submitted", detail: "Jordan Lee submitted the feed image with a service description." },
  { id: "evt-10", submissionId: "sub-c2-checkups", at: AT(22, 9, 30), actor: "system", title: "Simulated AI scan completed", detail: "Checked against 4 sample policies. 1 suggestion.", simulated: true },
  { id: "evt-11", submissionId: "sub-c2-checkups", at: AT(22, 9, 50), actor: "team", title: "Changes requested", detail: "1 finding published to the client (1 high)." },
  { id: "evt-12", submissionId: "sub-c2-allergy", at: AT(29, 9, 45), actor: "client", title: "Version 1 submitted", detail: "Jordan Lee submitted the Reel for review." },
];

export const DEMO_MESSAGES: DemoMessage[] = [
  { id: "msg-c1-1", clientId: "client1", from: "team", body: "Hi Alex, we have published two findings on the flu shot carousel. The prevention wording is the one to fix first.", at: AT(14, 10, 25) },
  { id: "msg-c1-2", clientId: "client1", from: "client", body: "Thanks. Version 2 is up with the softer wording and the effectiveness summary attached.", at: AT(16, 14, 12) },
  { id: "msg-c1-3", clientId: "client1", from: "team", body: "Received. Version 2 looks good and the review is complete. The telehealth search ad is next in the queue.", at: AT(17, 9, 50) },
  { id: "msg-c2-1", clientId: "client2", from: "team", body: "Hi Jordan, the checkups headline implies a condition for the viewer's child. A suggested rewrite is on the finding.", at: AT(22, 9, 55) },
  { id: "msg-c2-2", clientId: "client2", from: "client", body: "Understood, we will revise the headline this week. Can you also look at the allergy Reel when it comes in?", at: AT(23, 8, 20) },
];

/** What the simulated scan "finds" per version. Deterministic, no model call. */
export const DEMO_SCAN_SCRIPTS: DemoScanScript[] = [
  {
    submissionId: "sub-c1-telehealth",
    versionNumber: 1,
    summary: "Two sample-policy matches in the search ad copy. One restricted term, one unsupported speed claim.",
    suggestions: [
      {
        id: "ai-telehealth-1",
        policyCode: "SAMPLE-GOOG-HC-01",
        severity: "HIGH",
        requiredAction: "CLARIFY",
        issue: "Prescription wording in restricted healthcare ad",
        claimText: "Prescription refills in minutes.",
        claimLocation: "Description line 1",
        explanation:
          "The sample Google healthcare rule restricts prescription-related terms in telehealth ads unless the advertiser holds the relevant certification. The copy mentions prescriptions directly.",
        suggestedRevision: "Follow-up visits and refill requests handled online.",
        confidence: 0.86,
      },
      {
        id: "ai-telehealth-2",
        policyCode: "SAMPLE-FTC-HC-01",
        severity: "MEDIUM",
        requiredAction: "PROVIDE_EVIDENCE",
        issue: "Timing claim without support",
        claimText: "Book online in 60 seconds.",
        claimLocation: "Description line 2",
        explanation:
          "A specific timing claim is objective and should be supportable. If booking typically takes longer, soften it or attach timing data.",
        suggestedRevision: "Book online in a few quick steps.",
        confidence: 0.64,
      },
    ],
  },
  {
    submissionId: "sub-c1-portal",
    versionNumber: 1,
    summary: "No sample-policy matches above the reporting threshold. Human review still required.",
    suggestions: [],
  },
  {
    submissionId: "sub-c2-allergy",
    versionNumber: 1,
    summary: "Two sample-policy matches in the Reel script: a cure claim and an undisclosed testimonial.",
    suggestions: [
      {
        id: "ai-allergy-1",
        policyCode: "SAMPLE-FTC-HC-01",
        severity: "HIGH",
        requiredAction: "REVISE_CONTENT",
        issue: "Cure claim in a testimonial",
        claimText: "Lakeview cured my son's allergies in one visit.",
        claimLocation: "Opening caption, 0:00–0:03",
        explanation:
          "A cure claim is an objective health claim. Allergies are managed rather than cured, so the sample rule treats this as unsupportable even inside a quotation.",
        suggestedRevision: "\"Lakeview helped us manage my son's allergies.\" — a Lakeview parent",
        confidence: 0.91,
      },
      {
        id: "ai-allergy-2",
        policyCode: "SAMPLE-DISC-01",
        severity: "MEDIUM",
        requiredAction: "CLARIFY",
        issue: "Testimonial without a disclosure",
        claimText: "— a Lakeview parent",
        claimLocation: "Opening caption attribution",
        explanation:
          "The quote is an endorsement. If the parent was compensated, or the result is not what a typical patient experiences, the ad needs a clear disclosure.",
        suggestedRevision: "Add: \"Individual experience. Results vary.\" and confirm no compensation was given.",
        confidence: 0.72,
      },
    ],
  },
];

export const SIMULATED_AI_LABEL = "Simulated AI result · sample policies · no model call";
export const SIMULATED_APPROVAL_LABEL =
  "Simulated approval · internal review only · not regulatory or platform approval";
