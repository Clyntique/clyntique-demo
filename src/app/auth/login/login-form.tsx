"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { login } from "../actions";

// After a successful sign-in, load the account's home as a new document (via
// /auth/continue), so nothing from a previous account stays in this tab.
const CONTINUE = "/auth/continue";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  const signedIn = state?.signedIn === true;

  useEffect(() => {
    if (signedIn) window.location.replace(CONTINUE);
  }, [signedIn]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email">
        <Input
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state?.email}
          size="lg"
          required
          aria-invalid={state?.error ? true : undefined}
        />
      </Field>
      <Field label="Password">
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          size="lg"
          required
          aria-invalid={state?.error ? true : undefined}
        />
      </Field>
      {state?.error && (
        <p role="alert" className="rounded-md bg-critical-soft px-3 py-2 text-small text-critical-ink">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending || signedIn} className="mt-2 w-full">
        {pending || signedIn ? "Signing in…" : "Sign in"}
      </Button>
      {signedIn && (
        <noscript>
          <a href={CONTINUE} className="text-small text-center text-brand-700 underline">
            Continue
          </a>
        </noscript>
      )}
    </form>
  );
}
