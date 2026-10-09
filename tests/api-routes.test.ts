import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { CurrentUser } from "@/lib/auth/dal";
import { CLIENT_A, CLIENT_B, TEAM, createPrismaMock, installCreativeStore, type PrismaMock } from "./helpers";

const h = vi.hoisted(() => ({
  user: null as CurrentUser | null,
  prisma: null as unknown as PrismaMock,
  configured: true,
  readBlob: null as unknown as Mock,
}));

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return h.prisma;
  },
}));
vi.mock("@/lib/auth/dal", () => ({ getCurrentUser: vi.fn(async () => h.user) }));
// Runs the route's own token check, like the real SDK does, then "issues" a token.
vi.mock("@vercel/blob/client", () => ({
  handleUpload: vi.fn(
    async ({ body, onBeforeGenerateToken }: { body: { payload: { pathname: string; clientPayload: string } }; onBeforeGenerateToken: (p: string, c: string) => Promise<unknown> }) => {
      await onBeforeGenerateToken(body.payload.pathname, body.payload.clientPayload);
      return { type: "blob.generate-client-token", clientToken: "test-token" };
    },
  ),
}));
vi.mock("@/lib/review/blob", () => ({
  uploadsConfigured: () => h.configured,
  readBlob: (...args: unknown[]) => h.readBlob(...args),
}));

const upload = await import("@/app/api/creatives/upload/route");
const media = await import("@/app/api/media/[versionId]/route");

const KEY = "00000000-0000-4000-8000-000000000000";

/** A token request for a PNG upload to the given creative, with the server-built path. */
function uploadRequest(creativeId = "cr-a-review") {
  const clientPayload = JSON.stringify({ creativeId, uploadKey: KEY, fileName: "ad.png" });
  return new Request("http://localhost/api/creatives/upload", {
    method: "POST",
    body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname: `creatives/${creativeId}/${KEY}.png`, clientPayload } }),
  });
}

function mediaRequest(versionId: string) {
  return media.GET(new Request(`http://localhost/api/media/${versionId}`), {
    params: Promise.resolve({ versionId }),
  } as Parameters<typeof media.GET>[1]);
}

beforeEach(() => {
  h.prisma = createPrismaMock();
  installCreativeStore(h.prisma);
  h.user = null;
  h.configured = true;
  h.readBlob = vi.fn(async () => ({ statusCode: 200, stream: new ReadableStream(), headers: new Headers() }));
});

describe("POST /api/creatives/upload (upload tokens)", () => {
  it("requires a signed-in user", async () => {
    expect((await upload.POST(uploadRequest())).status).toBe(401);
  });

  it("denies CLIENT uploads to legacy creatives (team-owned workflow)", async () => {
    h.user = CLIENT_A;
    expect((await upload.POST(uploadRequest("cr-a-review"))).status).toBe(403);
  });

  it("issues a token to the owning CLIENT for their own draft submission", async () => {
    h.user = CLIENT_A;
    const res = await upload.POST(uploadRequest("sub-a-draft"));
    expect(res.status).toBe(200);
  });

  it("denies another client's submission (cross-client), and a submitted (locked) one", async () => {
    h.user = CLIENT_B;
    expect((await upload.POST(uploadRequest("sub-a-draft"))).status).toBe(400); // looks missing
    h.user = CLIENT_A;
    expect((await upload.POST(uploadRequest("sub-a-submitted"))).status).toBe(403);
  });

  it("denies TEAM uploads into client submissions, but keeps TEAM uploads for legacy creatives", async () => {
    h.user = TEAM;
    expect((await upload.POST(uploadRequest("sub-a-submitted"))).status).toBe(403);
    expect((await upload.POST(uploadRequest("sub-a-draft"))).status).toBe(400); // client drafts are invisible to TEAM
    expect((await upload.POST(uploadRequest("cr-a-review"))).status).toBe(200);
  });

  it("reports when uploads are not configured", async () => {
    h.user = TEAM;
    h.configured = false;
    expect((await upload.POST(uploadRequest())).status).toBe(503);
  });
});

describe("GET /api/media/[versionId]", () => {
  it("requires a signed-in user", async () => {
    expect((await mediaRequest("v-a-1")).status).toBe(401);
    expect(h.readBlob).not.toHaveBeenCalled();
  });

  it("returns 404 for another client's file (cross-client denial)", async () => {
    h.user = CLIENT_B;
    expect((await mediaRequest("v-a-1")).status).toBe(404);
    expect(h.readBlob).not.toHaveBeenCalled();
  });

  it("returns 404 for a draft's file, even to the project's client (draft privacy)", async () => {
    h.user = CLIENT_A;
    expect((await mediaRequest("v-a-draft-1")).status).toBe(404);
    expect(h.readBlob).not.toHaveBeenCalled();
  });

  it("streams the client's own file with safe headers", async () => {
    h.user = CLIENT_A;
    const res = await mediaRequest("v-a-1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
  });

  it("lets TEAM read legacy draft files", async () => {
    h.user = TEAM;
    expect((await mediaRequest("v-a-draft-1")).status).toBe(200);
  });

  it("never serves a client's draft submission file to TEAM (draft privacy)", async () => {
    h.user = TEAM;
    expect((await mediaRequest("v-sub-a-draft-1")).status).toBe(404);
    expect(h.readBlob).not.toHaveBeenCalled();
    expect((await mediaRequest("v-sub-a-submitted-1")).status).toBe(200);
  });

  it("serves a client their own draft submission file, but not another client's (file ownership)", async () => {
    h.user = CLIENT_A;
    expect((await mediaRequest("v-sub-a-draft-1")).status).toBe(200);
    expect((await mediaRequest("v-sub-b-draft-1")).status).toBe(404);
  });
});
