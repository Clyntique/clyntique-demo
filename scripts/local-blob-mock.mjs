// Local stand-in for the Vercel Blob API, for local testing only (see
// src/lib/review/local-blob-mock.ts for the guards on the app side).
//
// Stores files on local disk, never contacts Vercel. Enforces what the real
// API enforces for client uploads: the client token's HMAC signature, expiry,
// exact pathname, allowed content type and maximum size. Reads need the
// read-write token, like a private store.
//
//   BLOB_READ_WRITE_TOKEN=vercel_blob_rw_localmock_<random> \
//   node scripts/local-blob-mock.mjs --port 3999 --dir <folder outside the repo>
//
// App settings for the same shell (local build and start):
//   CLYNTIQUE_LOCAL_BLOB_MOCK=http://localhost:3999
//   VERCEL_BLOB_API_URL=http://localhost:3999
//   NEXT_PUBLIC_VERCEL_BLOB_API_URL=http://localhost:3999   (needed at build time)
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve, sep } from "node:path";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i > -1 ? argv[i + 1] : fallback;
};
const PORT = Number(arg("--port", "3999"));
const DIR = resolve(arg("--dir", ""));
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN ?? "";
if (!arg("--dir")) throw new Error("Pass --dir <folder outside the repo>.");
if (TOKEN.split("_")[3] !== "localmock") throw new Error("BLOB_READ_WRITE_TOKEN must be a fake token for store 'localmock' (vercel_blob_rw_localmock_<random>).");
// localhost, not 127.0.0.1: the SDK sends plain (non-streamed) bodies only to http://localhost,
// which browsers need over HTTP/1.1.
const ORIGIN = `http://localhost:${PORT}`;
mkdirSync(DIR, { recursive: true });

const fileOf = (pathname) => {
  const p = resolve(DIR, "files", pathname);
  if (!p.startsWith(resolve(DIR, "files") + sep)) throw new Error("bad path");
  return p;
};
const metaOf = (pathname) => `${fileOf(pathname)}.meta.json`;
const readMeta = (pathname) => (existsSync(metaOf(pathname)) ? JSON.parse(readFileSync(metaOf(pathname), "utf8")) : null);
const pathOfUrl = (u) => {
  const url = new URL(u, ORIGIN);
  return url.origin === ORIGIN ? decodeURIComponent(url.pathname.slice(1)) : null;
};
const describe = (pathname, meta) => {
  const url = `${ORIGIN}/${pathname}`;
  return {
    url,
    downloadUrl: `${url}?download=1`,
    pathname,
    size: meta.size,
    uploadedAt: meta.uploadedAt,
    contentType: meta.contentType,
    contentDisposition: `inline; filename="${pathname.split("/").pop()}"`,
    cacheControl: "public, max-age=2592000",
    etag: meta.etag,
  };
};

function same(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Returns { kind: "rw" } or { kind: "client", payload }; throws when the token is not valid. */
function authorize(req) {
  const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  if (token && same(token, TOKEN)) return { kind: "rw" };
  const [, , kind, store, encoded] = token.split("_");
  if (kind !== "client" || store !== "localmock" || !encoded) throw Object.assign(new Error("forbidden"), { status: 403 });
  const [signature, payload] = Buffer.from(encoded, "base64").toString().split(".");
  const expected = createHmac("sha256", TOKEN).update(payload ?? "").digest("hex");
  if (!signature || !same(signature, expected)) throw Object.assign(new Error("bad signature"), { status: 403 });
  const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
  if (typeof decoded.validUntil !== "number" || decoded.validUntil < Date.now()) throw Object.assign(new Error("token expired"), { status: 403 });
  return { kind: "client", payload: decoded };
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "*");
    res.setHeader("Access-Control-Expose-Headers", "etag, content-length, content-range");
  }
}
const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const fail = (res, status, code, message) => json(res, status, { error: { code, message } });
const body = (req) =>
  new Promise((ok, ko) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => ok(Buffer.concat(chunks)));
    req.on("error", ko);
  });

