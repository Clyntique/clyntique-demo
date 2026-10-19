"use client";

import { useEffect, useRef } from "react";
import { markReadAction } from "@/lib/messages/actions";

/*
 * Marks a conversation's incoming messages as read once this spot is actually
 * on screen (a hidden tab panel counts as not on screen) and the tab is in
 * the foreground. Renders nothing.
 */
export function MarkRead({ conversationId, unread }: { conversationId: string; unread: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || unread === 0) return;
    const run = () => {
      if (inFlight.current || document.visibilityState !== "visible") return;
      inFlight.current = true;
      markReadAction(conversationId)
        .catch(() => undefined)
        .finally(() => {
          inFlight.current = false;
        });
    };
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) run();
    });
    observer.observe(el);
    document.addEventListener("visibilitychange", run);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", run);
    };
  }, [conversationId, unread]);

  return <span ref={ref} aria-hidden className="block h-px" />;
}
