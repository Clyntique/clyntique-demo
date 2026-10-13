import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CurrentUser } from "@/lib/auth/dal";
import { CLIENT_A, TEAM } from "./helpers";

// Sign-in and sign-out start a fresh browser document and clear the browser's
// cache of the previous account's pages. Session and user lookup are mocked.
const h = vi.hoisted(() => ({
  user: null as CurrentUser | null,
  deleteSession: vi.fn(async () => {}),
}));
vi.mock("@/lib/auth/session", () => ({ deleteSession: h.deleteSession }));
vi.mock("@/lib/auth/dal", () => ({
  getCurrentUser: vi.fn(async () => h.user),
  homePathFor: (role: string) => (role === "TEAM" ? "/admin" : "/dashboard"),
}));

const logout = await import("@/app/auth/logout/route");
const resume = await import("@/app/auth/continue/route");

const ORIGIN = "https://app.example.test";

beforeEach(() => {
  h.user = null;
  h.deleteSession.mockClear();
});

describe("POST /auth/logout", () => {
  it("ends the session and redirects to sign-in as a new document, clearing the browser cache", async () => {
    const res = await logout.POST(new NextRequest(`${ORIGIN}/auth/logout`, { method: "POST", headers: { origin: ORIGIN } }));
    expect(h.deleteSession).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/auth/login`);
    expect(res.headers.get("clear-site-data")).toBe('"cache"');
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a cross-site form and keeps the session", async () => {
    const res = await logout.POST(new NextRequest(`${ORIGIN}/auth/logout`, { method: "POST", headers: { origin: "https://evil.example.test" } }));
    expect(res.status).toBe(403);
    expect(h.deleteSession).not.toHaveBeenCalled();
  });
});

describe("GET /auth/continue", () => {
  it("sends each role to its own home, clearing the browser cache", async () => {
    h.user = TEAM;
    const team = await resume.GET(new NextRequest(`${ORIGIN}/auth/continue`));
    expect(team.status).toBe(303);
    expect(team.headers.get("location")).toBe(`${ORIGIN}/admin`);
    expect(team.headers.get("clear-site-data")).toBe('"cache"');

    h.user = CLIENT_A;
    const client = await resume.GET(new NextRequest(`${ORIGIN}/auth/continue`));
    expect(client.headers.get("location")).toBe(`${ORIGIN}/dashboard`);
  });

  it("without a session, goes back to sign-in", async () => {
    const res = await resume.GET(new NextRequest(`${ORIGIN}/auth/continue`));
    expect(res.headers.get("location")).toBe(`${ORIGIN}/auth/login`);
  });
});
