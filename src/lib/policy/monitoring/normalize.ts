import { createHash } from "node:crypto";

/*
 * Turns a fetched official page into comparable text. Pure functions, no I/O.
 *
 * The normalized text keeps headings (as "## Heading" lines) and the
 * paragraphs under them, drops navigation, scripts, styles, cookie banners
 * and repeated whitespace, and is capped so a snapshot stays small. Two
 * fetches of an unchanged page produce the same text and the same hash.
 */

/** Longest normalized text kept per snapshot (characters). */
export const MAX_NORMALIZED_LENGTH = 200_000;

const DROP_ELEMENTS = ["head", "script", "style", "noscript", "svg", "template", "iframe", "nav", "header", "footer", "aside", "form", "button"];

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  copy: "©",
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeChar(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

function safeChar(code: number): string {
  return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
}

/** Lines that are boilerplate rather than policy text. */
const NOISE_LINE = /^(accept( all)? cookies?|cookie (settings|policy|preferences)|skip to (main )?content|privacy policy|terms of (use|service)|share|print|was this (article )?helpful\??|yes|no|back to top|sign in|log in|menu|search)$/i;
/** Short sentences about cookies or consent are banners, not policy text. */
const CONSENT_LINE = /^.{0,160}\b(cookies?|consent preferences)\b.{0,160}$/i;
const CONSENT_WORDS = /\b(we use|accept|manage|settings|preferences|improve your experience|by continuing)\b/i;

export function isBoilerplateLine(line: string): boolean {
  const bare = line.replace(/^•\s*/, "");
  return NOISE_LINE.test(bare) || (CONSENT_LINE.test(bare) && CONSENT_WORDS.test(bare));
}

/** Strip tags from an HTML fragment, decoding entities and collapsing spaces. */
function textOf(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]+>/g, " "))
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

export interface NormalizedPage {
  text: string;
  title: string | null;
  /** A date the page states as its last update or effective date, if any. */
  statedDate: Date | null;
  truncated: boolean;
}

export function normalizeHtml(html: string): NormalizedPage {
  let body = html;
  for (const tag of DROP_ELEMENTS) {
    body = body.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), " ");
  }
  body = body.replace(/<!--[\s\S]*?-->/g, " ");
  // Source formatting (indentation, wrapped lines inside a paragraph) carries no
  // meaning in HTML, so it is collapsed before block boundaries become newlines.
  body = body.replace(/\s+/g, " ");

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? textOf(titleMatch[1]) || null : null;

  // Block boundaries become newlines; headings are marked so the diff can name sections.
  body = body
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_, _level: string, inner: string) => `\n## ${textOf(inner)}\n`)
    .replace(/<\/(p|div|li|tr|section|article|dd|dt|blockquote|pre|table|ul|ol|details|summary)\s*>/gi, "\n")
    .replace(/<(br|hr)\b[^>]*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ");

  const lines = body
    .split("\n")
    .map((line) => (line.startsWith("## ") ? line : textOf(line)))
    .map((line) => line.replace(/^## /, "## ").trim())
    .filter((line) => line.length > 0 && !isBoilerplateLine(line));

  // Collapse exact repeats that sit next to each other (menus rendered twice).
  const deduped: string[] = [];
  for (const line of lines) if (deduped[deduped.length - 1] !== line) deduped.push(line);

  let text = deduped.join("\n");
  const truncated = text.length > MAX_NORMALIZED_LENGTH;
  if (truncated) text = text.slice(0, MAX_NORMALIZED_LENGTH);

  return { text, title, statedDate: extractStatedDate(text), truncated };
}

/** Plain-text documents (and PDFs read as text) go through the same whitespace rules. */
export function normalizePlainText(input: string): NormalizedPage {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean);
  let text = lines.join("\n");
  const truncated = text.length > MAX_NORMALIZED_LENGTH;
  if (truncated) text = text.slice(0, MAX_NORMALIZED_LENGTH);
  return { text, title: null, statedDate: extractStatedDate(text), truncated };
}

export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function hashBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

export const DATE_CUE = /(last\s+(updated|modified|reviewed)|updated\s+on|effective(\s+date)?|revised(\s+on)?|published(\s+on)?|date\s+of\s+(last\s+)?update)\s*[:\-–—]?\s*/i;
/** A line that only states the page's own date, e.g. "Last updated: March 3, 2026". */
export function isStatedDateLine(line: string): boolean {
  const cue = DATE_CUE.exec(line);
  return cue !== null && cue.index <= 3 && parseDate(line.slice(cue.index + cue[0].length, cue.index + cue[0].length + 40)) !== null && line.length < 80;
}
const LONG_DATE = /\b(\d{1,2})?\s*(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})?,?\s*(\d{4})\b/i;
const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const SLASH_DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;

/**
 * The date a page states for itself ("Last updated: March 3, 2026",
 * "Effective July 26, 2023"). Only the first cue is used, and only when a
 * date follows it within a short distance, so body text dates are ignored.
 */
export function extractStatedDate(text: string): Date | null {
  const cue = DATE_CUE.exec(text);
  if (!cue) return null;
  const window = text.slice(cue.index + cue[0].length, cue.index + cue[0].length + 40);
  const parsed = parseDate(window);
  return parsed;
}

export function parseDate(candidate: string): Date | null {
  const iso = ISO_DATE.exec(candidate);
  if (iso) return utc(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const long = LONG_DATE.exec(candidate);
  if (long) {
    const month = MONTHS[long[2].toLowerCase().replace(".", "")];
    const day = Number(long[1] ?? long[3] ?? 1);
    return utc(Number(long[4]), month, day);
  }
  const slash = SLASH_DATE.exec(candidate);
  if (slash) return utc(Number(slash[3]), Number(slash[1]) - 1, Number(slash[2]));
  return null;
}

function utc(year: number, month: number, day: number): Date | null {
  if (!Number.isInteger(month) || month < 0 || month > 11 || day < 1 || day > 31 || year < 1990 || year > 2100) return null;
  const d = new Date(Date.UTC(year, month, day));
  return d.getUTCMonth() === month ? d : null;
}
