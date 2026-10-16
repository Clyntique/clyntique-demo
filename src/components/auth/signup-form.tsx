"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { signup } from "@/app/auth/actions";

/*
 * Functional client sign-up form. Integration contract (for the sign-up page
 * design): a form bound to the `signup` server action with fields
 * name, email, password, confirmPassword. On success the action has set the
 * session and returns { signedIn: true }; the page then loads /auth/continue
 * as a new document. Errors come back as { error } or { fieldErrors }.
 */

const CONTINUE = "/auth/continue";

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-4 py-2.5 text-small text-ink placeholder:text-muted/60 transition-colors focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20";

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);
  const signedIn = state?.signedIn === true;
  const errors = state?.fieldErrors ?? {};

  useEffect(() => {
    if (signedIn) window.location.replace(CONTINUE);
  }, [signedIn]);

  const field = (name: "name" | "email" | "password" | "confirmPassword", label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`signup-${name}`} className="text-small font-medium text-ink">
        {label}
      </label>
      <input
        id={`signup-${name}`}
        name={name}
        required
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={errors[name] ? `signup-${name}-error` : undefined}
        className={inputClass}
        {...props}
      />
      {errors[name] && (
        <p id={`signup-${name}-error`} className="text-caption text-critical-ink">
          {errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {field("name", "Full name", { type: "text", autoComplete: "name", defaultValue: state?.values?.name, maxLength: 80 })}
      {field("email", "Work email", { type: "email", autoComplete: "email", defaultValue: state?.values?.email, maxLength: 254 })}
      {field("password", "Password", { type: "password", autoComplete: "new-password", minLength: 12, maxLength: 128 })}
      <p className="-mt-2 text-caption text-muted">At least 12 characters, with a letter and a number.</p>
      {field("confirmPassword", "Confirm password", { type: "password", autoComplete: "new-password", maxLength: 128 })}

      {state?.error && (
        <p role="alert" className="rounded-lg border border-critical-line bg-critical-soft px-3.5 py-2.5 text-small text-critical-ink">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || signedIn}
        className="mt-1 w-full rounded-xl bg-brand-600 px-4 py-3 text-small font-medium text-white shadow-xs transition-all hover:bg-brand-700 active:bg-brand-800 disabled:opacity-60"
      >
        {pending || signedIn ? "Creating account…" : "Create client account"}
      </button>

      <p className="text-center text-caption text-muted">
        Already have an account?{" "}
        <Link href="/auth/login" className="font-medium text-brand-700 hover:text-brand-900">
          Sign in
        </Link>
      </p>
    </form>
  );
}
