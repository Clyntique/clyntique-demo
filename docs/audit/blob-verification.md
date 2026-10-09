# Blob configuration check (store `clyntique-creatives`)

Date: 2026-10-09. Read-only. The token was never displayed, nothing was uploaded, and nothing was written to the database. No Git commands, migrations or deploys.

## Configuration

| Check | Result |
|---|---|
| `BLOB_READ_WRITE_TOKEN` in local `.env` | Present. Format `vercel_blob_rw_<store>_<secret>` is valid, with no quotes or whitespace |
| `BLOB_STORE_ID` / OIDC | Not set. Not needed locally: the SDK uses the read-write token |
| Upload limits | Defaults: 15 MB images, 100 MB videos (`CREATIVE_MAX_*` not set) |
| Store reachable (read-only `list()`) | OK. Token accepted; 0 blobs in the store |
| Store is **private** | **Not provable read-only while the store is empty.** It shows on the first upload: private blob URLs are `https://<store>.private.blob.vercel-storage.com/…`. The code fails safe either way (below) |

## Code vs installed SDK (`@vercel/blob` 2.8.1)

| Area | Finding |
|---|---|
| Browser upload (`version-uploader.tsx`) | `upload(…, { access: "private", handleUploadUrl: "/api/creatives/upload", contentType, multipart for ≥ 50 MB })`. Correct for private stores |
| Token route (`/api/creatives/upload`) | `handleUpload` with `onBeforeGenerateToken` only. `onUploadCompleted` is optional in 2.8.1, so no callback URL is needed (works on localhost). Each token fixes the content type and size, uses a server-built path, allows no overwrite, and lasts 30 minutes |
| Finalize (`finalizeVersion`) | `isPrivateBlobUrl` requires a `*.private.blob.vercel-storage.com` URL, which matches the SDK's private URL format, so a file in a public store would be rejected. `head()` checks path, size and type. The magic-byte check uses `get(…, { access: "private", headers: { range } })`. For ranged reads the SDK reports `statusCode: 200` (only 304 and 404 are special), so the check works |
| Media route (`/api/media/[versionId]`) | Authenticates and scopes every request, then calls `get(fileUrl, { access: "private" })` with Range / If-None-Match passed through. Returns 200, 206 or 304, with `nosniff`, a sandbox CSP and `Cache-Control: private`. The browser never sees a Blob URL or the token |
| Security headers (CSP) | `connect-src` allows `https://vercel.com` (the SDK's API host `vercel.com/api/blob`) and `*.blob.vercel-storage.com`. `img-src` and `media-src` are `'self'`, which covers `/api/media` |

**Required code changes: none found.**

## Still to confirm by a real upload (needs your approval; writes to Blob and the database)

The first test upload will show:
1. The store's access type: the stored URL should contain `.private.`.
2. Token issue, direct browser upload, finalize, image preview, video playback and seeking (206).
3. The rejection paths: a wrong file type, a renamed `.txt` saved as `.png`, an oversize file.

**For Vercel later:** check that `BLOB_READ_WRITE_TOKEN` is set for the Production, Preview and Development environments of the project. Connecting the store adds it, for the environments you selected.
