"use client";

import { useState } from "react";
import type { CreativeFormat, MediaType } from "@/generated/prisma/enums";
import { cn } from "@/lib/cn";
import { AlertIcon, ImageIcon } from "@/components/ui/icons";

// Preview frame height follows the placement, so a 9:16 story isn't shown as a
// letterboxed sliver and a 16:9 video isn't shown tiny.
const FRAME: Record<CreativeFormat, string> = {
  STORY: "h-[min(70vh,640px)] aspect-[9/16]",
  FEED: "h-[min(70vh,640px)] aspect-[4/5]",
  STATIC: "w-full aspect-[1.91/1]",
  VIDEO: "w-full aspect-video",
};

type Status = "loading" | "ready" | "error";

export function MediaPreview({
  src,
  mediaType,
  format,
  label,
}: {
  src: string;
  mediaType: MediaType;
  format: CreativeFormat;
  label: string;
}) {
  const [status, setStatus] = useState<Status>("loading");

  return (
    <div className="flex min-h-64 items-center justify-center bg-subtle p-4 sm:p-8">
      <div className={cn("relative flex max-w-full items-center justify-center overflow-hidden rounded-md", FRAME[format])}>
        {status === "loading" && (
          <div aria-hidden className="absolute inset-0 animate-pulse rounded-md bg-line/60" />
        )}
        {status === "error" ? (
          <MediaFallback
            title="This file couldn't be loaded."
            description="Check your connection and refresh. If it keeps happening, the team can upload it again."
            error
          />
        ) : mediaType === "IMAGE" ? (
          // A plain <img>: the file is streamed by an authenticated route, not
          // a static asset the image optimizer could fetch.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={(el) => {
              // Loaded (or failed) before hydration: onLoad/onError won't fire.
              if (el?.complete) setStatus((s) => (s === "loading" ? (el.naturalWidth > 0 ? "ready" : "error") : s));
            }}
            src={src}
            alt={label}
            className="relative h-full w-full object-contain"
            onLoad={() => setStatus("ready")}
            onError={() => setStatus("error")}
          />
        ) : (
          <video
            ref={(el) => {
              if (el?.error) setStatus("error");
              else if (el && el.readyState >= 1) setStatus((s) => (s === "loading" ? "ready" : s));
            }}
            src={src}
            controls
            playsInline
            preload="metadata"
            aria-label={label}
            className="relative h-full w-full bg-black object-contain"
            onLoadedMetadata={() => setStatus("ready")}
            onError={() => setStatus("error")}
          >
            Your browser can&apos;t play this video.
          </video>
        )}
      </div>
    </div>
  );
}

export function MediaFallback({
  title,
  description,
  error = false,
}: {
  title: string;
  description?: string;
  error?: boolean;
}) {
  return (
    <div role={error ? "alert" : undefined} className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-full [&_svg]:size-5",
          error ? "bg-red-50 text-red-600" : "bg-surface text-muted",
        )}
      >
        {error ? <AlertIcon /> : <ImageIcon />}
      </span>
      <p className="text-card-title">{title}</p>
      {description && <p className="text-meta max-w-sm">{description}</p>}
    </div>
  );
}
