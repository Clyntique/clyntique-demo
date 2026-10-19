"use client";

import { useSyncExternalStore, type ReactNode } from "react";

/*
 * A message timestamp in the viewer's own time zone. The server runs in UTC,
 * so the server render (and hydration) show `fallback`, then the browser's
 * local value (the same approach as LocalGreeting).
 */
const subscribe = () => () => {};

export function LocalDateTime({ iso, fallback }: { iso: string; fallback: ReactNode }) {
  const label = useSyncExternalStore(
    subscribe,
    () => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    () => null,
  );
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {label ?? fallback}
    </time>
  );
}
