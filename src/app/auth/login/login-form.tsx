"use client";

import { useActionState, useEffect, useState } from "react";
import {
  MailIcon,
  LockIcon,
  EyeIcon,
  EyeOffIcon,
  ArrowRightIcon,
  HeadsetIcon,
} from "@/components/ui/icons";
import { login } from "../actions";

const CONTINUE = "/auth/continue";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const signedIn = state?.signedIn === true;

  useEffect(() => {
    if (signedIn) {
      window.location.replace(CONTINUE);
    }
  }, [signedIn]);

  return (
    <div className="flex flex-col">
      <form action={action} className="flex flex-col gap-4.5">
        {/* Email Field */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="login-email" className="text-small font-medium text-ink">
            Email
          </label>
          <div className="relative">
            <MailIcon className="size-4.5 text-muted pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-invalid={state?.error ? true : undefined}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10.5 pr-4 text-small text-ink placeholder:text-muted/60 transition-colors focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
          </div>
        </div>

        {/* Password Field */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="login-password" className="text-small font-medium text-ink">
            Password
          </label>
          <div className="relative">
            <LockIcon className="size-4.5 text-muted pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-invalid={state?.error ? true : undefined}
              placeholder="Enter your password"
              className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10.5 pr-11 text-small text-ink placeholder:text-muted/60 transition-colors focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors cursor-pointer"
            >
              {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
        </div>

        {/* Error alert */}
        {state?.error && (
          <p role="alert" className="rounded-lg bg-critical-soft px-3.5 py-2.5 text-small text-critical-ink border border-critical-line">
            {state.error}
          </p>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={pending || signedIn}
          className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 px-4 text-small font-medium text-white shadow-xs hover:bg-brand-700 active:bg-brand-800 disabled:opacity-60 transition-all cursor-pointer"
        >
          <span>{pending || signedIn ? "Signing in…" : "Sign In"}</span>
          <ArrowRightIcon className="size-4" />
        </button>
      </form>

      {/* Divider */}
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-line/80" />
        </div>
        <div className="relative flex justify-center text-micro">
          <span className="bg-surface px-3 text-muted font-medium">Need enterprise assistance?</span>
        </div>
      </div>

      {/* Contact row */}
      <div className="flex items-center justify-center gap-2 text-caption text-muted hover:text-ink transition-colors">
        <HeadsetIcon className="size-4 shrink-0 text-muted" />
        <span>Contact your Clyntique compliance administrator.</span>
      </div>

      {signedIn && (
        <noscript>
          <a href={CONTINUE} className="text-small text-center text-brand-700 underline mt-3 block">
            Continue to workspace
          </a>
        </noscript>
      )}
    </div>
  );
}
