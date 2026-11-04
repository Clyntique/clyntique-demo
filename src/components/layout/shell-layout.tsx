"use client";

import { useSidebar } from "./sidebar-context";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function ShellLayout({
  sidebar,
  header,
  mobileHeader,
  children,
}: {
  sidebar: ReactNode;
  header?: ReactNode;
  mobileHeader?: ReactNode;
  children: ReactNode;
}) {
  const { isCollapsed } = useSidebar();

  return (
    <div
      className={cn(
        "flex min-h-dvh flex-1 flex-col bg-canvas text-ink transition-[padding] duration-200 ease-in-out",
        isCollapsed ? "md:pl-18" : "md:pl-60"
      )}
    >
      {sidebar}
      {header ?? mobileHeader}
      <main
        id="main"
        className="mx-auto w-full max-w-[100rem] min-w-0 flex-1 px-4 py-6 sm:px-6 md:px-8 md:py-8"
      >
        {children}
      </main>
    </div>
  );
}
