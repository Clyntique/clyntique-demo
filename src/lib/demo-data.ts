import "server-only";
import type { ActivityType, CreativeStatus, Role } from "@/generated/prisma/enums";

/*
 * STATIC DEMO DATA — Phase 2 visual development only.
 *
 * Nothing here comes from the database and nothing is persisted. The exported
 * getters return the same shapes the real queries will return later, so each
 * getter can be swapped for a Prisma query without touching the UI.
 * The DEMO_CLIENT_ORG projects stand in for the signed-in client's projects.
 */

export type CreativeFormat = "Story" | "Feed" | "Landscape" | "Video";

export type CreativeSummary = {
  id: string;
  name: string;
  format: CreativeFormat;
  projectId: string;
  projectName: string;
  clientName: string;
  version: number;
  status: CreativeStatus;
  updatedAt: Date;
  /** Placeholder tint until real thumbnails exist. */
  swatch: string;
};

export type ProjectSummary = {
  id: string;
  name: string;
  clientName: string;
  creativeCount: number;
  statusCounts: Partial<Record<CreativeStatus, number>>;
  lastActivityAt: Date;
};

export type ActivityItem = {
  id: string;
  type: ActivityType;
  version?: number;
  creativeName: string;
  projectName: string;
  actorName: string;
  createdAt: Date;
};

const DEMO_CLIENT_ORG = "Acme Health";

const PROJECTS = [
  { id: "p1", name: "Q4 Campaign", clientName: "Acme Health" },
  { id: "p2", name: "Open Enrollment", clientName: "Acme Health" },
  { id: "p3", name: "Holiday Campaign", clientName: "Northwind Coffee" },
  { id: "p4", name: "Spring Launch", clientName: "Lumen Fitness" },
  { id: "p5", name: "Brand Refresh", clientName: "Harbor & Pine" },
];

// minutesAgo is resolved against the request time in the getters below.
const CREATIVES: (Omit<CreativeSummary, "projectName" | "clientName" | "updatedAt"> & {
  minutesAgo: number;
})[] = [
  { id: "c1", projectId: "p1", name: "Instagram Story — Product Launch", format: "Story", version: 2, status: "IN_REVIEW", minutesAgo: 12, swatch: "#e9e4f8" },
  { id: "c2", projectId: "p1", name: "Facebook Static Ad", format: "Landscape", version: 3, status: "APPROVED", minutesAgo: 62, swatch: "#e2eef0" },
  { id: "c3", projectId: "p1", name: "Feed Post — Doctor Testimonial", format: "Feed", version: 2, status: "CHANGES_REQUESTED", minutesAgo: 35, swatch: "#f6eadf" },
  { id: "c4", projectId: "p1", name: "YouTube Pre-roll — 15s", format: "Video", version: 1, status: "APPROVED", minutesAgo: 60 * 26, swatch: "#e6ebf5" },
  { id: "c5", projectId: "p1", name: "Display Banner — Retargeting", format: "Landscape", version: 2, status: "APPROVED", minutesAgo: 60 * 30, swatch: "#eef0e4" },
  { id: "c6", projectId: "p2", name: "Enrollment Reminder — Story", format: "Story", version: 1, status: "IN_REVIEW", minutesAgo: 95, swatch: "#f3e6ec" },
  { id: "c7", projectId: "p2", name: "Benefits Explainer — Video", format: "Video", version: 1, status: "DRAFT", minutesAgo: 60 * 5, swatch: "#e4ecf3" },
  { id: "c8", projectId: "p2", name: "Plan Comparison — Feed", format: "Feed", version: 2, status: "APPROVED", minutesAgo: 60 * 50, swatch: "#e8f0e8" },
  { id: "c9", projectId: "p3", name: "Gift Card Promo — Story", format: "Story", version: 3, status: "IN_REVIEW", minutesAgo: 140, swatch: "#f4e8de" },
  { id: "c10", projectId: "p3", name: "Seasonal Menu — Feed", format: "Feed", version: 2, status: "CHANGES_REQUESTED", minutesAgo: 60 * 3, swatch: "#efe4dc" },
  { id: "c11", projectId: "p3", name: "Peppermint Mocha — Video", format: "Video", version: 1, status: "APPROVED", minutesAgo: 60 * 28, swatch: "#f1e3e3" },
  { id: "c12", projectId: "p3", name: "In-store Poster — Landscape", format: "Landscape", version: 1, status: "DRAFT", minutesAgo: 60 * 4, swatch: "#ece7df" },
  { id: "c13", projectId: "p4", name: "Membership Launch — Story", format: "Story", version: 1, status: "DRAFT", minutesAgo: 60 * 7, swatch: "#e2f0ec" },
  { id: "c14", projectId: "p4", name: "Class Schedule — Feed", format: "Feed", version: 1, status: "DRAFT", minutesAgo: 60 * 9, swatch: "#e6eef4" },
  { id: "c15", projectId: "p5", name: "Logo Reveal — Video", format: "Video", version: 4, status: "APPROVED", minutesAgo: 60 * 24 * 3, swatch: "#e9e9e4" },
  { id: "c16", projectId: "p5", name: "Brand Story — Feed", format: "Feed", version: 2, status: "APPROVED", minutesAgo: 60 * 24 * 4, swatch: "#e4e9e6" },
  { id: "c17", projectId: "p5", name: "Website Hero — Landscape", format: "Landscape", version: 3, status: "APPROVED", minutesAgo: 60 * 24 * 4, swatch: "#ebe6f0" },
];

