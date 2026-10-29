import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("YC Demo & Auth UX Improvements", () => {
  it("Login page has clickable Clyntique logo linking to / on desktop and mobile", () => {
    const loginSrc = readFileSync("src/app/auth/login/page.tsx", "utf8");
    // Desktop brand link
    expect(loginSrc).toMatch(/<Link[^>]+href="\/"[^>]*aria-label="Clyntique homepage"[^>]*>\s*<Brand size="lg"/);
    // Mobile brand link
    expect(loginSrc).toMatch(/<Link[^>]+href="\/"[^>]*aria-label="Clyntique homepage"[^>]*>\s*<Brand size="md"/);
    // Footer brand link
    expect(loginSrc).toMatch(/<Link[^>]+href="\/"[^>]*aria-label="Clyntique homepage"[^>]*>\s*<BrandMark/);
  });

  it("Signup page has clickable Clyntique logo linking to / on desktop and mobile", () => {
    const signupSrc = readFileSync("src/app/auth/signup/page.tsx", "utf8");
    // Desktop brand link
    expect(signupSrc).toMatch(/<Link[^>]+href="\/"[^>]*aria-label="Clyntique homepage"[^>]*>\s*<Brand size="lg"/);
    // Mobile brand link
    expect(signupSrc).toMatch(/<Link[^>]+href="\/"[^>]*aria-label="Clyntique homepage"[^>]*>\s*<Brand size="md"/);
    // Footer brand link
    expect(signupSrc).toMatch(/<Link[^>]+href="\/"[^>]*aria-label="Clyntique homepage"[^>]*>\s*<BrandMark/);
  });

  it("Login page features prominent YC Evaluator Try Demo option pointing to /demo", () => {
    const loginSrc = readFileSync("src/app/auth/login/page.tsx", "utf8");
    expect(loginSrc).toContain('href="/demo"');
    expect(loginSrc).toContain("YC Reviewer &amp; Partner Demo");
    expect(loginSrc).toContain("Try Interactive Demo");
  });

  it("Interactive YC demo component is completely isolated from production database", () => {
    const demoSrc = readFileSync("src/components/demo/interactive-yc-demo.tsx", "utf8");
    // Uses client-side React state only
    expect(demoSrc).toContain('"use client"');
    // Does not import prisma or server actions
    expect(demoSrc).not.toContain('@/lib/prisma');
    expect(demoSrc).not.toContain('prisma.');
    // Supports both Client and Team roles
    expect(demoSrc).toContain('role === "CLIENT"');
    expect(demoSrc).toContain('role === "TEAM"');
    // Covers the 5 core walkthrough stages
    expect(demoSrc).toContain("1. Submit Creative");
    expect(demoSrc).toContain("2. Attach Evidence");
    expect(demoSrc).toContain("3. AI Policy Pre-Screening");
    expect(demoSrc).toContain("4. Feedback &amp; Revisions");
    expect(demoSrc).toContain("5. Sign-Off &amp; Audit Trail");
  });
});
