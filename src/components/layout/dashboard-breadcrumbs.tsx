"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";
import { basePathFor, ROLE_LABEL } from "@/lib/navigation";
import { cn } from "@/lib/cn";

const ROUTE_LABELS: Record<string, string> = {
  review: "Review queue",
  creatives: "Submissions",
  projects: "Projects",
  evidence: "Evidence dictionary",
  messages: "Messages",
  activity: "Activity",
  "policy-library": "Policy library",
  "policy-dashboard": "Policy dashboard",
  plans: "Plans & Add-ons",
  profile: "Profile",
  library: "Library",
  impact: "Impact assessment",
  monitoring: "Source monitoring",
  record: "Compliance record",
  new: "New",
};

export function DashboardBreadcrumbs({ role }: { role: Role }) {
  const pathname = usePathname();
  const homePath = basePathFor(role);
  const homeLabel = ROLE_LABEL[role];

  if (!pathname) return null;

  // Split path into segments after the base path
  // e.g. /admin/creatives/c123/record -> ['creatives', 'c123', 'record']
  const relativePath = pathname.startsWith(homePath)
    ? pathname.slice(homePath.length).replace(/^\//, "")
    : pathname.replace(/^\//, "");

  const segments = relativePath ? relativePath.split("/").filter(Boolean) : [];

  return (
    <nav aria-label="Breadcrumb" className="min-w-0 flex items-center gap-1.5 text-small">
      <Link
        href={homePath}
        className={cn(
          "font-medium transition-colors hover:text-ink truncate",
          segments.length === 0 ? "text-ink font-semibold" : "text-muted"
        )}
      >
        {homeLabel}
      </Link>

      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const subPath = homePath + "/" + segments.slice(0, index + 1).join("/");
        // Look up label, or if it looks like an ID (cuid / uuid / alphanumeric), format cleanly
        const label =
          ROUTE_LABELS[segment] ||
          (segment.length > 20
            ? "Item Details"
            : segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " "));

        return (
          <div key={subPath} className="flex items-center gap-1.5 min-w-0">
            <span aria-hidden className="text-faint text-caption">
              /
            </span>
            {isLast ? (
              <span aria-current="page" className="font-semibold text-ink truncate max-w-[200px] sm:max-w-xs">
                {label}
              </span>
            ) : (
              <Link
                href={subPath}
                className="text-muted hover:text-ink font-medium transition-colors truncate max-w-[140px]"
              >
                {label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
