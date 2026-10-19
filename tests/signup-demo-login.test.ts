import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@/generated/prisma/client";
import { createPrismaMock, form, type PrismaMock } from "./helpers";
import { validateSignup, passwordProblem } from "@/lib/auth/registration";
import { demoLoginEnabled } from "@/lib/auth/demo-config";
import { isPolicyAdmin } from "@/lib/policy/auth";
import { SESSION_COOKIE, encodeSession, decodeSession } from "@/lib/auth/session-token";

// Client self-registration and quick demo login. Prisma, cookies and headers
// are mocked; no test touches a database.
const h = vi.hoisted(() => ({
  prisma: null as unknown as PrismaMock,
  createSession: vi.fn(async (payload: unknown) => void payload),
  session: null as null | { userId: string; role: "TEAM" | "CLIENT"; demo?: true },
}));
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth/session", () => ({
  createSession: h.createSession,
  deleteSession: vi.fn(),
  getSession: async () => h.session,
}));

const { signup, demoLogin } = await import("@/app/auth/actions");
const { getCurrentUser } = await import("@/lib/auth/dal");
const { proxy } = await import("@/proxy");

const STRONG = "Clinic-review-2026";

beforeEach(() => {
  h.prisma = createPrismaMock();
  h.createSession.mockClear();
  h.session = null;
  vi.unstubAllEnvs();
});

describe("signup validation", () => {
  it("accepts a valid client registration and normalises the email", () => {
    const r = validateSignup({ name: "  Dr  Sam Rivera ", email: " Sam@Clinic.Example ", password: STRONG, confirmPassword: STRONG });
    expect(r).toEqual({ ok: true, data: { name: "Dr Sam Rivera", email: "sam@clinic.example", password: STRONG } });
  });

  it("enforces password rules", () => {
    expect(passwordProblem("short1")).toMatch(/at least 12/);
    expect(passwordProblem("onlyletterslong")).toMatch(/letter and one number/);
    expect(passwordProblem("password1234")).toMatch(/too easy/);
    expect(passwordProblem("samrivera2026x", "samrivera@clinic.example")).toMatch(/email address/);
    expect(passwordProblem("x".repeat(120) + "123456789")).toMatch(/at most/);
    // bcrypt only uses 72 bytes: longer passwords (in bytes, not characters) are refused, not silently truncated.
    expect(passwordProblem("a1" + "é".repeat(40))).toMatch(/at most/);
    expect(passwordProblem("a1" + "b".repeat(70))).toBeNull();
    expect(passwordProblem(STRONG)).toBeNull();
  });

  it("rejects mismatched confirmation, bad emails and Clyntique domains", () => {
    const mismatch = validateSignup({ name: "Sam", email: "sam@clinic.example", password: STRONG, confirmPassword: STRONG + "x" });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.fieldErrors.confirmPassword).toBeTruthy();

    const bad = validateSignup({ name: "Sam", email: "not-an-email", password: STRONG, confirmPassword: STRONG });
    expect(bad.ok).toBe(false);

    for (const email of ["new@clyntique.demo", "boss@clyntique.com", "x@team.clyntique.com"]) {
      const reserved = validateSignup({ name: "Sam", email, password: STRONG, confirmPassword: STRONG });
      expect(reserved.ok).toBe(false);
      if (!reserved.ok) expect(reserved.fieldErrors.email).toMatch(/can't be used/);
    }
  });
});

