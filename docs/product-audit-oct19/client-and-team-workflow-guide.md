# How Clyntique works today: Client and Team guide

This guide describes the application as it actually is on `demo/integration-oct22` @ `a0c90d2` (the same code as `main`), written for Deepanshi, the internal team and future human reviewers. Where something isn't built yet, the guide says so.

Clyntique has two kinds of account:

- **Client**: the advertiser (for the pilot, a doctor or their practice). Clients submit ads and fix what the reviewer raises.
- **Team**: Clyntique's human reviewers. They review submissions and record decisions. Some Team members are also **policy administrators**, who manage the Policy Library.

Every review result in Clyntique is an **internal human review**. It is not legal advice, not government approval, and not acceptance by any advertising platform. The app shows this sentence with every outcome.

## The journey in one picture

```
Client: draft ──submit──> Team: review ──request changes──> Client: fix & resubmit ──> Team: review again ──complete──> Outcome
         (private)          (AI scan + findings)              (responses, new version,      (resolve findings)        (internal only)
                                                               evidence)
```

Statuses you will see: **Draft**, **Submitted** (waiting for a reviewer), **In review**, **Changes requested**, **Review complete**.

---

## Part 1: For Clients

### 1. Getting an account

- A Team member creates your account, or, where sign-up is switched on, you create one at **Create a client account** on the sign-in page. You can't sign up as Team.
- Passwords must be at least 12 characters with a letter and a number.

### 2. Your overview

After signing in you land on **Overview**. It shows what needs your action, what is with Clyntique, and recently completed reviews. The left menu has **Overview**, **Submissions**, **Projects** and **Activity**.

- **Projects** are created by the Clyntique Team and assigned to you (for example, one per campaign or clinic). You can only see your own projects and submissions. Another client never sees yours.

### 3. Create a submission (draft)

1. Go to **Submissions** and start a new submission in one of your projects.
2. Fill in the title, description (what the ad shows and says), campaign context, and creative type (feed, story, static or video).
3. Choose **Target markets** (countries or regions) and **Advertising platforms** (Meta, TikTok, Google, Snapchat, LinkedIn, X, Other). Choosing them doesn't mean their rules have been checked; it tells the reviewer where the ad will run.
4. **Upload the creative**: an image (JPEG, PNG, WebP) or a video (MP4, WebM).
5. Optionally **Add supporting evidence**: a file (PDF or image, up to 10 MB) or a link, with a title and what it supports.
6. Click **Save draft**.

While it is a draft, **only you can see it**. The Clyntique Team can't see drafts, their titles or their files.

### 4. Submit for review

When it is ready, click submit. Clyntique checks you have a file, at least one market and at least one platform. The status becomes **Submitted**, and the Team now sees exactly what you submitted at that moment.

