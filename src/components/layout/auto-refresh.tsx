"use client";

import { useEffect, startTransition } from "react";
import { useRouter } from "next/navigation";

/*
 * Refresh-based status visibility (not real-time sync). While the tab is
 * visible, the current page's server data is re-fetched every INTERVAL_MS and
 * when the user returns to the tab after a substantial break, so a client sees
 * the team's feedback and the team sees resubmissions without reloading by hand.
 *
 * router.refresh() runs inside startTransition to keep user interactions (clicks,
 * tab switches, button presses) immediately responsive and non-blocked.
 */

const INTERVAL_MS = 30_000;
const TAB_RETURN_DEBOUNCE_MS = 15_000;

function userIsEditing() {
  const el = document.activeElement;
  if (!el) return false;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el as HTMLElement).isContentEditable
  );
}

export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible" || userIsEditing()) return;
      last = Date.now();
      startTransition(() => {
        router.refresh();
      });
    };

    const timer = window.setInterval(refresh, INTERVAL_MS);

    // Coming back to the tab after an inactive period: refresh in background
    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - last > TAB_RETURN_DEBOUNCE_MS
      ) {
        refresh();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return null;
}
