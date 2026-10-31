import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compareSnapshots, canonical, paragraphsOf } from "@/lib/policy/monitoring/detect";
import { extractStatedDate, hashText, normalizeHtml, normalizePlainText, parseDate } from "@/lib/policy/monitoring/normalize";
import { classifyStatus, fixtureFetcher, isOfficialUrl, looksLikeChallenge, pageFromBody, sameLocation } from "@/lib/policy/monitoring/fetcher";

// Pure parts of policy source monitoring: no database, no network. The HTML
// fixtures are invented sample pages, not copies of any publisher's page.

const fixture = (name: string) => readFileSync(join(process.cwd(), "tests", "fixtures", "policy-monitoring", name), "utf8");
const V1 = fixture("sample-v1.html");
const V1_RESTYLED = fixture("sample-v1-restyled.html");
const V2 = fixture("sample-v2.html");

describe("normalizeHtml", () => {
  it("keeps headings and policy paragraphs, drops navigation, scripts, styles, cookie banners and footers", () => {
    const page = normalizeHtml(V1);
    expect(page.title).toBe("Sample Platform Advertising Standards: Health and wellness");
    expect(page.text).toContain("## Health and wellness");
    expect(page.text).toContain("## Prohibited claims");
    expect(page.text).toContain("Ads for weight loss products and services must be targeted to people aged 18 or over");
    expect(page.text).toContain("• Results attributed solely to a wearable device.");
    expect(page.text).toContain("person's appearance"); // entity decoded
    expect(page.text).not.toMatch(/dataLayer|display:flex|Accept all cookies|Privacy policy|Terms of use|Related: Personal attributes/);
    expect(page.text).not.toContain("Sign in");
    expect(page.truncated).toBe(false);
  });

  it("reads the page's own stated date and ignores dates in body text", () => {
    expect(normalizeHtml(V1).statedDate?.toISOString()).toBe("2026-03-03T00:00:00.000Z");
    expect(normalizeHtml(V2).statedDate?.toISOString()).toBe("2026-10-14T00:00:00.000Z");
    expect(extractStatedDate("Effective July 26, 2023. Some text mentioning January 1, 2020.")?.toISOString()).toBe("2023-07-26T00:00:00.000Z");
    expect(extractStatedDate("The notice was published on 2023-07-26 in the register.")?.toISOString()).toBe("2023-07-26T00:00:00.000Z");
    expect(extractStatedDate("In 2024 the platform changed its rules on January 5, 2024.")).toBeNull();
    expect(parseDate("31 December 2025")?.toISOString()).toBe("2025-12-31T00:00:00.000Z");
    expect(parseDate("02/30/2026")).toBeNull();
  });

  it("produces the same text and hash for the same policy text under a new layout", () => {
    const a = normalizeHtml(V1);
    const b = normalizeHtml(V1_RESTYLED);
    expect(hashText(a.text)).toBe(hashText(b.text));
  });

  it("normalizes plain text by whitespace only", () => {
    const page = normalizePlainText("Line one   \r\n\r\n   Line two\tdone\n");
    expect(page.text).toBe("Line one\nLine two done");
  });
});

describe("compareSnapshots", () => {
  const snap = (html: string) => {
    const page = normalizeHtml(html);
    return { text: page.text, statedDate: page.statedDate };
  };

  it("reports no meaningful change for a restyled page", () => {
    const c = compareSnapshots(snap(V1), snap(V1_RESTYLED));
    expect(c.meaningful).toBe(false);
    expect(c.added).toEqual([]);
    expect(c.removed).toEqual([]);
    expect(c.summary).toMatch(/Only formatting or boilerplate changed/);
  });

  it("names the reworded paragraph, the new bullet, the new section and the new stated date", () => {
    const c = compareSnapshots(snap(V1), snap(V2));
    expect(c.meaningful).toBe(true);
    expect(c.removed.map((d) => d.text)).toEqual(["Ads must not shame a person's appearance or body parts, and must not show close-up images of pinched fat."]);
    expect(c.added.map((d) => d.text)).toEqual([
      "Ads must not shame a person's appearance or body parts, must not show close-up images of pinched fat, and must not show before-and-after images of weight loss.",
      "• Claims that a prescription medicine is available without a prescription.",
      "Advertisers who repeatedly violate this policy may lose advertising access.",
    ]);
    expect(c.added.map((d) => d.section)).toEqual(["Policy details", "Prohibited claims", "Enforcement"]);
    expect(c.sectionsAdded).toEqual(["Enforcement"]);
    expect(c.sectionsRemoved).toEqual([]);
    expect(c.statedDateChanged).toBe(true);
    expect(c.summary).toBe('3 paragraphs added, 1 paragraph removed under "Policy details", "Prohibited claims", "Enforcement". New section: "Enforcement". Stated page date changed from 2026-03-03 to 2026-10-14.');
  });

  it("treats the first snapshot as a baseline and ignores short fragments and punctuation-only edits", () => {
    expect(compareSnapshots(null, snap(V1)).meaningful).toBe(false);
    expect(canonical("Ads must NOT promise results!")).toBe("ads must not promise results");
    expect(paragraphsOf("## Heading\nshort\nA paragraph that is long enough to count as content.").map((p) => p.key)).toEqual(["h:heading", "p:a paragraph that is long enough to count as content"]);
    const c = compareSnapshots({ text: "A paragraph that is long enough to count as content.", statedDate: null }, { text: "A paragraph, that is long enough to count as content!", statedDate: null });
    expect(c.meaningful).toBe(false);
  });
});