While your submission is **Submitted** or **In review**, you can view it but not change it. (A note-to-reviewer during review isn't available yet.)

### 5. When changes are requested

If the reviewer finds issues, the status becomes **Changes requested** and the submission appears under **Your changes needed**. Each **finding** shows:

- the issue and why it matters for your markets and platforms,
- a reviewer-assessed severity (High, Medium, Low, Advisory),
- what you need to do: **Revise the creative**, **Provide evidence**, **Clarify**, or **Acknowledge**,
- where linked, the policy rule it is based on.

For each finding:

1. Click **Respond** and explain what you changed or why.
2. If asked to revise, **Upload a revised version** (it becomes version 2, 3, …). Say what changed.
3. If asked for evidence, add it and link it to that finding.

When every finding has what it needs, **Resubmit**. Clyntique tells you what is still missing if you try too early.

### 6. The outcome

When the reviewer completes the review, you see one of:

- **No issues identified**: the reviewer found no issues in the reviewed version, within the stated scope.
- **Issues resolved**: issues were raised and the reviewer judged them all resolved.
- **Completed with open issues**: the review closed with issues still unresolved.
- **Not reviewable**: the review couldn't be completed with what was provided.

Read the scope note: it says which markets, platforms and materials were covered. Remember the outcome is an internal review, not platform or regulator approval.

### 7. History

The submission page keeps the full history: every version, every round, every response and decision. **Activity** shows a timeline across your projects. Pages refresh by themselves about every 30 seconds.

### What clients can't do yet

- Run the AI check themselves before submitting.
- Submit a landing page or website for review (only image/video files).
- Record that the ad was submitted to a platform or regulator, or what they decided.
- Download a compliance passport.
- Chat with the reviewer (built, not yet switched on).

---

## Part 2: For the Team (human reviewers)

### 1. Your overview

The Team **Overview** shows the review queue counts, submissions waiting on clients, recently completed reviews, and the number of approved policy rules. The left menu adds **Review queue** and **Policy library**.

### 2. Projects and clients

Under **Projects**, create a project and assign it to a client. You can't create submissions for a client; the client submits.

### 3. Pick up a submission

1. Open **Review queue**. Submissions waiting longest come first.
2. Open one and click **Start review**. The status becomes **In review** for the client.

You see only what the client submitted: their submitted title, description, context, file and shared evidence. You never see their drafts or unsubmitted edits.

### 4. Run the AI scan (optional, assists you)

In the AI panel, run the scan. What happens:

- Clyntique selects only policy rules that are **active, verified by a second policy administrator, in effect today, backed by verified sources, and applicable** to the submission's markets, platforms and industry.
- If no rule qualifies, the AI isn't asked at all, and you see **"Insufficient policy coverage — manual review required."** Today, with no approved rules in the Production library, this is what you will see. It means: review manually.
- If rules qualify, the AI may suggest findings. Each suggestion cites a rule; the citation comes from the library, not from the AI.
- **Accept Finding** turns a suggestion into a **draft finding** (visible only to the Team) linked to the exact rule version. Nothing is shown to the client until you publish.
- If the scan fails, you see **"AI scan failed — manual review required."** It never means "no issues".

The AI never decides. You do.

### 5. Record findings

For each issue, add a finding: issue, explanation (why it matters for these markets and platforms), severity, required action, and what the client should do. You can link it to markets and platforms. Findings stay **Draft** (Team-only) until you request changes, which publishes them. You can edit or withdraw draft findings. A review can't be completed while any draft finding remains: publish it (by requesting changes) or withdraw it first. You can add internal (Team-only) evidence.

### 6. Request changes

Click **Request changes** with a summary. Draft findings are published to the client and the status becomes **Changes requested**.

### 7. Review the resubmission

When the client resubmits, the submission returns to your queue as a new round. You see their responses per finding, the new version (compare it with the previous one) and new evidence. For each finding: **Resolve finding** (with a note on why), **Reopen finding**, or **Withdraw finding** (with a reason). Request changes again if needed.

### 8. Complete the review

Click **Complete review**, choose the outcome, write a summary and the scope note (which markets, platforms and materials you covered). Clyntique checks the outcome matches the findings (for example, "Issues resolved" needs at least one resolved finding and every non-advisory finding resolved or withdrawn; "No issues identified" is only allowed when no findings were recorded). The decision is tied to that exact round and version and can't be edited. The review is then closed; reopening a completed review isn't possible yet.

### 9. Policy Library (policy administrators)

- Create a rule (code, title, authority type, jurisdiction, platform, industry, category) with its first version: summary, explanation, remediation, applicability, exceptions, effective dates, and source citations (section, link, excerpt).
- Verify each source against the official publication.
- A **different** policy administrator must approve a version before it becomes active (maker-checker). You can't approve your own.
- Propose a new version to change a rule; old versions are kept. Retire rules that no longer apply.
- Do not import the research candidates; they contain known source errors and the import is switched off.

### Rules every reviewer follows

- Never describe an outcome as approval, clearance or compliance certification.
- Never invent a rule, source or external outcome.
- When there is no verified rule, review manually and say so.
- Don't ask clients for information through anything other than findings (chat, when it arrives, never changes a review).

---

## Not built yet (both roles)

Submission to platforms/regulators and their outcomes, Compliance Passport, monitoring of policy changes, impact analysis, re-review of completed work, landing-page review, client AI pre-check, email notifications, reviewer assignment. See `missing-core-features.md` and `complete-mvp-roadmap.md`.
