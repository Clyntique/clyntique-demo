import { describe, expect, it } from "vitest";
import nextConfig, { contentSecurityPolicy } from "../next.config";

describe("security headers", () => {
  it("applies the security headers to every path and the CSP to everything except /api/media", async () => {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*")!;
    const keys = all.headers.map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining(["X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]),
    );
    const csp = rules.find((r) => r.headers.some((h) => h.key === "Content-Security-Policy"))!;
    // next.config sources are path-to-regexp; this one is a plain regex group.
    const pattern = new RegExp(`^${csp.source}$`);
    expect(pattern.test("/dashboard")).toBe(true);
    expect(pattern.test("/api/creatives/upload")).toBe(true);
    expect(pattern.test("/api/media/abc")).toBe(false);
  });

  it("forbids framing, plugins and foreign scripts", () => {
    expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
    expect(contentSecurityPolicy).toContain("object-src 'none'");
    expect(contentSecurityPolicy).toMatch(/script-src 'self' 'unsafe-inline'(;| 'unsafe-eval')/);
    expect(contentSecurityPolicy).not.toMatch(/script-src[^;]*https?:/);
  });

  it("does not advertise the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
