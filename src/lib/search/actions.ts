"use server";

import { getCurrentUser } from "@/lib/auth/dal";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { projectScope, creativeScope } from "@/lib/data/workspace";
import { recordScope } from "@/lib/data/evidence-records";
import { teamMaySeeRecord } from "@/lib/workflow/evidence-records";
import { searchableScope } from "@/lib/data/library";
import { basePathFor } from "@/lib/navigation";
import type {
  SearchCategoryGroup,
  SearchResponse,
  SearchResultItem,
} from "./types";

interface NavigationShortcut {
  title: string;
  subtitle: string;
  href: string;
  keywords: string[];
  teamOnly?: boolean;
  clientOnly?: boolean;
}

const BASE_NAVIGATION_SHORTCUTS: NavigationShortcut[] = [
  {
    title: "Overview",
    subtitle: "Main workspace dashboard",
    href: "",
    keywords: ["home", "overview", "dashboard", "main"],
  },
  {
    title: "Submissions & Creatives",
    subtitle: "Review workflow & creative assets",
    href: "/creatives",
    keywords: ["creatives", "submissions", "ads", "assets", "campaigns"],
  },
  {
    title: "Projects",
    subtitle: "Organized client campaigns and folders",
    href: "/projects",
    keywords: ["projects", "campaigns", "folders"],
  },
  {
    title: "Evidence Dictionary",
    subtitle: "Reusable substantiation records & clinical trials",
    href: "/evidence",
    keywords: ["evidence", "dictionary", "claims", "studies", "substantiation", "trials", "records"],
  },
  {
    title: "Messages",
    subtitle: "Review conversations and feedback threads",
    href: "/messages",
    keywords: ["messages", "chat", "inbox", "comments", "reviewer"],
  },
  {
    title: "Activity Audit Log",
    subtitle: "Chronological event log and system actions",
    href: "/activity",
    keywords: ["activity", "audit", "history", "events", "timeline"],
  },
  {
    title: "User Profile & Account",
    subtitle: "Edit profile details, avatar and settings",
    href: "/profile",
    keywords: ["profile", "account", "settings", "avatar", "password", "email", "timezone"],
  },
  // Client-only shortcuts
  {
    title: "New Submission",
    subtitle: "Submit a new creative asset for compliance review",
    href: "/submissions/new",
    keywords: ["new submission", "upload creative", "submit ad", "create submission"],
    clientOnly: true,
  },
  {
    title: "Plans & Add-ons",
    subtitle: "Subscription tiers and compliance add-ons",
    href: "/plans",
    keywords: ["plans", "subscription", "pricing", "tier", "billing", "add-ons"],
    clientOnly: true,
  },
  {
    title: "Compliance Policy Dashboard",
    subtitle: "Public compliance rules and regulatory standards",
    href: "/policy-dashboard",
    keywords: ["policy", "rules", "regulations", "ftc", "moh", "compliance"],
    clientOnly: true,
  },
  // Team-only shortcuts
  {
    title: "Review Queue",
    subtitle: "Submissions awaiting team review and decision",
    href: "/review",
    keywords: ["review", "queue", "pending", "inbox", "submissions waiting", "approvals"],
    teamOnly: true,
  },
  {
    title: "Compliance Policy Library",
    subtitle: "Manage, verify and audit healthcare compliance rules",
    href: "/policy-library",
    keywords: ["policy library", "rules", "sources", "maker-checker", "verification", "standards"],
    teamOnly: true,
  },
  {
    title: "Policy Dashboard",
    subtitle: "Global compliance coverage and regulatory metrics",
    href: "/policy-dashboard",
    keywords: ["policy dashboard", "metrics", "coverage", "analytics"],
    teamOnly: true,
  },
  {
    title: "Source Monitoring",
    subtitle: "Audit official healthcare regulatory websites",
    href: "/policy-library/monitoring",
    keywords: ["monitoring", "crawling", "audit", "sources", "scrapers"],
    teamOnly: true,
  },
  {
    title: "Rule Changes & Impact",
    subtitle: "Track version changes and retroactive impact",
    href: "/policy-library/impact",
    keywords: ["impact", "changes", "versions", "retroactive", "audit trail"],
    teamOnly: true,
  },
];