async function put(req, res, url) {
  const auth = authorize(req);
  let pathname = url.searchParams.get("pathname") ?? "";
  if (!pathname || pathname.includes("..")) return fail(res, 400, "bad_request", "pathname required");
  const contentType = String(req.headers["x-content-type"] ?? "application/octet-stream");
  const data = await body(req);
  let addRandomSuffix = req.headers["x-add-random-suffix"] === "1";
  let allowOverwrite = req.headers["x-allow-overwrite"] === "1";
  if (auth.kind === "client") {
    const p = auth.payload;
    if (p.pathname !== pathname) return fail(res, 403, "forbidden", "pathname does not match the token");
    if (Array.isArray(p.allowedContentTypes) && !p.allowedContentTypes.includes(contentType)) return fail(res, 400, "content_type_not_allowed", "content type not allowed");
    if (typeof p.maximumSizeInBytes === "number" && data.length > p.maximumSizeInBytes) return fail(res, 400, "file_too_large", "file too large");
    if (typeof p.addRandomSuffix === "boolean") addRandomSuffix = p.addRandomSuffix;
    if (typeof p.allowOverwrite === "boolean") allowOverwrite = p.allowOverwrite;
  }
  if (addRandomSuffix) {
    const dot = pathname.lastIndexOf(".");
    const suffix = randomBytes(15).toString("base64url").replace(/[-_]/g, "").slice(0, 20);
    pathname = dot > pathname.lastIndexOf("/") ? `${pathname.slice(0, dot)}-${suffix}${pathname.slice(dot)}` : `${pathname}-${suffix}`;
  }
  if (!allowOverwrite && existsSync(fileOf(pathname))) return fail(res, 400, "blob_already_exists", "blob already exists");
  mkdirSync(dirname(fileOf(pathname)), { recursive: true });
  writeFileSync(fileOf(pathname), data);
  const meta = { size: data.length, contentType, uploadedAt: new Date().toISOString(), etag: `"${randomBytes(8).toString("hex")}"` };
  writeFileSync(metaOf(pathname), JSON.stringify(meta));
  console.log(`PUT ${pathname} (${data.length} bytes, ${auth.kind} token)`);
  return json(res, 200, describe(pathname, meta));
}

function head(req, res, url) {
  authorize(req);
  const pathname = pathOfUrl(url.searchParams.get("url") ?? "");
  const meta = pathname && readMeta(pathname);
  if (!meta) return fail(res, 404, "not_found", "The requested blob does not exist");
  return json(res, 200, describe(pathname, meta));
}

async function remove(req, res) {
  if (authorize(req).kind !== "rw") return fail(res, 403, "forbidden", "read-write token required");
  const { urls = [] } = JSON.parse((await body(req)).toString() || "{}");
  for (const u of urls) {
    const pathname = pathOfUrl(u);
    if (pathname) for (const f of [fileOf(pathname), metaOf(pathname)]) rmSync(f, { force: true });
  }
  return json(res, 200, {});
}

function read(req, res, pathname) {
  if (authorize(req).kind !== "rw") return fail(res, 403, "forbidden", "read-write token required");
  const meta = readMeta(pathname);
  if (!meta) {
    res.writeHead(404);
    return res.end("Not found");
  }
  const headers = { "content-type": meta.contentType, etag: meta.etag, "accept-ranges": "bytes", "last-modified": new Date(meta.uploadedAt).toUTCString() };
  if (req.headers["if-none-match"] === meta.etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  const size = statSync(fileOf(pathname)).size;
  const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
  if (range) {
    const start = Number(range[1]);
    const end = Math.min(range[2] ? Number(range[2]) : size - 1, size - 1);
    res.writeHead(206, { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
    return createReadStream(fileOf(pathname), { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, "content-length": size });
  createReadStream(fileOf(pathname)).pipe(res);
}

async function handle(req, res) {
  cors(req, res);
  try {
    const url = new URL(req.url, ORIGIN);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    if (url.pathname === "/" && req.method === "PUT") return await put(req, res, url);
    if (url.pathname === "/" && req.method === "GET" && url.searchParams.has("url")) return head(req, res, url);
    if (url.pathname === "/delete" && req.method === "POST") return await remove(req, res);
    if (url.pathname.startsWith("/mpu")) return fail(res, 501, "not_supported", "multipart uploads are not supported by the local mock; use files under the multipart threshold");
    if (req.method === "GET" && url.pathname.length > 1) return read(req, res, decodeURIComponent(url.pathname.slice(1)));
    return fail(res, 404, "not_found", "unknown endpoint");
  } catch (error) {
    if (!res.headersSent) fail(res, error.status ?? 500, error.status === 403 ? "forbidden" : "internal", error.message);
  }
}

// Loopback only (IPv4 and IPv6, since "localhost" may resolve to either); never the network.
createServer(handle).listen(PORT, "127.0.0.1", () => console.log(`Local Blob mock on ${ORIGIN}, files in ${join(DIR, "files")}`));
createServer(handle)
  .on("error", () => {})
  .listen({ port: PORT, host: "::1", ipv6Only: true });
