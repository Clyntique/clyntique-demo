"use client";

import { useActionState, useEffect } from "react";
import { demoLogin } from "@/app/auth/actions";

const CONTINUE = "/auth/continue";

/*
 * Quick demo login buttons. Each button only submits an account key
 * ("team" | "client1" | "client2"); the server decides whether demo login is
 * on and which account that is. No email or password is in this component.
 */
export function DemoLoginButtons({ accounts }: { accounts: Array<{ key: string; label: string }> }) {
  const [state, action, pending] = useActionState(demoLogin, undefined);
  const signedIn = state?.signedIn === true;

  useEffect(() => {
    if (signedIn) window.location.replace(CONTINUE);
  }, [signedIn]);

  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {accounts.map((a) => (
          <button
            key={a.key}
            type="submit"
            name="account"
            value={a.key}
            disabled={pending || signedIn}
            className="rounded-xl border border-line bg-surface px-3 py-2 text-caption font-medium text-ink transition-colors hover:border-brand-600 hover:text-brand-700 disabled:opacity-60"
          >
            {a.label}
          </button>
        ))}
      </div>
      {state?.error && (
        <p role="alert" className="text-caption text-critical-ink">
          {state.error}
        </p>
      )}
    </form>
  );
}
