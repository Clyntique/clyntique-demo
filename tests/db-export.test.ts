import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { exportColumns, exportSelect } from "../prisma/db-export-columns";

describe("backup export column selection", () => {
  it("leaves out tsvector search columns, which Prisma cannot read and the restore trigger rebuilds", () => {
    const cols = exportColumns([
      { column_name: "id", udt_name: "text" },
      { column_name: "documentId", udt_name: "text" },
      { column_name: "text", udt_name: "text" },
      { column_name: "tsv", udt_name: "tsvector" },
      { column_name: "page", udt_name: "int4" },
    ]);
    expect(cols).toEqual(["id", "documentId", "text", "page"]);
  });

  it("keeps every column of an ordinary table, in table order", () => {
    const cols = exportColumns([
      { column_name: "id", udt_name: "text" },
      { column_name: "createdAt", udt_name: "timestamp" },
      { column_name: "meta", udt_name: "jsonb" },
    ]);
    expect(cols).toEqual(["id", "createdAt", "meta"]);
  });

  it("quotes table and column names", () => {
    expect(exportSelect("LibraryChunk", ["id", 'we"ird'])).toBe('SELECT "id", "we""ird" FROM "LibraryChunk"');
    expect(() => exportSelect("Empty", [])).toThrow();
  });

  it("the export uses the column list instead of SELECT *, with a long enough transaction", () => {
    const src = readFileSync(join(process.cwd(), "prisma", "db-export.ts"), "utf8");
    expect(src).not.toMatch(/SELECT \*/);
    expect(src).toContain("exportSelect(table_name, exportColumns(columns))");
    expect(src).toMatch(/timeout: 600_000/);
  });

  it("every tsvector column in the schema is rebuilt by a trigger on restore", () => {
    const migration = readFileSync(join(process.cwd(), "prisma", "migrations", "20261102200000_content_library", "migration.sql"), "utf8");
    expect(migration).toMatch(/"tsv" tsvector/);
    expect(migration).toMatch(/CREATE TRIGGER "LibraryChunk_tsv_update"[\s\S]*BEFORE INSERT/);
  });
});

describe("backup restore rebuilds derived search columns", () => {
  const restore = readFileSync(join(process.cwd(), "prisma", "db-restore.ts"), "utf8");

  it("re-fires the tsv trigger after the load, because triggers are off while rows are inserted", () => {
    const origin = restore.indexOf("SET session_replication_role = 'origin'");
    const rebuild = restore.indexOf(`UPDATE "LibraryChunk" SET "text" = "text" WHERE "tsv" IS NULL`);
    expect(origin).toBeGreaterThan(-1);
    expect(rebuild).toBeGreaterThan(origin);
  });

  it("refuses to commit a restore that leaves any chunk without a search vector", () => {
    expect(restore).toMatch(/WHERE "tsv" IS NULL`\);\s*if \(Number\(missing\) !== 0\) throw/);
  });
});
