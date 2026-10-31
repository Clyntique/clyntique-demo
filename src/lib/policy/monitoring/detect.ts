/*
 * Change detection between two normalized snapshots. Pure functions, no I/O.
 *
 * A "meaningful" change is one a policy admin should read: a paragraph or
 * heading added or removed, or a newly stated page date. Whitespace, case,
 * punctuation-only edits and very short fragments (menu labels, counters)
 * are ignored, so a re-skinned page with the same policy text is not a
 * change. The detector never decides what a rule should say; it only
 * summarizes the difference for the human-review queue.
 */

import { isStatedDateLine } from "./normalize";

export interface DiffEntry {
  op: "added" | "removed";
  /** The section heading the paragraph sits under, when known. */
  section: string | null;
  text: string;
}

export interface ChangeComparison {
  meaningful: boolean;
  added: DiffEntry[];
  removed: DiffEntry[];
  /** Sections whose heading text itself changed. */
  sectionsAdded: string[];
  sectionsRemoved: string[];
  statedDateChanged: boolean;
  summary: string;
}

/** Shortest paragraph that counts as content. */
const MIN_MEANINGFUL_LENGTH = 24;
/** Most diff entries kept per side; the rest is counted in the summary. */
const MAX_ENTRIES = 40;
/** Longest text kept per entry. */
const MAX_ENTRY_LENGTH = 600;

/** Canonical form for equality: lowercase, letters/digits only, so cosmetic edits match. */
export function canonical(text: string): string {
  return text
    .toLowerCase()
    .replace(/^•\s*/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

interface Paragraph {
  key: string;
  text: string;
  section: string | null;
  isHeading: boolean;
}

export function paragraphsOf(text: string): Paragraph[] {
  const out: Paragraph[] = [];
  let section: string | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("## ")) {
      section = line.slice(3).trim();
      const key = canonical(section);
      if (key) out.push({ key: `h:${key}`, text: section, section, isHeading: true });
      continue;
    }
    // The page's own date line is compared as statedDate, not as a paragraph.
    if (isStatedDateLine(line)) continue;
    const key = canonical(line);
    if (key.length < MIN_MEANINGFUL_LENGTH) continue;
    out.push({ key: `p:${key}`, text: line, section, isHeading: false });
  }
  return out;
}

function clip(text: string): string {
  return text.length > MAX_ENTRY_LENGTH ? `${text.slice(0, MAX_ENTRY_LENGTH)}…` : text;
}

export function compareSnapshots(
  previous: { text: string; statedDate: Date | null } | null,
  next: { text: string; statedDate: Date | null },
): ChangeComparison {
  if (!previous) {
    return { meaningful: false, added: [], removed: [], sectionsAdded: [], sectionsRemoved: [], statedDateChanged: false, summary: "First snapshot recorded; nothing to compare yet." };
  }
  const before = paragraphsOf(previous.text);
  const after = paragraphsOf(next.text);
  const beforeKeys = new Set(before.map((p) => p.key));
  const afterKeys = new Set(after.map((p) => p.key));

  const removedParas = before.filter((p) => !afterKeys.has(p.key));
  const addedParas = after.filter((p) => !beforeKeys.has(p.key));

  const sectionsRemoved = removedParas.filter((p) => p.isHeading).map((p) => p.text);
  const sectionsAdded = addedParas.filter((p) => p.isHeading).map((p) => p.text);
  const removed = removedParas.filter((p) => !p.isHeading).map((p): DiffEntry => ({ op: "removed", section: p.section, text: clip(p.text) }));
  const added = addedParas.filter((p) => !p.isHeading).map((p): DiffEntry => ({ op: "added", section: p.section, text: clip(p.text) }));

  const prevDate = previous.statedDate ? previous.statedDate.getTime() : null;
  const nextDate = next.statedDate ? next.statedDate.getTime() : null;
  const statedDateChanged = prevDate !== nextDate && nextDate !== null;

  const meaningful = added.length > 0 || removed.length > 0 || sectionsAdded.length > 0 || sectionsRemoved.length > 0 || statedDateChanged;

  return {
    meaningful,
    added: added.slice(0, MAX_ENTRIES),
    removed: removed.slice(0, MAX_ENTRIES),
    sectionsAdded,
    sectionsRemoved,
    statedDateChanged,
    summary: summarize({ added, removed, sectionsAdded, sectionsRemoved, statedDateChanged, previousDate: previous.statedDate, nextDate: next.statedDate }),
  };
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function sectionsTouched(entries: DiffEntry[]): string[] {
  return [...new Set(entries.map((e) => e.section).filter((s): s is string => Boolean(s)))];
}

export function summarize(input: {
  added: DiffEntry[];
  removed: DiffEntry[];
  sectionsAdded: string[];
  sectionsRemoved: string[];
  statedDateChanged: boolean;
  previousDate: Date | null;
  nextDate: Date | null;
}): string {
  const parts: string[] = [];
  if (input.added.length || input.removed.length) {
    const touched = sectionsTouched([...input.added, ...input.removed]);
    let s = `${plural(input.added.length, "paragraph")} added, ${plural(input.removed.length, "paragraph")} removed`;
    if (touched.length) s += ` under ${touched.slice(0, 4).map((t) => `"${t}"`).join(", ")}${touched.length > 4 ? ` and ${touched.length - 4} more` : ""}`;
    parts.push(s + ".");
  }
  if (input.sectionsAdded.length) parts.push(`New section${input.sectionsAdded.length === 1 ? "" : "s"}: ${input.sectionsAdded.slice(0, 4).map((t) => `"${t}"`).join(", ")}.`);
  if (input.sectionsRemoved.length) parts.push(`Section${input.sectionsRemoved.length === 1 ? "" : "s"} no longer present: ${input.sectionsRemoved.slice(0, 4).map((t) => `"${t}"`).join(", ")}.`);
  if (input.statedDateChanged) {
    const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "none");
    parts.push(`Stated page date changed from ${fmt(input.previousDate)} to ${fmt(input.nextDate)}.`);
  }
  if (!parts.length) return "Only formatting or boilerplate changed; no policy text differs.";
  return parts.join(" ");
}
