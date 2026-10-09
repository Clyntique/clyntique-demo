// Exercises the real login rate limiter (src/lib/auth/rate-limit.ts) against
// the configured database, for a NON-EXISTENT test identity. Writes only
// LoginAttempt rows (hashed keys), never touches accounts.
//
//   npx tsx --conditions=react-server prisma/check-rate-limit.ts
//
// Expected: attempts 1-5 allowed, attempt 6 blocked (limit: 5 per email+IP per 15 min).
import "dotenv/config";
import { LIMITS, beginAttempt } from "@/lib/auth/rate-limit";
import { prisma } from "@/lib/prisma";

const EMAIL = `rate-limit-check-${Date.now()}@example.invalid`; // no such account
const ADDRESS = "203.0.113.10"; // documentation range, not a real client

async function main() {
  const results: boolean[] = [];
  for (let i = 1; i <= LIMITS.emailIp + 1; i++) {
    const ticket = await beginAttempt(EMAIL, ADDRESS);
    results.push(ticket.blocked);
    console.log(`attempt ${i}: ${ticket.blocked ? "blocked" : "allowed"}`);
  }
  const ok = results.slice(0, LIMITS.emailIp).every((b) => !b) && results[LIMITS.emailIp] === true;
  console.log(ok ? `PASS  blocked exactly at attempt ${LIMITS.emailIp + 1}` : "FAIL  rate limiter did not behave as expected");
  process.exitCode = ok ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.name : "Check failed.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
