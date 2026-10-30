import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression test for the Production upload failure of Oct 30, 2026: with a
// BLOB_STORE_ID for another store present (and OIDC available on Vercel), the
// SDK looked up new files in the wrong store because no token was passed.
// Every server-side Blob call must carry BLOB_READ_WRITE_TOKEN explicitly.

const sdk = vi.hoisted(() => ({
  head: vi.fn<(url: string, options?: unknown) => Promise<{ pathname: string; size: number; contentType: string }>>(async () => ({ pathname: "creatives/x/y.png", size: 10, contentType: "image/png" })),
  get: vi.fn<(url: string, options?: unknown) => Promise<{ statusCode: number; stream: ReadableStream<Uint8Array> }>>(async () => ({ statusCode: 200, stream: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0])); c.close(); } }) })),
  del: vi.fn<(url: string, options?: unknown) => Promise<undefined>>(async () => undefined),
}));
vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", () => sdk);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    creativeVersion: { findFirst: vi.fn(async () => null) },
    evidence: { findFirst: vi.fn(async () => null) },
  },
}));

const URL_IN_STORE = "https://abc.private.blob.vercel-storage.com/creatives/x/y.png";

describe("server-side Blob calls pass the read-write token explicitly", () => {
  const env = process.env;
  beforeEach(() => {
    vi.resetModules();
    sdk.head.mockClear();
    sdk.get.mockClear();
    sdk.del.mockClear();
    process.env = { ...env, BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_store1_secret", BLOB_STORE_ID: "store_other" };
  });
  afterEach(() => {
    process.env = env;
  });

  it("head, get and del carry the token so BLOB_STORE_ID cannot redirect them", async () => {
    const blob = await import("@/lib/review/blob");
    await blob.headBlob(URL_IN_STORE);
    expect(sdk.head).toHaveBeenCalledWith(URL_IN_STORE, { token: "vercel_blob_rw_store1_secret" });

    await expect(blob.contentMatches(URL_IN_STORE, "image/png")).resolves.toBe(true);
    expect(sdk.get.mock.calls[0][1]).toMatchObject({ access: "private", token: "vercel_blob_rw_store1_secret" });

    blob.readBlob(URL_IN_STORE, { range: "bytes=0-1" });
    expect(sdk.get.mock.calls[1][1]).toMatchObject({ access: "private", token: "vercel_blob_rw_store1_secret" });

    await expect(blob.deleteUnreferencedBlob(URL_IN_STORE)).resolves.toBe(true);
    expect(sdk.del).toHaveBeenCalledWith(URL_IN_STORE, { token: "vercel_blob_rw_store1_secret" });
  });

  it("falls back to the SDK's own credential lookup when no token is set", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const blob = await import("@/lib/review/blob");
    await blob.headBlob(URL_IN_STORE);
    expect(sdk.head).toHaveBeenCalledWith(URL_IN_STORE, {});
  });
});
