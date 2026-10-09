import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests only. Prisma, the session and Blob are mocked in each test file:
// no test connects to a database or a Blob store.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside React Server Components; tests run in plain Node.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Never let a test pick up a real connection string from .env.
    env: { DATABASE_URL: "", BLOB_READ_WRITE_TOKEN: "", SESSION_SECRET: "test-secret-test-secret-test-secret-0000" },
    restoreMocks: true,
  },
});