const RESULTS_PER_GROUP = 4;
// TEAM rows are narrowed after the query (snapshot and evidence rules), so fetch a few more.
const OVERFETCH = 12;

function contains(query: string) {
  return { contains: query, mode: "insensitive" as const };
}

function ownCreativeMatch(query: string): Prisma.CreativeWhereInput {
  return { OR: [{ name: contains(query) }, { description: contains(query) }] };
}

/**
 * TEAM: a submission matches on what the client submitted (round snapshots);
 * team-created legacy creatives, which have no rounds, match on their own fields.
 * The latest-round check happens in teamVisibleCreative.
 */
function teamCreativeMatch(query: string): Prisma.CreativeWhereInput {
  return {
    OR: [
      { workflow: "LEGACY_CLIENT_APPROVAL", OR: [{ name: contains(query) }, { description: contains(query) }] },
      { rounds: { some: { OR: [{ submittedName: contains(query) }, { submittedDescription: contains(query) }] } } },
      // Rounds written before snapshots existed fall back to the creative's fields, as the review pages do.
      { rounds: { some: { submittedName: null } }, OR: [{ name: contains(query) }, { description: contains(query) }] },
    ],
  };
}

type TeamCreativeRow = {
  name: string;
  description: string | null;
  workflow: string;
  rounds: { submittedName: string | null; submittedDescription: string | null }[];
};

/** The title TEAM may see when its latest submitted snapshot matches the query; null otherwise. */
function teamVisibleCreative(c: TeamCreativeRow, query: string): string | null {
  const q = query.toLowerCase();
  const has = (v: string | null | undefined) => Boolean(v && v.toLowerCase().includes(q));
  if (c.workflow === "LEGACY_CLIENT_APPROVAL") return has(c.name) || has(c.description) ? c.name : null;
  const latest = c.rounds[0];
  if (!latest) return null; // never submitted: the team has not received it
  const name = latest.submittedName ?? c.name;
  const description = latest.submittedName === null ? c.description : latest.submittedDescription;
  return has(name) || has(description) ? name : null;
}

