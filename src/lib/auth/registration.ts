/*
 * Public self-registration: CLIENT accounts only.
 *
 * - Off unless CLIENT_SIGNUP=enabled (so merging this code changes nothing on
 *   a deployment until someone chooses to open registration).
 * - The role is always CLIENT, set here on the server. Nothing the browser
 *   sends can create a TEAM account, and Clyntique's own email domains are
 *   refused so nobody can register an address that looks like staff.
 * - Passwords are hashed with bcrypt (lib/auth/password.ts) and never stored,
 *   logged or returned.
 * - A new client sees nothing until the TEAM assigns them a project.
 *
 * The validation is pure (no database) so it can be unit tested.
 */

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 72; // bcrypt ignores everything after the first 72 bytes
export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const EMAIL_MAX = 254;

// Staff and system domains: never available for self-registration.
export const RESERVED_EMAIL_DOMAINS = ["clyntique.demo", "clyntique.com", "clyntique.internal"];

// A short list of passwords that pass the length rule but are still guessable.
const COMMON_PASSWORDS = new Set([
  "password1234",
  "password12345",
  "123456789012",
  "qwerty123456",
  "letmein12345",
  "welcome12345",
  "clyntique123",
  "clyntique1234",
  "administrator1",
]);

export function clientSignupEnabled(env: Record<string, string | undefined> = process.env) {
  return env.CLIENT_SIGNUP === "enabled";
}

export type SignupInput = { name: string; email: string; password: string; confirmPassword: string };
export type SignupField = keyof SignupInput;
export type SignupValidation =
  | { ok: true; data: { name: string; email: string; password: string } }
  | { ok: false; fieldErrors: Partial<Record<SignupField, string>> };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function passwordProblem(password: string, email = ""): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX || new TextEncoder().encode(password).length > PASSWORD_MAX) {
    return `Use at most ${PASSWORD_MAX} characters (fewer if it has accented letters or symbols).`;
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Include at least one letter and one number.";
  if (/^\s|\s$/.test(password)) return "Don't start or end the password with a space.";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return "This password is too easy to guess. Choose another.";
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && password.toLowerCase().includes(local)) return "Don't include your email address in the password.";
  return null;
}

export function validateSignup(input: SignupInput): SignupValidation {
  const fieldErrors: Partial<Record<SignupField, string>> = {};
  const name = input.name.trim().replace(/\s+/g, " ");
  const email = normalizeEmail(input.email);

  if (name.length < NAME_MIN) fieldErrors.name = "Enter your name.";
  else if (name.length > NAME_MAX) fieldErrors.name = `Keep your name under ${NAME_MAX} characters.`;

  if (!email || email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  } else {
    const domain = email.split("@")[1];
    if (RESERVED_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
      fieldErrors.email = "This email domain can't be used to register. Contact your Clyntique administrator.";
    }
  }

  const problem = passwordProblem(input.password, email);
  if (problem) fieldErrors.password = problem;
  else if (input.password !== input.confirmPassword) fieldErrors.confirmPassword = "The passwords don't match.";

  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return { ok: true, data: { name, email, password: input.password } };
}

export const DUPLICATE_ACCOUNT_MESSAGE = "An account with this email already exists. Sign in instead.";
