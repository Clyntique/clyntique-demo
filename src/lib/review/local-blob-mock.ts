/*
 * Local-only stand-in for Vercel Blob (P0 local validation on GT, Oct 29).
 *
 * The Blob SDK can talk to another API origin (VERCEL_BLOB_API_URL /
 * NEXT_PUBLIC_VERCEL_BLOB_API_URL). scripts/local-blob-mock.mjs serves that
 * API on localhost so uploads can be tested without any real store. The app
 * accepts files from the mock origin only while every condition below holds,
 * so on Vercel (VERCEL is always set there) nothing changes:
 *
 * - CLYNTIQUE_LOCAL_BLOB_MOCK is an http://localhost or http://127.0.0.1 origin,
 *   and VERCEL_BLOB_API_URL / NEXT_PUBLIC_VERCEL_BLOB_API_URL point at it;
 * - not running on Vercel (no VERCEL / VERCEL_ENV);
 * - DATABASE_URL points at a local database;
 * - BLOB_READ_WRITE_TOKEN belongs to the fake store "localmock", so a real
 *   token is never sent to the mock and the mock never stands in for a real store.
 */

type Env = Record<string, string | undefined>;

export const LOCAL_MOCK_STORE_ID = "localmock";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

function localOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname) ? url.origin : null;
  } catch {
    return null;
  }
}

/** True when any mock setting is present, whether or not it is valid. */
export function localBlobMockRequested(env: Env = process.env) {
  return Boolean(env.CLYNTIQUE_LOCAL_BLOB_MOCK || env.VERCEL_BLOB_API_URL || env.NEXT_PUBLIC_VERCEL_BLOB_API_URL);
}

/** The mock's origin when the local mock is safely enabled, otherwise null. */
export function localBlobMockOrigin(env: Env = process.env): string | null {
  if (env.VERCEL || env.VERCEL_ENV) return null;
  const origin = localOrigin(env.CLYNTIQUE_LOCAL_BLOB_MOCK);
  if (!origin) return null;
  const api = env.VERCEL_BLOB_API_URL ?? env.NEXT_PUBLIC_VERCEL_BLOB_API_URL;
  if (localOrigin(api) !== origin) return null;
  let dbHost: string;
  try {
    dbHost = new URL(env.DATABASE_URL ?? "").hostname;
  } catch {
    return null;
  }
  if (!LOCAL_HOSTS.has(dbHost)) return null;
  if ((env.BLOB_READ_WRITE_TOKEN ?? "").split("_")[3] !== LOCAL_MOCK_STORE_ID) return null;
  return origin;
}
