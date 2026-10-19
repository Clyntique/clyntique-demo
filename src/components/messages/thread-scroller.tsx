"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// A scrolling message list that starts at, and follows, the newest message.
export function ThreadScroller({ count, className, children }: { count: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);
  return (
    <div ref={ref} className={cn("overflow-y-auto", className)} role="log" aria-label="Messages" tabIndex={0}>
      {children}
    </div>
  );
}
