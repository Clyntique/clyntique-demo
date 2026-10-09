import Link from "next/link";
import type { CreativeFormat, Role } from "@/generated/prisma/enums";
import type { CreativeSummary } from "@/lib/data/workspace";
import { cn } from "@/lib/cn";
import { FORMATS } from "@/lib/creative-format";
import { formatRelative } from "@/lib/format";
import { basePathFor } from "@/lib/navigation";
import { StatusBadge } from "@/components/ui/status-badge";
import { ImageIcon, PlayIcon } from "@/components/ui/icons";
import { needsAttention, reviewStateLabel } from "./copy";

const FRAME: Record<CreativeFormat, string> = {
  STORY: "aspect-[9/16] h-[78%]",
  FEED: "aspect-[4/5] h-[72%]",
  STATIC: "aspect-[1.91/1] w-[78%]",
  VIDEO: "aspect-video w-[78%]",
};

// Soft tints so placeholder previews are distinguishable. Picked from the id,
// so a creative keeps its tint everywhere.
const TINTS = ["#e9e4f8", "#e2eef0", "#f6eadf", "#e6ebf5", "#eef0e4", "#f3e6ec", "#e8f0e8", "#efe4dc"];

function tintFor(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length];
}

// Preview that keeps the creative's real aspect ratio: the latest image when
// there is one (served by the authenticated media route), otherwise a tinted
// placeholder. Videos show a play mark instead of loading the file.
export function CreativeThumb({
  creative,
  className,
}: {
  creative: Pick<CreativeSummary, "id" | "format" | "latestVersion">;
  className?: string;
}) {
  const latest = creative.latestVersion;
  if (latest?.mediaType === "IMAGE") {
    return (
      <div className={cn("flex items-center justify-center overflow-hidden bg-subtle p-3", className)} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/media/${latest.id}`}
          alt=""
          loading="lazy"
          className={cn("rounded-sm object-cover shadow-[0_1px_3px_rgb(0_0_0/0.08)]", FRAME[creative.format])}
        />
      </div>
    );
  }
  return (
    <div
      className={cn("flex items-center justify-center overflow-hidden bg-subtle", className)}
      aria-hidden
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-sm shadow-[0_1px_3px_rgb(0_0_0/0.08)]",
          FRAME[creative.format],
        )}
        style={{ backgroundColor: tintFor(creative.id) }}
      >
        {latest?.mediaType === "VIDEO" ? (
          <PlayIcon className="size-6 text-black/30" />
        ) : (
          <ImageIcon className="size-5 text-black/20" />
        )}
      </div>
    </div>
  );
}

export function CreativeCard({
  creative,
  role,
  now,
  showProject = true,
}: {
  creative: CreativeSummary;
  role: Role;
  now: number;
  showProject?: boolean;
}) {
  const needsYou = needsAttention(role, creative.workflow, creative.status);
  const legacy = creative.workflow === "LEGACY_CLIENT_APPROVAL";

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-card transition-shadow focus-within:ring-3 focus-within:ring-brand-100 hover:shadow-pop">
      <div className="relative">
        <CreativeThumb creative={creative} className="aspect-[4/3]" />
        {creative.versionCount > 0 && (
          <span className="absolute top-2.5 left-2.5 rounded-sm bg-surface/90 px-1.5 py-0.5 text-[11px] font-semibold text-ink-soft tabular-nums ring-1 ring-line">
            V{creative.versionCount}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 border-t border-line p-4">
        <div className="min-w-0">
          <h3 className="text-card-title truncate">
            {/* The overlay makes the whole card the link target. */}
            <Link
              href={`${basePathFor(role)}/creatives/${creative.id}`}
              className="after:absolute after:inset-0 focus-visible:outline-none group-hover:text-brand-700"
            >
              {creative.name}
            </Link>
          </h3>
          <p className="text-meta mt-0.5 truncate">
            {!showProject
              ? creative.description || "No notes yet"
              : role === "TEAM"
                ? `${creative.clientName} — ${creative.projectName}`
                : creative.projectName}
          </p>
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <StatusBadge status={creative.status} />
              {legacy && (
                <span
                  title="Created before the compliance review workflow"
                  className="rounded-sm px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted uppercase ring-1 ring-line ring-inset"
                >
                  Legacy
                </span>
              )}
            </span>
            <span className="text-meta">{FORMATS[creative.format].label}</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className={needsYou ? "font-medium text-brand-700" : "text-ink-soft"}>
              {reviewStateLabel(role, creative.workflow, creative.status)}
            </span>
            <span className="text-faint">Updated {formatRelative(creative.updatedAt, now).toLowerCase()}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
