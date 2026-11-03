// Pure text handling for the Content Library: normalising extracted text and
// cutting it into search chunks. No I/O, so it is unit-tested directly.

export type ExtractedPage = { page: number | null; text: string };
export type TextChunk = { index: number; page: number | null; text: string };

/** Target size of one chunk and the overlap carried into the next one. */
export const CHUNK_CHARS = 900;
export const CHUNK_OVERLAP = 120;

/** Collapses whitespace, strips control characters and the NUL bytes PostgreSQL refuses. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Prefers to break at a paragraph, then a sentence, then a space; never inside a word when avoidable. */
function breakPoint(text: string, limit: number): number {
  if (text.length <= limit) return text.length;
  const window = text.slice(0, limit);
  const minimum = Math.floor(limit * 0.5);
  const paragraph = window.lastIndexOf("\n\n");
  if (paragraph >= minimum) return paragraph;
  const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "), window.lastIndexOf(".\n"));
  if (sentence >= minimum) return sentence + 1;
  const space = window.lastIndexOf(" ");
  if (space >= minimum) return space;
  return limit;
}

/**
 * Cuts pages into overlapping chunks. A chunk never spans two pages, so every
 * citation can name the page it came from. Stops at `maxChunks` and reports it.
 */
export function chunkPages(
  pages: ExtractedPage[],
  options: { chunkChars?: number; overlap?: number; maxChunks?: number } = {},
): { chunks: TextChunk[]; truncated: boolean } {
  const size = options.chunkChars ?? CHUNK_CHARS;
  const overlap = Math.min(options.overlap ?? CHUNK_OVERLAP, Math.floor(size / 2));
  const maxChunks = options.maxChunks ?? Number.POSITIVE_INFINITY;
  const chunks: TextChunk[] = [];
  for (const page of pages) {
    const text = normalizeText(page.text);
    let start = 0;
    while (start < text.length) {
      if (chunks.length >= maxChunks) return { chunks, truncated: true };
      const rest = text.slice(start);
      const end = breakPoint(rest, size);
      const piece = rest.slice(0, end).trim();
      if (piece.length > 0) chunks.push({ index: chunks.length, page: page.page, text: piece });
      if (end >= rest.length) break;
      // Carry a little context into the next chunk, but always move forward.
      start += Math.max(end - overlap, Math.ceil(end / 2), 1);
    }
  }
  return { chunks, truncated: false };
}

/** Total characters across pages after normalisation (what the document reports as indexed). */
export function countChars(pages: ExtractedPage[]) {
  return pages.reduce((n, p) => n + normalizeText(p.text).length, 0);
}
