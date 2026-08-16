/**
 * Journal mood and tag vocabulary — the canonical mood union and the tag
 * normalization rules. Pure and dependency-free so client components can
 * import it statically; lib/journal.ts casts Prisma's generated enum to this
 * union at the store boundary (the skyJson stance), keeping @prisma/client
 * out of client bundles. Keep JOURNAL_MOODS in sync with the JournalMood
 * enum in prisma/schema.prisma.
 */

export const JOURNAL_MOODS = [
  "very_low",
  "low",
  "neutral",
  "high",
  "very_high",
] as const;

export type JournalMood = (typeof JOURNAL_MOODS)[number];

/** 1..5, for averaging in Insights. */
export function moodScore(mood: JournalMood): number {
  return JOURNAL_MOODS.indexOf(mood) + 1;
}

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 24;

/**
 * trim → lowercase → collapse inner whitespace → drop empties → dedupe,
 * preserving first-seen order. Tags exist to be grouped ("Work" and "work "
 * must be one bucket). Does NOT enforce MAX_* limits — validation rejects
 * over-limit input rather than silently truncating.
 */
export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    const tag = s.trim().toLowerCase().replace(/\s+/g, " ");
    if (tag === "" || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/** Comma-separated input string → normalized tags (UI helper). */
export function parseTagsInput(input: string): string[] {
  return normalizeTags(input.split(","));
}
