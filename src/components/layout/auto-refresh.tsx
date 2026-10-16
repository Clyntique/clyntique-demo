"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/*
 * Refresh-based status visibility (not real-time sync). While the tab is
 * visible, the current page's server data is re-fetched every INTERVAL_MS and
 * whenever the user comes back to the tab, so a client sees the team's
 * feedback and the team sees resubmissions without reloading by hand.
 *
 * router.refresh() re-renders server components only: client state, typed
 * text and open forms are kept. It is skipped while the user is typing in a
 * field, so nothing re-renders under their cursor.
 */

const INTERVAL_MS = 30_000;

function userIsEditing() {
  const el = document.activeElement;
  if (!el) return false;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable;
}

export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible" || userIsEditing()) return;
      last = Date.now();
      router.refresh();
    };
    const timer = window.setInterval(refresh, INTERVAL_MS);
    // Coming back to the tab after a while: refresh at once.
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last > 5_000) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [router]);

  return null;
}
