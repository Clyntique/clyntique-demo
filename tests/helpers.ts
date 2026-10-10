import { vi } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";

// Shared fixtures. Every id and name is fictional.

export const TEAM: CurrentUser = { id: "team-1", name: "Test Team", email: "team@test.invalid", role: "TEAM" };
export const CLIENT_A: CurrentUser = { id: "client-a", name: "Client A", email: "a@test.invalid", role: "CLIENT" };
export const CLIENT_B: CurrentUser = { id: "client-b", name: "Client B", email: "b@test.invalid", role: "CLIENT" };

/** A Prisma stand-in: every model method is a vi.fn() that resolves to null/empty by default. */
export function createPrismaMock() {
  const model = () => ({
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockResolvedValue({ id: "new-id" }),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    createManyAndReturn: vi.fn().mockResolvedValue([]),
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    groupBy: vi.fn().mockResolvedValue([]),
  });
  const prisma = {
    user: model(),
    project: model(),
    creative: model(),
    creativeVersion: model(),
    evidence: model(),
    comment: model(),
    approval: model(),
    activity: model(),
    reviewCycle: model(),
    submissionRound: model(),
    reviewDecision: model(),
    finding: model(),
    findingEvent: model(),
    findingResponse: model(),
    findingEvidence: model(),
    findingMarket: model(),
    findingPlatform: model(),
    market: model(),
    adPlatform: model(),
    submissionMarket: model(),
    submissionPlatform: model(),
    loginAttempt: model(),
    $transaction: vi.fn(),
  };
  // Interactive transactions run the callback against the same mock.
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  return prisma;
}

export type PrismaMock = ReturnType<typeof createPrismaMock>;

export function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

/** Collects every `where` passed to a mocked Prisma method. */
export function wheres(fn: ReturnType<typeof vi.fn>) {
  return fn.mock.calls.map((call) => (call[0] as { where?: unknown } | undefined)?.where);
}


// ---------------------------------------------------------------------------
// A tiny in-memory stand-in for the creative / version lookups, so access tests
// exercise the real scope objects built by src/lib/data/workspace.ts.

export type CreativeRow = {
  id: string;
  name: string;
  status: string;
  workflow: "LEGACY_CLIENT_APPROVAL" | "SUBMISSION_REVIEW";
  projectId: string;
  clientId: string;
};
export type VersionRow = { id: string; creativeId: string; versionNumber: number; fileUrl: string; mimeType: string };

export const CREATIVES: CreativeRow[] = [
  // Legacy (pre-compliance) records.
  { id: "cr-a-review", name: "A in review", status: "IN_REVIEW", workflow: "LEGACY_CLIENT_APPROVAL", projectId: "p-a", clientId: CLIENT_A.id },
  { id: "cr-a-draft", name: "A draft", status: "DRAFT", workflow: "LEGACY_CLIENT_APPROVAL", projectId: "p-a", clientId: CLIENT_A.id },
  { id: "cr-b-review", name: "B in review", status: "IN_REVIEW", workflow: "LEGACY_CLIENT_APPROVAL", projectId: "p-b", clientId: CLIENT_B.id },
  // Client-owned submissions.
  { id: "sub-a-draft", name: "A submission draft", status: "DRAFT", workflow: "SUBMISSION_REVIEW", projectId: "p-a", clientId: CLIENT_A.id },
  { id: "sub-a-submitted", name: "A submitted", status: "SUBMITTED", workflow: "SUBMISSION_REVIEW", projectId: "p-a", clientId: CLIENT_A.id },
  { id: "sub-a-review", name: "A under review", status: "IN_REVIEW", workflow: "SUBMISSION_REVIEW", projectId: "p-a", clientId: CLIENT_A.id },
  { id: "sub-b-draft", name: "B submission draft", status: "DRAFT", workflow: "SUBMISSION_REVIEW", projectId: "p-b", clientId: CLIENT_B.id },
];

const blob = (name: string) => `https://x.private.blob.vercel-storage.com/${name}.png`;
export const VERSIONS: VersionRow[] = [
  { id: "v-a-1", creativeId: "cr-a-review", versionNumber: 1, fileUrl: blob("a1"), mimeType: "image/png" },
  { id: "v-a-draft-1", creativeId: "cr-a-draft", versionNumber: 1, fileUrl: blob("ad1"), mimeType: "image/png" },
  { id: "v-b-1", creativeId: "cr-b-review", versionNumber: 1, fileUrl: blob("b1"), mimeType: "image/png" },
  { id: "v-sub-a-draft-1", creativeId: "sub-a-draft", versionNumber: 1, fileUrl: blob("sad1"), mimeType: "image/png" },
  { id: "v-sub-a-submitted-1", creativeId: "sub-a-submitted", versionNumber: 1, fileUrl: blob("sas1"), mimeType: "image/png" },
  { id: "v-sub-b-draft-1", creativeId: "sub-b-draft", versionNumber: 1, fileUrl: blob("sbd1"), mimeType: "image/png" },
];

type Where = Record<string, unknown> | undefined;

/** Evaluates the subset of Prisma `where` syntax used by creativeScope / access.ts. */
export function matchesCreative(where: Where, row: CreativeRow): boolean {
  if (!where) return true;
  for (const [key, value] of Object.entries(where)) {
    if (key === "AND") {
      if (!(value as Where[]).every((w) => matchesCreative(w, row))) return false;
    } else if (key === "OR") {
      if (!(value as Where[]).some((w) => matchesCreative(w, row))) return false;
    } else if (key === "NOT") {
      if (matchesCreative(value as Where, row)) return false;
    } else if (key === "id") {
      if (value !== row.id) return false;
    } else if (key === "workflow") {
      if (value !== row.workflow) return false;
    } else if (key === "project") {
      const clientId = (value as { clientId?: string }).clientId;
      if (clientId !== undefined && clientId !== row.clientId) return false;
    } else if (key === "status") {
      if (typeof value === "string" ? value !== row.status : (value as { not?: string }).not === row.status) return false;
    } else {
      throw new Error(`matchesCreative: unsupported where key ${key}`);
    }
  }
  return true;
}

export function installCreativeStore(prisma: PrismaMock) {
  prisma.creative.findFirst.mockImplementation(async ({ where }: { where: Where }) => {
    const row = CREATIVES.find((c) => matchesCreative(where, c));
    return row
      ? { id: row.id, name: row.name, status: row.status, workflow: row.workflow, projectId: row.projectId, project: { name: "P", clientId: row.clientId } }
      : null;
  });
  prisma.creativeVersion.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    const row = VERSIONS.find((v) => {
      if (where.id !== undefined && where.id !== v.id) return false;
      if (where.creativeId !== undefined && where.creativeId !== v.creativeId) return false;
      if (where.fileUrl !== undefined) return false;
      const creative = CREATIVES.find((c) => c.id === v.creativeId)!;
      return where.creative === undefined || matchesCreative(where.creative as Where, creative);
    });
    return row ?? null;
  });
}
