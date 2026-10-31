import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

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

  it("Interactive demo components are completely isolated from Production (no database, AI, storage or auth)", () => {
    const dir = "src/components/demo";
    const files = readdirSync(dir).filter((f) => f.endsWith(".tsx")).map((f) => readFileSync(`${dir}/${f}`, "utf8"));
    const libFiles = readdirSync("src/lib/demo").map((f) => readFileSync(`src/lib/demo/${f}`, "utf8"));
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const src of files) {
      // Client-side React state only
      expect(src).toContain('"use client"');
    }
    for (const src of [...files, ...libFiles]) {
      // No database, server actions, AI provider, Blob storage or auth imports
      expect(src).not.toContain("@/lib/prisma");
      expect(src).not.toContain("prisma.");
      expect(src).not.toContain('"use server"');
      expect(src).not.toContain("@/lib/ai/");
      expect(src).not.toContain("@/lib/auth/");
      expect(src).not.toContain("@/lib/review/");
      expect(src).not.toContain("@vercel/blob");
      expect(src).not.toMatch(/fetch\(/);
    }
    // Three role-based experiences, chosen without credentials
    const chooser = readFileSync(`${dir}/role-chooser.tsx`, "utf8");
    expect(chooser).toContain("Explore as Client 1");
    expect(chooser).toContain("Explore as Client 2");
    expect(chooser).toContain("Explore as Team");
    expect(chooser).toContain("No sign-in needed");
    // Simulated results and approvals are labelled
    const data = readFileSync("src/lib/demo/data.ts", "utf8");
    expect(data).toContain("Simulated AI result");
    expect(data).toContain("Simulated approval");
  });

  it("Homepage links to /demo and keeps the real Login entry points", () => {
    const navbar = readFileSync("src/components/marketing/navbar.tsx", "utf8");
    expect(navbar).toContain('href="/demo"');
    expect(navbar).toContain("Explore Demo");
    expect(navbar).toContain('href="/auth/login"');
    expect(navbar).toContain("Sign In");
    const hero = readFileSync("src/components/marketing/hero-section.tsx", "utf8");
    expect(hero).toContain('href="/demo"');
    const cta = readFileSync("src/components/marketing/final-cta-section.tsx", "utf8");
    expect(cta).toContain('href="/demo"');
    expect(cta).toContain('href="/auth/login"');
  });
});
