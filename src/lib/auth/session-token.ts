import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/generated/prisma/enums";

// Shared by proxy.ts and server code. Contains no Node-only APIs.

export const SESSION_COOKIE = "clyntique_session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionPayload = {
  userId: string;
  role: Role;
  /** Set for quick demo-login sessions (src/lib/auth/demo-login.ts). */
  demo?: true;
};

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  // The .env.example placeholder is long enough to pass the length check, so refuse it explicitly.
  if (!secret || secret.length < 32 || secret.startsWith("REPLACE_WITH")) {
    throw new Error("SESSION_SECRET must be set to a random value of at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function encodeSession(payload: SessionPayload, expiresAt: Date) {
  return new SignJWT({ userId: payload.userId, role: payload.role, ...(payload.demo ? { demo: true } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSecretKey());
}

export async function decodeSession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    if (
      typeof payload.userId !== "string" ||
      (payload.role !== "TEAM" && payload.role !== "CLIENT")
    ) {
      return null;
    }
    return { userId: payload.userId, role: payload.role, ...(payload.demo === true ? { demo: true as const } : {}) };
  } catch {
    return null;
  }
}
