// Shows which database DATABASE_URL points to, WITHOUT connecting to it.
// Prints host, port and database name only: never the user or password.
//
//   npm run db:target                                    # uses .env
//   npm run db:target -- --env-file .env.vercel.production   # compare another env file
import { config } from "dotenv";

const flag = process.argv.indexOf("--env-file");
const envFile = flag > -1 ? process.argv[flag + 1] : ".env";
const parsed = config({ path: envFile, quiet: true, processEnv: {} }).parsed ?? {};
// An explicitly set environment variable wins over the file, as for Prisma.
const raw = flag > -1 ? parsed.DATABASE_URL : (process.env.DATABASE_URL ?? parsed.DATABASE_URL);

if (!raw) {
  console.error(`DATABASE_URL is not set (${envFile}).`);
  process.exit(1);
}

try {
  const url = new URL(raw);
  console.log(`Source:   ${flag > -1 ? envFile : process.env.DATABASE_URL ? "environment variable" : envFile}`);
  console.log(`Host:     ${url.hostname}`);
  console.log(`Port:     ${url.port || "5432"}`);
  console.log(`Database: ${decodeURIComponent(url.pathname.replace(/^\//, "")) || "(none)"}`);
  console.log(`SSL mode: ${url.searchParams.get("sslmode") ?? "(not set)"}`);
} catch {
  console.error("DATABASE_URL is not a valid URL.");
  process.exit(1);
}