describe("signup action", () => {
  const valid = { name: "Dr Sam Rivera", email: "sam@clinic.example", password: STRONG, confirmPassword: STRONG };

  it("is off unless CLIENT_SIGNUP=enabled, and writes nothing", async () => {
    const res = await signup(undefined, form(valid));
    expect(res?.error).toMatch(/isn't open/);
    expect(h.prisma.user.create).not.toHaveBeenCalled();
    expect(h.createSession).not.toHaveBeenCalled();
  });

  it("creates a CLIENT with a bcrypt hash, then signs in", async () => {
    vi.stubEnv("CLIENT_SIGNUP", "enabled");
    h.prisma.user.create.mockResolvedValueOnce({ id: "u-new", role: "CLIENT" });
    // A browser trying to pick its own role is ignored.
    const res = await signup(undefined, form({ ...valid, role: "TEAM" }));
    expect(res).toEqual({ signedIn: true });
    const data = h.prisma.user.create.mock.calls[0][0].data;
    expect(data.role).toBe("CLIENT");
    expect(data.email).toBe("sam@clinic.example");
    expect(data.passwordHash).not.toContain(STRONG);
    expect(await bcrypt.compare(STRONG, data.passwordHash)).toBe(true);
    expect(h.createSession).toHaveBeenCalledWith({ userId: "u-new", role: "CLIENT" });
  });

  it("refuses a duplicate email (existing row or a concurrent insert) without echoing the password", async () => {
    vi.stubEnv("CLIENT_SIGNUP", "enabled");
    h.prisma.user.findUnique.mockResolvedValueOnce({ id: "u-existing" });
    const dup = await signup(undefined, form(valid));
    expect(dup?.fieldErrors?.email).toMatch(/already exists/);
    expect(JSON.stringify(dup)).not.toContain(STRONG);
    expect(h.prisma.user.create).not.toHaveBeenCalled();

    h.prisma.user.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "7" }));
    const race = await signup(undefined, form(valid));
    expect(race?.fieldErrors?.email).toMatch(/already exists/);
    expect(h.createSession).not.toHaveBeenCalled();
  });

  it("is always rate limited (even with LOGIN_RATE_LIMIT off) and every sign-up counts", async () => {
    vi.stubEnv("CLIENT_SIGNUP", "enabled");
    h.prisma.user.create.mockResolvedValueOnce({ id: "u-new", role: "CLIENT" });
    expect(await signup(undefined, form(valid))).toEqual({ signedIn: true });
    expect(h.prisma.loginAttempt.createManyAndReturn).toHaveBeenCalledTimes(1);
    // A successful sign-up is not marked succeeded, so it still counts towards the limit.
    expect(h.prisma.loginAttempt.updateMany).not.toHaveBeenCalled();

    h.prisma.loginAttempt.count.mockResolvedValue(21); // over the per-address limit
    const blocked = await signup(undefined, form({ ...valid, email: "other@clinic.example" }));
    expect(blocked?.error).toMatch(/Too many attempts/);
    expect(h.prisma.user.create).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the limiter is unavailable", async () => {
    vi.stubEnv("CLIENT_SIGNUP", "enabled");
    h.prisma.loginAttempt.createManyAndReturn.mockRejectedValueOnce(new Error("relation does not exist"));
    const res = await signup(undefined, form(valid));
    expect(res?.error).toMatch(/temporarily unavailable/);
    expect(h.prisma.user.create).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid input", async () => {
    vi.stubEnv("CLIENT_SIGNUP", "enabled");
    const res = await signup(undefined, form({ ...valid, password: "weak" , confirmPassword: "weak" }));
    expect(res?.fieldErrors?.password).toBeTruthy();
    expect(h.prisma.user.create).not.toHaveBeenCalled();
  });
});