const ACTIVITY: (Omit<ActivityItem, "creativeName" | "projectName" | "createdAt"> & {
  creativeId: string;
  minutesAgo: number;
})[] = [
  { id: "a1", type: "VERSION_UPLOADED", version: 2, creativeId: "c1", actorName: "Clyntique Team", minutesAgo: 12 },
  { id: "a2", type: "FEEDBACK_RECEIVED", creativeId: "c3", actorName: "Alex Morgan", minutesAgo: 35 },
  { id: "a3", type: "CREATIVE_APPROVED", creativeId: "c2", actorName: "Alex Morgan", minutesAgo: 62 },
  { id: "a4", type: "CREATIVE_UPLOADED", creativeId: "c6", actorName: "Clyntique Team", minutesAgo: 95 },
  { id: "a5", type: "VERSION_UPLOADED", version: 3, creativeId: "c9", actorName: "Clyntique Team", minutesAgo: 140 },
  { id: "a6", type: "CHANGES_REQUESTED", creativeId: "c10", actorName: "Northwind Coffee", minutesAgo: 60 * 3 },
  { id: "a7", type: "CREATIVE_APPROVED", creativeId: "c4", actorName: "Alex Morgan", minutesAgo: 60 * 26 },
  { id: "a8", type: "CREATIVE_APPROVED", creativeId: "c11", actorName: "Northwind Coffee", minutesAgo: 60 * 28 },
  { id: "a9", type: "VERSION_UPLOADED", version: 2, creativeId: "c5", actorName: "Clyntique Team", minutesAgo: 60 * 30 },
  { id: "a10", type: "CREATIVE_APPROVED", creativeId: "c8", actorName: "Alex Morgan", minutesAgo: 60 * 50 },
  { id: "a11", type: "CREATIVE_APPROVED", creativeId: "c15", actorName: "Harbor & Pine", minutesAgo: 60 * 24 * 3 },
];

function projectFullName(p: (typeof PROJECTS)[number]) {
  return `${p.clientName} — ${p.name}`;
}

function visibleProjects(role: Role) {
  return role === "TEAM" ? PROJECTS : PROJECTS.filter((p) => p.clientName === DEMO_CLIENT_ORG);
}

export function getDemoCreatives(role: Role, now = Date.now()): CreativeSummary[] {
  const projects = new Map(visibleProjects(role).map((p) => [p.id, p]));
  return CREATIVES.filter((c) => projects.has(c.projectId))
    // Clients never see drafts that have not been shared yet.
    .filter((c) => role === "TEAM" || c.status !== "DRAFT")
    .map(({ minutesAgo, ...c }) => {
      const project = projects.get(c.projectId)!;
      return {
        ...c,
        projectName: projectFullName(project),
        clientName: project.clientName,
        updatedAt: new Date(now - minutesAgo * 60_000),
      };
    })
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export function getDemoProjects(role: Role, now = Date.now()): ProjectSummary[] {
  const creatives = getDemoCreatives(role, now);
  return visibleProjects(role)
    .map((p) => {
      const own = creatives.filter((c) => c.projectId === p.id);
      const statusCounts: ProjectSummary["statusCounts"] = {};
      for (const c of own) statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1;
      return {
        id: p.id,
        name: p.name,
        clientName: p.clientName,
        creativeCount: own.length,
        statusCounts,
        lastActivityAt: own[0]?.updatedAt ?? new Date(now),
      };
    })
    .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
}

export function getDemoActivity(role: Role, now = Date.now()): ActivityItem[] {
  const projects = new Map(visibleProjects(role).map((p) => [p.id, p]));
  return ACTIVITY.flatMap(({ creativeId, minutesAgo, ...a }) => {
    const creative = CREATIVES.find((c) => c.id === creativeId);
    const project = creative && projects.get(creative.projectId);
    if (!creative || !project) return [];
    return [
      {
        ...a,
        creativeName: creative.name,
        projectName: projectFullName(project),
        createdAt: new Date(now - minutesAgo * 60_000),
      },
    ];
  });
}

// Everything a page needs, resolved against one request time so relative
// timestamps ("12 minutes ago") are consistent across the page.
export function getDemoSnapshot(role: Role) {
  const now = Date.now();
  return {
    now,
    projects: getDemoProjects(role, now),
    creatives: getDemoCreatives(role, now),
    activity: getDemoActivity(role, now),
  };
}
