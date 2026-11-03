// Column selection for the read-only backup (prisma/db-export.ts).
//
// Prisma cannot deserialize PostgreSQL tsvector values, so `SELECT *` on a
// table with a full-text column (LibraryChunk.tsv) fails the whole export.
// Such columns are derived data: the restore leaves them out and the
// table's BEFORE INSERT trigger rebuilds them from the text column.

/** PostgreSQL types the export leaves out because they are rebuilt on restore. */
export const DERIVED_COLUMN_TYPES = ["tsvector"] as const;

export type ColumnInfo = { column_name: string; udt_name: string };

/** The columns to back up, in table order, without derived search columns. */
export function exportColumns(columns: ColumnInfo[]): string[] {
  return columns
    .filter((c) => !(DERIVED_COLUMN_TYPES as readonly string[]).includes(c.udt_name))
    .map((c) => c.column_name);
}

/** SELECT statement for one table's backed-up columns. */
export function exportSelect(table: string, columns: string[]): string {
  const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
  if (columns.length === 0) throw new Error(`Table ${table} has no columns to export.`);
  return `SELECT ${columns.map(quote).join(", ")} FROM ${quote(table)}`;
}
