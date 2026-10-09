// Finds creative files in Vercel Blob that no CreativeVersion references:
// uploads abandoned before they were saved as a version (tab closed, network
// lost). Lists them by default; deletes only with --delete.
//
//   npm run blob:orphans            # dry run
//   npm run blob:orphans -- --delete
//
// Safety: only blobs under creatives/ that are older than 24 hours and not
// referenced by any version are considered. Version history files are never
// touched. Never prints tokens or connection strings.
import "dotenv/config";
import { del, list } from "@vercel/blob";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const shouldDelete = process.argv.includes("--delete");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
  throw new Error("No Vercel Blob credentials found (BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID).");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const referenced = new Set(
    (await prisma.creativeVersion.findMany({ select: { fileUrl: true } })).map((v) => v.fileUrl),
  );
  const cutoff = Date.now() - MIN_AGE_MS;
  const orphans: { url: string; pathname: string; size: number }[] = [];

  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "creatives/", cursor, limit: 1000 });
    for (const blob of page.blobs) {
      if (!referenced.has(blob.url) && blob.uploadedAt.getTime() < cutoff) {
        orphans.push({ url: blob.url, pathname: blob.pathname, size: blob.size });
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  for (const o of orphans) console.log(`${o.pathname} (${Math.round(o.size / 1024)} KB)`);
  console.log(`${orphans.length} unreferenced file(s) older than 24 hours.`);

  if (shouldDelete && orphans.length) {
    // Re-check right before deleting, in case a version was saved meanwhile.
    const stillReferenced = new Set(
      (
        await prisma.creativeVersion.findMany({
          where: { fileUrl: { in: orphans.map((o) => o.url) } },
          select: { fileUrl: true },
        })
      ).map((v) => v.fileUrl),
    );
    const toDelete = orphans.map((o) => o.url).filter((url) => !stillReferenced.has(url));
    for (let i = 0; i < toDelete.length; i += 100) await del(toDelete.slice(i, i + 100));
    console.log(`Deleted ${toDelete.length} file(s).`);
  } else if (orphans.length) {
    console.log("Dry run. Re-run with --delete to remove them.");
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
