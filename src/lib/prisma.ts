import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // DATABASE_URL is read from the server environment only. It is not checked
  // here so that importing this module (e.g. during `next build`) never fails;
  // a missing URL surfaces as a connection error on the first query.
  //
  // Pool sizing: at most 10 connections per server instance (the pg default,
  // now explicit). Render allows 100 (97 for this user), so ~9 warm instances
  // fit. Idle connections are kept for 60 s instead of pg's 10 s, so a click
  // after a short pause reuses a warm connection instead of paying for a new
  // TLS handshake and login. Connecting gives up after 10 s instead of waiting
  // forever, and TCP keep-alive lets a silently dropped connection be noticed.
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
