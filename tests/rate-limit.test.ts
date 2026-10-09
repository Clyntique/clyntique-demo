import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPrismaMock, form, type PrismaMock } from "./helpers";

const h = vi.hoisted(() => ({ prisma: null as unknown as PrismaMock, headers: new Headers() }));
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));
vi.mock("next/headers", () => ({ headers: async () => h.headers }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT ${path}`);
  },
}));
vi.mock("@/lib/auth/session", () => ({ createSession: vi.fn(), deleteSession: vi.fn() }));
vi.mock("@/lib/auth/password", () => ({
  hashPassword: vi.fn(async () => "dummy-hash"),
  verifyPassword: vi.fn(async (password: string) => password === "correct-password"),
}));
vi.mock("@/lib/auth/dal", () => ({ homePathFor: (role: string) => (role === "TEAM" ? "/admin" : "/dashboard") }));

const rl = await import("@/lib/auth/rate-limit");
const { login } = await import("@/app/auth/actions");

beforeEach(() => {
  h.prisma = createPrismaMock();
  h.headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
  vi.stubEnv("LOGIN_RATE_LIMIT", "");
});

describe("keys are private", () => {
  it("never contain the email or address, differ by scope, and are stable", () => {
    const keys = rl.keysFor("Person@Example.com", "203.0.113.7");
    for (const key of Object.values(keys)) {
      expect(key).not.toMatch(/person|example|203\.0/i);
      expect(key).toMatch(/^(emailIp|email|ip):[0-9a-f]{64}$/);
    }
    expect(new Set(Object.values(keys)).size).toBe(3);
    expect(rl.keysFor("person@example.com ", "203.0.113.7")).toEqual(keys); // normalised
  });

  it("uses the first x-forwarded-for address", () => {
    expect(rl.clientAddress(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(rl.clientAddress(new Headers())).toBe("unknown");
  });
});

describe("beginAttempt", () => {
  it("records the attempt before counting, so concurrent attempts see each other", async () => {
    const order: string[] = [];
    h.prisma.loginAttempt.createManyAndReturn.mockImplementation(async () => {
      order.push("insert");
      return [{ id: "a1" }, { id: "a2" }, { id: "a3" }];
    });
    h.prisma.loginAttempt.count.mockImplementation(async () => {
      order.push("count");
      return 1;
    });
    const ticket = await rl.beginAttempt("a@test.invalid", "203.0.113.7");
    expect(order[0]).toBe("insert");
    expect(ticket).toEqual({ ids: ["a1", "a2", "a3"], blocked: false });
    const rows = h.prisma.loginAttempt.createManyAndReturn.mock.calls[0][0].data;
    expect(rows).toHaveLength(3);
    expect(rows.every((r: { succeeded: boolean }) => r.succeeded === false)).toBe(true);
  });

  it("blocks once a scope exceeds its limit within the window", async () => {
    h.prisma.loginAttempt.createManyAndReturn.mockResolvedValue([{ id: "a1" }]);
    h.prisma.loginAttempt.count.mockImplementation(async ({ where }: { where: { key: string } }) =>
      where.key.startsWith("emailIp:") ? rl.LIMITS.emailIp + 1 : 1,
    );
    expect((await rl.beginAttempt("a@test.invalid", "203.0.113.7")).blocked).toBe(true);
    const now = new Date("2026-10-09T12:00:00Z");
    await rl.beginAttempt("a@test.invalid", "203.0.113.7", now);
    const where = h.prisma.loginAttempt.count.mock.calls.at(-1)![0].where;
    expect(where).toMatchObject({ succeeded: false, createdAt: { gte: new Date(now.getTime() - rl.WINDOW_MS) } });
  });

  it("allows exactly the limit", async () => {
    h.prisma.loginAttempt.createManyAndReturn.mockResolvedValue([{ id: "a1" }]);
    h.prisma.loginAttempt.count.mockImplementation(async ({ where }: { where: { key: string } }) =>
      where.key.startsWith("emailIp:") ? rl.LIMITS.emailIp : 0,
    );
    expect((await rl.beginAttempt("a@test.invalid", "203.0.113.7")).blocked).toBe(false);
  });
});

describe("login integration", () => {
  const credentials = (password: string) => form({ email: "a@test.invalid", password });

  it("is off by default: no LoginAttempt queries, behaviour unchanged", async () => {
    await expect(login(undefined, credentials("wrong"))).resolves.toMatchObject({ error: "Invalid email or password." });
    expect(h.prisma.loginAttempt.createManyAndReturn).not.toHaveBeenCalled();
  });

  it("when enabled, blocks with a generic message before any account lookup", async () => {
    vi.stubEnv("LOGIN_RATE_LIMIT", "enabled");
    h.prisma.loginAttempt.createManyAndReturn.mockResolvedValue([{ id: "a1" }]);
    h.prisma.loginAttempt.count.mockResolvedValue(rl.LIMITS.ip + 1);
    await expect(login(undefined, credentials("correct-password"))).resolves.toEqual({ error: rl.RATE_LIMIT_MESSAGE, email: "a@test.invalid" });
    expect(h.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("when enabled, marks a successful sign-in so it doesn't count", async () => {
    vi.stubEnv("LOGIN_RATE_LIMIT", "enabled");
    h.prisma.loginAttempt.createManyAndReturn.mockResolvedValue([{ id: "a1" }, { id: "a2" }, { id: "a3" }]);
    h.prisma.user.findUnique.mockResolvedValue({ id: "u1", role: "CLIENT", passwordHash: "x" });
    await expect(login(undefined, credentials("correct-password"))).rejects.toThrow("REDIRECT /dashboard");
    expect(h.prisma.loginAttempt.updateMany.mock.calls[0][0]).toEqual({ where: { id: { in: ["a1", "a2", "a3"] } }, data: { succeeded: true } });
  });

  it("fails open if the limiter is unavailable (password check still applies)", async () => {
    vi.stubEnv("LOGIN_RATE_LIMIT", "enabled");
    h.prisma.loginAttempt.createManyAndReturn.mockRejectedValue(new Error("relation does not exist"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(login(undefined, credentials("wrong"))).resolves.toMatchObject({ error: "Invalid email or password." });
    expect(spy).toHaveBeenCalledWith("Login rate limit unavailable", "Error");
  });
});
