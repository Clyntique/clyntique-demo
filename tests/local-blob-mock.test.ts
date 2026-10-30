import { describe, expect, it } from "vitest";
import { localBlobMockOrigin, localBlobMockRequested } from "@/lib/review/local-blob-mock";

const LOCAL = {
  CLYNTIQUE_LOCAL_BLOB_MOCK: "http://127.0.0.1:3999",
  VERCEL_BLOB_API_URL: "http://127.0.0.1:3999",
  DATABASE_URL: "postgresql://postgres@localhost:5432/p0_local",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_localmock_abc123",
};

describe("local Blob mock guard", () => {
  it("is on only when every local condition holds", () => {
    expect(localBlobMockOrigin(LOCAL)).toBe("http://127.0.0.1:3999");
    expect(localBlobMockOrigin({ ...LOCAL, VERCEL_BLOB_API_URL: undefined, NEXT_PUBLIC_VERCEL_BLOB_API_URL: "http://127.0.0.1:3999" })).toBe("http://127.0.0.1:3999");
  });

  it("is never on in a Vercel deployment", () => {
    expect(localBlobMockOrigin({ ...LOCAL, VERCEL: "1" })).toBeNull();
    expect(localBlobMockOrigin({ ...LOCAL, VERCEL_ENV: "preview" })).toBeNull();
  });

  it("refuses a remote database, a real token, a non-local or https origin, or a mismatched API URL", () => {
    expect(localBlobMockOrigin({ ...LOCAL, DATABASE_URL: "postgresql://u:p@dpg-x.ohio-postgres.render.com/cyntique_demo" })).toBeNull();
    expect(localBlobMockOrigin({ ...LOCAL, BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_Jt54hjvYZVnWd7R4_secret" })).toBeNull();
    expect(localBlobMockOrigin({ ...LOCAL, CLYNTIQUE_LOCAL_BLOB_MOCK: "http://evil.example:3999", VERCEL_BLOB_API_URL: "http://evil.example:3999" })).toBeNull();
    expect(localBlobMockOrigin({ ...LOCAL, CLYNTIQUE_LOCAL_BLOB_MOCK: "https://127.0.0.1:3999", VERCEL_BLOB_API_URL: "https://127.0.0.1:3999" })).toBeNull();
    expect(localBlobMockOrigin({ ...LOCAL, VERCEL_BLOB_API_URL: "http://127.0.0.1:4000" })).toBeNull();
    expect(localBlobMockOrigin({ ...LOCAL, VERCEL_BLOB_API_URL: undefined })).toBeNull();
    expect(localBlobMockOrigin({})).toBeNull();
  });

  it("reports any mock setting so the build can refuse it on Vercel", () => {
    expect(localBlobMockRequested({})).toBe(false);
    expect(localBlobMockRequested({ NEXT_PUBLIC_VERCEL_BLOB_API_URL: "http://127.0.0.1:3999" })).toBe(true);
  });
});
