// Finds uploaded files in Vercel Blob that nothing references: creative
// uploads abandoned before they were saved as a version, and evidence uploads
// abandoned before the evidence was saved (tab closed, network lost).
// Lists them by default; deletes only with --delete.
//
//   npm run blob:orphans            # dry run
//   npm run blob:orphans -- --delete
//
// Safety (src/lib/review/orphans.ts): only blobs under creatives/ or
// evidence/, older than 24 hours, and referenced by no CreativeVersion and no
// Evidence row (withdrawn evidence keeps its reference) are considered.
// References are re-checked right before deleting. Version and evidence
// history files are never touched. Never prints tokens or connection strings.
import "dotenv/config";
import { del, list } from "@vercel/blob";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { ORPHAN_PREFIXES, selectOrphans, type StoredBlob } from "../src/lib/review/orphans";

const shouldDelete = process.argv.includes("--delete");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
  throw new Error("No Vercel Blob credentials found (BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID).");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function referencedUrls(urls?: string[]) {
  const where = urls ? { fileUrl: { in: urls } } : { fileUrl: { not: null } };
  const [versions, evidence] = await Promise.all([
    prisma.creativeVersion.findMany({ where: urls ? { fileUrl: { in: urls } } : {}, select: { fileUrl: true } }),
    prisma.evidence.findMany({ where, select: { fileUrl: true } }),
  ]);
  return new Set([...versions.map((v) => v.fileUrl), ...evidence.map((e) => e.fileUrl!).filter(Boolean)]);
}

async function main() {
  const referenced = await referencedUrls();
  const blobs: StoredBlob[] = [];
  for (const prefix of ORPHAN_PREFIXES) {
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      blobs.push(...page.blobs.map((b) => ({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt })));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  }
  const orphans = selectOrphans(blobs, referenced, Date.now());

  for (const o of orphans) console.log(`${o.pathname} (${Math.round(o.size / 1024)} KB)`);
  console.log(`${blobs.length} stored file(s) checked; ${orphans.length} unreferenced and older than 24 hours.`);

  if (shouldDelete && orphans.length) {
    // Re-check right before deleting, in case a version or evidence item was saved meanwhile.
    const stillReferenced = await referencedUrls(orphans.map((o) => o.url));
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