describe("fetcher helpers", () => {
  it("accepts only https URLs on known official domains", () => {
    expect(isOfficialUrl("https://transparency.meta.com/policies/ad-standards/")).toBe(true);
    expect(isOfficialUrl("https://support.google.com/adspolicy/answer/176031")).toBe(true);
    expect(isOfficialUrl("https://www.ftc.gov/business-guidance")).toBe(true);
    expect(isOfficialUrl("http://transparency.meta.com/policies")).toBe(false);
    expect(isOfficialUrl("https://meta.com.evil.example/policies")).toBe(false);
    expect(isOfficialUrl("https://example.org/policy")).toBe(false);
    expect(isOfficialUrl("not a url")).toBe(false);
  });

  it("recognises the same page behind scheme, www, trailing slash and tracking parameters", () => {
    expect(sameLocation("https://www.ftc.gov/a/", "https://ftc.gov/a?utm_source=x")).toBe(true);
    expect(sameLocation("https://support.google.com/adspolicy/answer/176031?hl=en", "https://support.google.com/adspolicy/answer/176031")).toBe(true);
    expect(sameLocation("https://transparency.meta.com/a", "https://transparency.meta.com/b")).toBe(false);
  });

  it("classifies HTTP statuses and bot challenges without retrying", () => {
    expect(classifyStatus(200)).toBe("OK");
    expect(classifyStatus(404)).toBe("NOT_FOUND");
    expect(classifyStatus(410)).toBe("NOT_FOUND");
    expect(classifyStatus(403)).toBe("BLOCKED");
    expect(classifyStatus(429)).toBe("BLOCKED");
    expect(classifyStatus(500)).toBe("ERROR");
    expect(looksLikeChallenge(fixture("challenge.html"))).toBe(true);
    expect(looksLikeChallenge(V1)).toBe(false);
    const blocked = pageFromBody({ status: 200, finalUrl: "https://ads.tiktok.com/x", requestedUrl: "https://ads.tiktok.com/x", contentType: "text/html", body: fixture("challenge.html") });
    expect(blocked.outcome).toBe("BLOCKED");
    expect(blocked.contentHash).toBeNull();
  });

  it("marks a redirect to a different page and hashes binary documents by bytes", () => {
    const redirected = pageFromBody({ status: 200, finalUrl: "https://transparency.meta.com/policies/other", requestedUrl: "https://transparency.meta.com/policies/one", contentType: "text/html", body: V1 });
    expect(redirected.outcome).toBe("REDIRECTED");
    expect(redirected.contentHash).toBe(hashText(normalizeHtml(V1).text));
    const pdf = pageFromBody({ status: 200, finalUrl: "https://mohap.gov.ae/x.pdf", requestedUrl: "https://mohap.gov.ae/x.pdf", contentType: "application/pdf", body: new Uint8Array([0x25, 0x50, 0x44, 0x46]) });
    expect(pdf.outcome).toBe("OK");
    expect(pdf.text).toMatch(/binary document: application\/pdf, 4 bytes/);
    expect(pdf.contentHash).toHaveLength(64);
  });

  it("the fixture fetcher never answers for a non-official URL and simulates failures", async () => {
    const f = fixtureFetcher({ "https://www.ftc.gov/a": { body: V1 }, "https://www.ftc.gov/down": { networkError: "ECONNRESET" } });
    expect((await f.fetch("https://example.org/a")).outcome).toBe("SKIPPED");
    expect((await f.fetch("https://www.ftc.gov/a")).outcome).toBe("OK");
    expect((await f.fetch("https://www.ftc.gov/down")).outcome).toBe("UNREACHABLE");
    expect((await f.fetch("https://www.ftc.gov/unknown")).outcome).toBe("UNREACHABLE");
    expect(f.calls).toEqual(["https://www.ftc.gov/a", "https://www.ftc.gov/down", "https://www.ftc.gov/unknown"]);
  });
});
