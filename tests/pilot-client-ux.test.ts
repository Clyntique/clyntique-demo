import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Pilot Client UX Improvements", () => {
  it("Tabs component listens to hash changes for deep linking to findings and evidence", () => {
    const tabsSrc = readFileSync("src/components/workspace/tabs.tsx", "utf8");
    expect(tabsSrc).toContain("window.addEventListener(\"hashchange\"");
    expect(tabsSrc).toContain("hash.startsWith(\"#evidence\")");
    expect(tabsSrc).toContain("hash.startsWith(\"#finding\")");
  });

  it("FindingsList provides unique id and scroll margin for each finding", () => {
    const findingsSrc = readFileSync("src/components/submissions/findings-list.tsx", "utf8");
    expect(findingsSrc).toContain("id={`finding-${f.id}`}");
    expect(findingsSrc).toContain("scroll-mt-6");
  });

  it("SubmitPanel provides actionable jump links for missing requirements", () => {
    const submitSrc = readFileSync("src/components/submissions/submit-panel.tsx", "utf8");
    expect(submitSrc).toContain('href="#upload"');
    expect(submitSrc).toContain('href="#details"');
  });

  it("ResubmitPanel provides direct fix jump links for incomplete checklist items", () => {
    const resubmitSrc = readFileSync("src/components/submissions/client-remediation.tsx", "utf8");
    expect(resubmitSrc).toContain("href={`#finding-${item.key}`}");
  });

  it("EvidenceForm and VersionUploader provide clear file buttons", () => {
    const evidenceSrc = readFileSync("src/components/submissions/client-remediation.tsx", "utf8");
    expect(evidenceSrc).toContain("Clear selected file");
    const uploaderSrc = readFileSync("src/components/review/version-uploader.tsx", "utf8");
    expect(uploaderSrc).toContain("Clear selected file");
  });

  it("NewSubmissionView and ProjectsView provide actionable paths for clients without projects", () => {
    const newSubSrc = readFileSync("src/components/views/new-submission-view.tsx", "utf8");
    expect(newSubSrc).toContain('href="/dashboard/messages/new"');
    expect(newSubSrc).toContain("Message account team");

    const projectsSrc = readFileSync("src/components/views/projects-view.tsx", "utf8");
    expect(projectsSrc).toContain('href="/dashboard/messages/new"');
  });
});
