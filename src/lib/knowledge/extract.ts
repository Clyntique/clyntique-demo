import "server-only";
import { extractText as extractPdfText } from "unpdf";
import mammoth from "mammoth";
import { LIBRARY_LIMITS } from "@/lib/library-files";
import { normalizeText, type ExtractedPage } from "./chunk";

/*
 * Text extraction for Content Library files. Each format has one reader;
 * all of them return pages of plain text. The file is data: nothing in it is
 * executed, and nothing but its text is kept. Errors are reported in plain
 * words so the uploader can act (for example a scanned PDF with no text).
 */

export class ExtractionError extends Error {
  /** True when the file's bytes do not match its declared type; the file is useless and is removed. */
  constructor(message: string, readonly disguised = false) {
    super(message);
  }
}

export type Extraction = { pages: ExtractedPage[]; pageCount: number | null; truncated: boolean };

/** Leading bytes of each accepted format, checked on the server before extraction. */
export function contentLooksLike(mimeType: string, head: Uint8Array): boolean {
  switch (mimeType) {
    case "application/pdf":
      return ascii(head, 0, 5) === "%PDF-";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      // A DOCX is a ZIP archive.
      return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
    case "text/plain":
      // Any bytes but NUL (binary) and a UTF-8 BOM is fine.
      return head.length > 0 && !head.subarray(0, Math.min(head.length, 512)).includes(0);
    default:
      return false;
  }
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** Caps total text at LIBRARY_LIMITS.maxTextChars across pages. */
function capPages(pages: ExtractedPage[]): { pages: ExtractedPage[]; truncated: boolean } {
  let budget = LIBRARY_LIMITS.maxTextChars;
  const kept: ExtractedPage[] = [];
  for (const page of pages) {
    const text = normalizeText(page.text);
    if (!text) continue;
    if (text.length <= budget) {
      kept.push({ page: page.page, text });
      budget -= text.length;
    } else {
      if (budget > 0) kept.push({ page: page.page, text: text.slice(0, budget) });
      return { pages: kept, truncated: true };
    }
  }
  return { pages: kept, truncated: false };
}

export async function extractDocumentText(buffer: Buffer, mimeType: string): Promise<Extraction> {
  if (!contentLooksLike(mimeType, buffer.subarray(0, 512))) throw new ExtractionError("This file is not what its name says it is.", true);
  let pages: ExtractedPage[];
  let pageCount: number | null = null;
  if (mimeType === "application/pdf") {
    let result: { totalPages: number; text: string[] };
    try {
      result = await extractPdfText(new Uint8Array(buffer), { mergePages: false });
    } catch {
      throw new ExtractionError("The PDF could not be read. It may be damaged or password-protected.");
    }
    pageCount = result.totalPages;
    if (pageCount > LIBRARY_LIMITS.maxPages) throw new ExtractionError(`PDFs can have up to ${LIBRARY_LIMITS.maxPages} pages.`);
    pages = result.text.map((text, i) => ({ page: i + 1, text }));
  } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    let text: string;
    try {
      text = (await mammoth.extractRawText({ buffer })).value;
    } catch {
      throw new ExtractionError("The Word file could not be read. Save it again as .docx and retry.");
    }
    pages = [{ page: null, text }];
  } else if (mimeType === "text/plain") {
    pages = [{ page: null, text: new TextDecoder("utf-8", { fatal: false }).decode(buffer) }];
  } else {
    throw new ExtractionError("Unsupported file type.");
  }
  const capped = capPages(pages);
  if (capped.pages.length === 0) {
    throw new ExtractionError(
      mimeType === "application/pdf"
        ? "No text was found in this PDF. Scanned pages need a text layer (OCR) before they can be searched."
        : "No text was found in this file.",
    );
  }
  return { pages: capped.pages, pageCount, truncated: capped.truncated };
}
