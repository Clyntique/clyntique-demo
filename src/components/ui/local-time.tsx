"use client";

import { useSyncExternalStore } from "react";
import { greetingFor } from "@/lib/format";

/*
 * Greeting and date in the viewer's own time zone. The server runs in UTC, so
 * anything time-of-day based is decided in the browser: the server render
 * (and hydration) show the fallback, then the browser's local value.
 */
const subscribe = () => () => {};

function useLocal<T>(read: () => T) {
  return useSyncExternalStore(subscribe, read, () => null);
}

export function LocalGreeting({ fallback = "Welcome" }: { fallback?: string }) {
  const greeting = useLocal(() => greetingFor(new Date()));
  return <>{greeting ?? fallback}</>;
}

/** e.g. "Tuesday 13 October", in the viewer's locale order and time zone. */
export function LocalDate({ prefix = "" }: { prefix?: string }) {
  const label = useLocal(() => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }));
  if (!label) return null;
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return (
    <>
      {prefix}
      <time dateTime={iso}>{label}</time>
    </>
  );
}
