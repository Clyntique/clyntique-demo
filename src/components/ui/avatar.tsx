"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

const sizes = {
  xs: "size-5 text-[10px]",
  sm: "size-6 text-micro",
  md: "size-8 text-xs",
  lg: "size-10 text-small",
  xl: "size-14 text-base",
  "2xl": "size-20 text-xl",
};

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return "??";
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  if (src && !imgError) {
    return (
      <span
        className={cn(
          "relative inline-flex shrink-0 overflow-hidden rounded-full ring-1 ring-line",
          sizes[size],
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name}
          onError={() => setImgError(true)}
          className="size-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300 dark:ring-1 dark:ring-brand-800",
        sizes[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
