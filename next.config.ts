import type { NextConfig } from "next";
import { localBlobMockOrigin, localBlobMockRequested } from "./src/lib/review/local-blob-mock";

const isDev = process.env.NODE_ENV === "development";

// The local Blob mock (src/lib/review/local-blob-mock.ts) must never reach a
// deployment: fail the build if its settings are present on Vercel.
if ((process.env.VERCEL || process.env.VERCEL_ENV) && localBlobMockRequested()) {
  throw new Error("Local Blob mock settings must not be set on Vercel.");
}
const localBlobMock = localBlobMockOrigin();

// Content Security Policy for pages. Without nonces, Next.js needs
// 'unsafe-inline' for its bootstrap scripts; 'unsafe-eval' only in development
// (React's dev tooling). connect-src allows browser uploads to Vercel Blob.
// /api/media sets its own stricter CSP, so it is excluded here.
export const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "font-src 'self'",
  `connect-src 'self' https://vercel.com https://*.blob.vercel-storage.com${localBlobMock ? ` ${localBlobMock}` : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HSTS only outside development, so local http://localhost keeps working.
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Everything except the media route, which sends its own CSP.
      { source: "/((?!api/media/).*)", headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy }] },
    ];
  },
};

export default nextConfig;
