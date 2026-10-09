"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { RATE_LIMIT_MESSAGE, beginAttempt, clientAddress, markSucceeded, rateLimitEnabled, type AttemptTicket } from "@/lib/auth/rate-limit";
import { createSession, deleteSession } from "@/lib/auth/session";
import { homePathFor } from "@/lib/auth/dal";

export type LoginState = { error?: string; email?: string } | undefined;

// Compared against when the email is unknown, so the response time does not
// reveal which emails exist.
let dummyHash: Promise<string> | undefined;

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password.", email };
  }

  // Off unless LOGIN_RATE_LIMIT=enabled (needs the LoginAttempt table). The
  // same message is shown whether or not the account exists.
  let ticket: AttemptTicket | null = null;
  if (rateLimitEnabled()) {
    try {
      ticket = await beginAttempt(email, clientAddress(await headers()));
    } catch (error) {
      console.error("Login rate limit unavailable", error instanceof Error ? error.name : "unknown error");
    }
    if (ticket?.blocked) return { error: RATE_LIMIT_MESSAGE, email };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, passwordHash: true },
  });
  dummyHash ??= hashPassword(randomUUID());
  const valid = await verifyPassword(
    password,
    user?.passwordHash ?? (await dummyHash),
  );
  if (!user || !valid) {
    return { error: "Invalid email or password.", email };
  }

  if (ticket) {
    await markSucceeded(ticket).catch((error) => {
      console.error("Login rate limit update failed", error instanceof Error ? error.name : "unknown error");
    });
  }
  await createSession({ userId: user.id, role: user.role });
  redirect(homePathFor(user.role));
}

export async function logout() {
  await deleteSession();
  redirect("/auth/login");
}
