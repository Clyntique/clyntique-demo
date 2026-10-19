import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Real-database checks (Oct 19 sprint). NOT part of `npm test`: they need an
// isolated, disposable PostgreSQL given as DATABASE_URL, e.g.
//   DATABASE_URL=postgresql://postgres@127.0.0.1:5433/clyntique_sprint npx vitest run --config vitest.db.config.ts
// Every row they create carries a unique "dbcheck-" marker and is deleted at
// the end. Never point this at the shared Render database.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/db-check/**/*.test.ts"],
    env: { SESSION_SECRET: "db-check-secret-db-check-secret-0000" },
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
