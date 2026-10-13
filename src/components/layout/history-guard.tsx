"use client";

import { useEffect } from "react";

/*
 * Signed-in pages only. If the browser restores one of them from its
 * back/forward cache (a frozen copy, never re-checked by the server), reload it
 * so the server decides again what this browser may see. After a sign-out or a
 * switch of account that reload lands on sign-in or the new account's home.
 */
export function HistoryGuard() {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  return null;
}
