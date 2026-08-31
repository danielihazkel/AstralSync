import type { JournalMood } from "./journalMeta";

/**
 * The global journal timeline's pure half: the entry shape that crosses the
 * server→client boundary and the client-side filter over it. Kept
 * dependency-free (the lib/journalMeta.ts stance) so the client component
 * imports it statically and the filter is testable offline.
 */

export interface TimelineEntryData {
  id: number;
  profileId: number;
  displayName: string;
  /** "YYYY-MM-DD" civil date the note is about. */
  entryDate: string;
  bodyMd: string;
  mood: JournalMood | null;
  tags: string[];
}

export interface TimelineFilter {
  /** Free-text match against the body and tags, case-insensitive. */
  q?: string;
  mood?: JournalMood | "";
  tag?: string;
  profileId?: number | "";
}

/** Entries are already newest-first from the store; filtering preserves
 *  order. An empty filter returns the input unchanged. */
export function filterTimeline(
  entries: TimelineEntryData[],
  filter: TimelineFilter,
): TimelineEntryData[] {
  const q = filter.q?.trim().toLowerCase() ?? "";
  return entries.filter((e) => {
    if (filter.profileId !== undefined && filter.profileId !== "") {
      if (e.profileId !== filter.profileId) return false;
    }
    if (filter.mood !== undefined && filter.mood !== "") {
      if (e.mood !== filter.mood) return false;
    }
    if (filter.tag !== undefined && filter.tag !== "") {
      if (!e.tags.includes(filter.tag)) return false;
    }
    if (q !== "") {
      const haystack =
        `${e.bodyMd}\n${e.tags.join("\n")}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/** Every distinct tag across the entries, first-seen order. */
export function timelineTags(entries: TimelineEntryData[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of entries) {
    for (const t of e.tags) {
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** Page size shared by the /journal server load and GET /api/journal — the
 *  scale guardrail for years of notes. */
export const TIMELINE_PAGE_SIZE = 200;
