"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { RATE_LIMIT_MESSAGE, beginAttempt, beginSignupAttempt, clientAddress, markSucceeded, rateLimitEnabled, type AttemptTicket } from "@/lib/auth/rate-limit";
import { createSession } from "@/lib/auth/session";
import { signInAsDemoAccount } from "@/lib/auth/demo-login";
import { DUPLICATE_ACCOUNT_MESSAGE, clientSignupEnabled, normalizeEmail, validateSignup, type SignupField } from "@/lib/auth/registration";
import { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";

// signedIn: the session cookie is set; the form then loads /auth/continue as
// a new document (see src/app/auth/continue/route.ts).
export type LoginState = { error?: string; email?: string; signedIn?: true } | undefined;

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
  return { signedIn: true };
}

// ---------------------------------------------------------------------------
// Client self-registration (CLIENT accounts only; see lib/auth/registration.ts)

export type SignupState =
  | {
      error?: string;
      fieldErrors?: Partial<Record<SignupField, string>>;
      // Echoed back so the form keeps what was typed. Never includes passwords.
      values?: { name: string; email: string };
      signedIn?: true;
    }
  | undefined;

export async function signup(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const raw = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  };
  const values = { name: raw.name.trim(), email: normalizeEmail(raw.email) };

  if (!clientSignupEnabled()) {
    return { error: "Self-registration isn't open. Contact your Clyntique administrator for access.", values };
  }

  const valid = validateSignup(raw);
  if (!valid.ok) return { fieldErrors: valid.fieldErrors, values };

  // Always limited, whatever LOGIN_RATE_LIMIT says, and every sign-up counts
  // (successful ones too), so accounts can't be created in bulk. Unlike
  // sign-in this fails closed: no limiter, no new accounts.
  let ticket: AttemptTicket;
  try {
    ticket = await beginSignupAttempt(valid.data.email, clientAddress(await headers()));
  } catch (error) {
    console.error("Signup rate limit unavailable", error instanceof Error ? error.name : "unknown error");
    return { error: "Sign-up is temporarily unavailable. Please try again later.", values };
  }
  if (ticket.blocked) return { error: "Too many attempts. Please wait a few minutes and try again.", values };

  const existing = await prisma.user.findUnique({ where: { email: valid.data.email }, select: { id: true } });
  if (existing) return { fieldErrors: { email: DUPLICATE_ACCOUNT_MESSAGE }, values };

  let user: { id: string; role: Role };
  try {
    user = await prisma.user.create({
      data: {
        name: valid.data.name,
        email: valid.data.email,
        role: "CLIENT", // fixed on the server: self-registration never creates TEAM accounts
        passwordHash: await hashPassword(valid.data.password),
      },
      select: { id: true, role: true },
    });
  } catch (error) {
    // Two sign-ups for the same email at once: the unique index decides.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { fieldErrors: { email: DUPLICATE_ACCOUNT_MESSAGE }, values };
    }
    console.error("Signup failed", error instanceof Error ? error.name : "unknown error");
    return { error: "Something went wrong. Please try again.", values };
  }

  await createSession({ userId: user.id, role: user.role });
  return { signedIn: true };
}

// ---------------------------------------------------------------------------
// Quick demo login (off unless DEMO_LOGIN=enabled; never on Vercel Production)

export type DemoLoginState = { error?: string; signedIn?: true } | undefined;

export async function demoLogin(_prev: DemoLoginState, formData: FormData): Promise<DemoLoginState> {
  const result = await signInAsDemoAccount(formData.get("account"));
  return result.ok ? { signedIn: true } : { error: result.error };
}
