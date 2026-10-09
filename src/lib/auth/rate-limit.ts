import "server-only";
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";

/*
 * Login rate limiting backed by the LoginAttempt table (M1A schema).
 *
 * Privacy: rows never contain an email address or IP address, only
 * HMAC-SHA256(secret, "<scope>:<value>"). Without the secret the keys cannot
 * be reversed or matched against a list of known emails.
 *
 * Limits (failed attempts within a sliding 15-minute window):
 * - email + IP: 5   (one person guessing one account)
 * - email:     20   (one account attacked from many addresses; kept higher so
 *                    an attacker can't easily lock a real user out)
 * - IP:        50   (one address trying many accounts)
 *
 * Concurrency: each attempt is recorded BEFORE the password is checked and
 * the window is counted afterwards, so parallel requests see each other's
 * rows and can't all slip under the limit. Rows are written outside a
 * transaction on purpose (each insert commits immediately).
 *
 * Off unless LOGIN_RATE_LIMIT=enabled, because the table exists only after
 * the M1A migration. If the limiter itself fails, sign-in falls back to the
 * normal password check (fail open) and the error name is logged.
 */

export const WINDOW_MS = 15 * 60 * 1000;
export const LIMITS = { emailIp: 5, email: 20, ip: 50 } as const;
type Scope = keyof typeof LIMITS;

export function rateLimitEnabled(env: Record<string, string | undefined> = process.env) {
  return env.LOGIN_RATE_LIMIT === "enabled";
}

function secret() {
  const value = process.env.RATE_LIMIT_SECRET || process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("RATE_LIMIT_SECRET or SESSION_SECRET must be at least 32 characters.");
  return value;
}

/** Opaque key for one scope. Never stores the raw email or address. */
export function attemptKey(scope: Scope, value: string) {
  return `${scope}:${createHmac("sha256", secret()).update(`${scope}:${value}`).digest("hex")}`;
}

/**
 * Best-effort client address. On Vercel the platform sets x-forwarded-for;
 * elsewhere the header can be spoofed, which only weakens the per-IP limits
 * (the per-email limit still applies).
 */
export function clientAddress(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

export function keysFor(email: string, address: string): Record<Scope, string> {
  const normalized = email.trim().toLowerCase();
  return {
    emailIp: attemptKey("emailIp", `${normalized}|${address}`),
    email: attemptKey("email", normalized),
    ip: attemptKey("ip", address),
  };
}

export type AttemptTicket = { ids: string[]; blocked: boolean };

/**
 * Records this attempt (as a failure until proven otherwise) and reports
 * whether any limit is now exceeded.
 */
export async function beginAttempt(email: string, address: string, now = new Date()): Promise<AttemptTicket> {
  const keys = keysFor(email, address);
  const created = await prisma.loginAttempt.createManyAndReturn({
    data: (Object.keys(keys) as Scope[]).map((scope) => ({ key: keys[scope], succeeded: false, createdAt: now })),
    select: { id: true },
  });
  const since = new Date(now.getTime() - WINDOW_MS);
  const counts = await Promise.all(
    (Object.keys(keys) as Scope[]).map(async (scope) => ({
      scope,
      n: await prisma.loginAttempt.count({ where: { key: keys[scope], succeeded: false, createdAt: { gte: since } } }),
    })),
  );
  const blocked = counts.some(({ scope, n }) => n > LIMITS[scope]);
  return { ids: created.map((c) => c.id), blocked };
}

/** Marks the attempt as successful so it no longer counts towards the limits. */
export async function markSucceeded(ticket: AttemptTicket) {
  if (!ticket.ids.length) return;
  await prisma.loginAttempt.updateMany({ where: { id: { in: ticket.ids } }, data: { succeeded: true } });
}

/** Removes attempts older than a day. Not run automatically; for a scheduled job later. */
export async function pruneAttempts(olderThanMs = 24 * 60 * 60 * 1000, now = new Date()) {
  const { count } = await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - olderThanMs) } } });
  return count;
}

export const RATE_LIMIT_MESSAGE = "Too many sign-in attempts. Please wait a few minutes and try again.";