export async function searchGlobal(rawQuery: string): Promise<SearchResponse> {
  const startTime = performance.now();
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized: Sign in required to use Global Search.");
  }

  const query = (rawQuery ?? "").trim().slice(0, 80);
  const base = basePathFor(user.role);

  // Quick navigation shortcuts available to this user
  const availableShortcuts = BASE_NAVIGATION_SHORTCUTS.filter((s) => {
    if (s.teamOnly && user.role !== "TEAM") return false;
    if (s.clientOnly && user.role !== "CLIENT") return false;
    return true;
  });

  // If query is short (< 2 chars), return default quick navigation shortcuts
  if (query.length < 2) {
    const navItems: SearchResultItem[] = availableShortcuts.slice(0, 6).map((s, idx) => ({
      id: `nav-${idx}`,
      category: "navigation",
      title: s.title,
      subtitle: s.subtitle,
      badge: "Jump",
      href: s.href.startsWith("/") && !s.href.startsWith(base) && s.href !== "/policy-dashboard"
        ? `${base}${s.href}`
        : s.href.startsWith("/policy-dashboard")
        ? s.href
        : `${base}${s.href}`,
      iconName: "CompassIcon",
    }));

    return {
      query,
      totalHits: navItems.length,
      groups: [
        {
          category: "navigation",
          label: "Quick Navigation",
          items: navItems,
        },
      ],
      durationMs: Math.round(performance.now() - startTime),
    };
  }

  const qLower = query.toLowerCase();

  // 1. Navigation matches
  const matchedNav = availableShortcuts
    .filter((s) => {
      const matchTitle = s.title.toLowerCase().includes(qLower);
      const matchSubtitle = s.subtitle.toLowerCase().includes(qLower);
      const matchKeyword = s.keywords.some((kw) => kw.includes(qLower));
      return matchTitle || matchSubtitle || matchKeyword;
    })
    .slice(0, 4)
    .map((s, idx): SearchResultItem => ({
      id: `nav-match-${idx}`,
      category: "navigation",
      title: s.title,
      subtitle: s.subtitle,
      badge: "Jump",
      href: s.href.startsWith("/") && !s.href.startsWith(base) && s.href !== "/policy-dashboard"
        ? `${base}${s.href}`
        : s.href.startsWith("/policy-dashboard")
        ? s.href
        : `${base}${s.href}`,
      iconName: "CompassIcon",
    }));

  // Parallel Database Queries with strict permission scoping
  const [projectsResult, creativesResult, evidenceResult, knowledgeResult, policiesResult] =
    await Promise.all([
      // 2. Projects
      prisma.project.findMany({
        where: {
          AND: [
            projectScope(user),
            {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { description: { contains: query, mode: "insensitive" } },
              ],
            },
          ],
        },
        select: {
          id: true,
          name: true,
          description: true,
          client: { select: { name: true } },
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 4,
      }),

      // 3. Creatives / Submissions. TEAM matches what the client submitted
      // (the latest round's snapshot), never later unsubmitted edits.
      prisma.creative.findMany({
        where: {
          AND: [
            creativeScope(user),
            user.role === "TEAM" ? teamCreativeMatch(query) : ownCreativeMatch(query),
          ],
        },
        select: {
          id: true,
          name: true,
          description: true,
          format: true,
          status: true,
          workflow: true,
          project: { select: { id: true, name: true } },
          rounds: {
            orderBy: { submittedAt: "desc" },
            take: 1,
            select: { submittedName: true, submittedDescription: true },
          },
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: user.role === "TEAM" ? OVERFETCH : RESULTS_PER_GROUP,
      }),

      // 4. Evidence Dictionary Records. recordScope is a superset for TEAM:
      // the attachments are loaded so teamMaySeeRecord can drop records the
      // client attached after their last submission (same rule as the pages).
      prisma.evidenceRecord.findMany({
        where: {
          AND: [
            recordScope(user),
            {
              OR: [
                { title: { contains: query, mode: "insensitive" } },
                { claimText: { contains: query, mode: "insensitive" } },
                { source: { contains: query, mode: "insensitive" } },
              ],
            },
          ],
        },
        select: {
          id: true,
          title: true,
          claimText: true,
          source: true,
          status: true,
          type: true,
          ownerClientId: true,
          attachments: {
            select: {
              createdAt: true,
              withdrawnAt: true,
              creative: {
                select: {
                  workflow: true,
                  status: true,
                  rounds: { orderBy: { submittedAt: "desc" }, take: 1, select: { submittedAt: true } },
                },
              },
            },
          },
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: user.role === "TEAM" ? OVERFETCH : RESULTS_PER_GROUP,
      }),

      // 5. Accessible Knowledge Base Documents
      prisma.libraryDocument.findMany({
        where: {
          AND: [
            searchableScope(user),
            {
              OR: [
                { title: { contains: query, mode: "insensitive" } },
                { fileName: { contains: query, mode: "insensitive" } },
                { source: { contains: query, mode: "insensitive" } },
              ],
            },
          ],
        },
        select: {
          id: true,
          title: true,
          fileName: true,
          source: true,
          type: true,
          status: true,
          visibility: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 4,
      }),

      // 6. Applicable Policy Library Rules
      prisma.policyRule.findMany({
        where: {
          AND: [
            user.role === "CLIENT"
              ? {
                  versions: {
                    some: {
                      status: "ACTIVE",
                      verificationStatus: "VERIFIED",
                    },
                  },
                }
              : {},
            {
              OR: [
                { code: { contains: query, mode: "insensitive" } },
                { title: { contains: query, mode: "insensitive" } },
                {
                  versions: {
                    some: {
                      OR: [
                        { title: { contains: query, mode: "insensitive" } },
                        { summary: { contains: query, mode: "insensitive" } },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
        select: {
          id: true,
          code: true,
          title: true,
          jurisdictionCode: true,
          category: true,
          currentVersionNumber: true,
          versions: {
            // A client only ever sees the summary of the ACTIVE + VERIFIED version, never a newer draft.
            where: user.role === "CLIENT" ? { status: "ACTIVE", verificationStatus: "VERIFIED" } : undefined,
            select: {
              versionNumber: true,
              summary: true,
              status: true,
              verificationStatus: true,
            },
            orderBy: { versionNumber: "desc" },
            take: 1,
          },
        },
        orderBy: { code: "asc" },
        take: 4,
      }),
    ]);

  // Transform Projects
  const projectItems: SearchResultItem[] = projectsResult.map((p) => ({
    id: `project-${p.id}`,
    category: "projects",
    title: p.name,
    subtitle: user.role === "TEAM" ? `Client: ${p.client.name}` : p.description || "Active project",
    badge: "Project",
    href: `${base}/projects/${p.id}`,
    iconName: "FolderIcon",
  }));

  // Transform Creatives
  const creativeItems: SearchResultItem[] = creativesResult
    .map((c) => ({ c, title: user.role === "TEAM" ? teamVisibleCreative(c, query) : c.name }))
    .filter((x): x is { c: (typeof creativesResult)[number]; title: string } => x.title !== null)
    .slice(0, RESULTS_PER_GROUP)
    .map(({ c, title }) => ({
    id: `creative-${c.id}`,
    category: "creatives",
    title,
    subtitle: `${c.project.name} · ${c.format}`,
    badge: c.status.replace(/_/g, " "),
    href: `${base}/creatives/${c.id}`,
    iconName: "ImageIcon",
  }));

  // Transform Evidence Records
  const evidenceItems: SearchResultItem[] = evidenceResult
    .filter(
      (e) =>
        user.role === "CLIENT" ||
        teamMaySeeRecord({
          ownerClientId: e.ownerClientId,
          attachments: e.attachments.map((a) => ({
            createdAt: a.createdAt,
            withdrawnAt: a.withdrawnAt,
            creative: {
              workflow: a.creative.workflow,
              status: a.creative.status,
              lastSubmittedAt: a.creative.rounds[0]?.submittedAt ?? null,
            },
          })),
        }),
    )
    .slice(0, RESULTS_PER_GROUP)
    .map((e) => ({
    id: `evidence-${e.id}`,
    category: "evidence",
    title: e.title,
    subtitle: e.claimText ? `Claim: ${e.claimText.slice(0, 60)}` : e.source || "Evidence Record",
    badge: e.status.replace(/_/g, " "),
    href: `${base}/evidence/${e.id}`,
    iconName: "BookOpenIcon",
  }));

  // Transform Knowledge Base Documents
  const knowledgeItems: SearchResultItem[] = knowledgeResult.map((d) => ({
    id: `knowledge-${d.id}`,
    category: "knowledge",
    title: d.title,
    subtitle: `${d.fileName} · ${d.type}`,
    badge: d.visibility === "TEAM" ? "Shared" : "Library",
    href: `${base}/evidence/library/${d.id}`,
    iconName: "DocumentIcon",
  }));

  // Transform Policy Rules
  const policyItems: SearchResultItem[] = policiesResult.map((r) => {
    const v = r.versions[0];
    const destination =
      user.role === "TEAM"
        ? `/admin/policy-library?rule=${r.id}`
        : `/policy-dashboard?rule=${r.id}`;

    return {
      id: `policy-${r.id}`,
      category: "policies",
      title: `${r.code}: ${r.title}`,
      subtitle: v?.summary ? v.summary.slice(0, 75) + "..." : `${r.jurisdictionCode} · ${r.category}`,
      badge: r.jurisdictionCode,
      href: destination,
      iconName: "ShieldIcon",
    };
  });

  const groups: SearchCategoryGroup[] = [];

  if (matchedNav.length > 0) {
    groups.push({ category: "navigation", label: "Navigation Shortcuts", items: matchedNav });
  }
  if (projectItems.length > 0) {
    groups.push({ category: "projects", label: "Projects", items: projectItems });
  }
  if (creativeItems.length > 0) {
    groups.push({ category: "creatives", label: "Creatives & Submissions", items: creativeItems });
  }
  if (evidenceItems.length > 0) {
    groups.push({ category: "evidence", label: "Evidence Dictionary", items: evidenceItems });
  }
  if (knowledgeItems.length > 0) {
    groups.push({ category: "knowledge", label: "Knowledge Base Documents", items: knowledgeItems });
  }
  if (policyItems.length > 0) {
    groups.push({ category: "policies", label: "Compliance Policy Rules", items: policyItems });
  }

  const totalHits =
    matchedNav.length +
    projectItems.length +
    creativeItems.length +
    evidenceItems.length +
    knowledgeItems.length +
    policyItems.length;

  const durationMs = Math.round(performance.now() - startTime);

  return {
    query,
    totalHits,
    groups,
    durationMs,
  };
}
