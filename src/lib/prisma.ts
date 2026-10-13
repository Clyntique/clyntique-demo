import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // DATABASE_URL is read from the server environment only. It is not checked
  // here so that importing this module (e.g. during `next build`) never fails;
  // a missing URL surfaces as a connection error on the first query.
  //
  // Pool sizing: at most 5 connections per server instance. Render allows 100
  // (97 for this user), and Vercel can pause an idle instance with its
  // connections still open (timers don't run while paused), so a small pool
  // bounds what paused instances hold. Idle connections are kept for 60 s
  // instead of pg's 10 s, so a click after a short pause reuses a warm
  // connection instead of paying for a new TLS handshake and login. Connecting
  // (or waiting for a free pooled connection) gives up after 10 s instead of
  // waiting forever, and TCP keep-alive lets a silently dropped connection be
  // noticed.
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });
  // On Vercel (Fluid compute), keeps the instance awake after each query just
  // long enough for the pool to close its idle connections before the instance
  // is paused, so paused instances don't hold database connections. It does
  // nothing outside Vercel (local development, tests, builds).
  attachDatabasePool(pool);
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