describe("quick demo login", () => {
  it("is off by default and always off on Vercel Production", () => {
    expect(demoLoginEnabled({})).toBe(false);
    expect(demoLoginEnabled({ DEMO_LOGIN: "enabled" })).toBe(true);
    expect(demoLoginEnabled({ DEMO_LOGIN: "enabled", VERCEL_ENV: "preview" })).toBe(true);
    expect(demoLoginEnabled({ DEMO_LOGIN: "enabled", VERCEL_ENV: "production" })).toBe(false);
  });

  it("refuses when disabled and for unknown accounts", async () => {
    expect((await demoLogin(undefined, form({ account: "team" })))?.error).toMatch(/not available/);
    vi.stubEnv("DEMO_LOGIN", "enabled");
    expect((await demoLogin(undefined, form({ account: "admin" })))?.error).toMatch(/Choose a demo account/);
    expect(h.createSession).not.toHaveBeenCalled();
  });

  it("signs in to the fixed account by email AND role, marking the session as demo", async () => {
    vi.stubEnv("DEMO_LOGIN", "enabled");
    h.prisma.user.findFirst.mockResolvedValueOnce({ id: "u-client2", role: "CLIENT" });
    const res = await demoLogin(undefined, form({ account: "client2" }));
    expect(res).toEqual({ signedIn: true });
    expect(h.prisma.user.findFirst.mock.calls[0][0].where).toEqual({ email: "client2@clyntique.demo", role: "CLIENT" });
    expect(h.createSession).toHaveBeenCalledWith({ userId: "u-client2", role: "CLIENT", demo: true });
  });

  it("reports a missing demo account instead of signing in", async () => {
    vi.stubEnv("DEMO_LOGIN", "enabled");
    const res = await demoLogin(undefined, form({ account: "team" }));
    expect(res?.error).toMatch(/isn't set up/);
    expect(h.createSession).not.toHaveBeenCalled();
  });

  it("demo sessions never get policy administration and end when the flag is off", async () => {
    vi.stubEnv("DEMO_LOGIN", "enabled");
    h.session = { userId: "u-team", role: "TEAM", demo: true };
    h.prisma.user.findUnique.mockResolvedValue({ id: "u-team", name: "Team", email: "team@clyntique.demo", role: "TEAM", isPolicyAdmin: true });
    const user = await getCurrentUser();
    expect(user?.demoSession).toBe(true);
    expect(user && isPolicyAdmin(user)).toBe(false);

    vi.stubEnv("DEMO_LOGIN", "");
    expect(await getCurrentUser()).toBeNull();
  });

  it("the session token round-trips the demo flag", async () => {
    const token = await encodeSession({ userId: "u1", role: "CLIENT", demo: true }, new Date(Date.now() + 60_000));
    expect(await decodeSession(token)).toEqual({ userId: "u1", role: "CLIENT", demo: true });
    const normal = await encodeSession({ userId: "u1", role: "CLIENT" }, new Date(Date.now() + 60_000));
    expect(await decodeSession(normal)).toEqual({ userId: "u1", role: "CLIENT" });
  });
});

describe("proxy with signup and demo sessions", () => {
  async function req(path: string, payload?: { role: "TEAM" | "CLIENT"; demo?: true }) {
    const headers = new Headers();
    if (payload) {
      const token = await encodeSession({ userId: "u1", ...payload }, new Date(Date.now() + 60_000));
      headers.set("cookie", `${SESSION_COOKIE}=${token}`);
    }
    return proxy(new NextRequest(new URL(path, "http://localhost:3000"), { headers }));
  }
  const loc = (res: Response) => res.headers.get("location") && new URL(res.headers.get("location")!).pathname;

  it("lets signed-out users open sign-up and sends signed-in users home", async () => {
    expect(loc(await req("/auth/signup"))).toBeNull();
    expect(loc(await req("/auth/signup", { role: "CLIENT" }))).toBe("/dashboard");
  });

  it("treats a demo session as signed out once demo login is off, and clears the cookie", async () => {
    vi.stubEnv("DEMO_LOGIN", "enabled");
    expect(loc(await req("/admin", { role: "TEAM", demo: true }))).toBeNull();
    vi.stubEnv("DEMO_LOGIN", "");
    const res = await req("/admin", { role: "TEAM", demo: true });
    expect(loc(res)).toBe("/auth/login");
    expect(res.headers.get("set-cookie")).toContain(`${SESSION_COOKIE}=;`);
    // And the login page no longer bounces it back to /admin.
    expect(loc(await req("/auth/login", { role: "TEAM", demo: true }))).toBeNull();
  });
});
