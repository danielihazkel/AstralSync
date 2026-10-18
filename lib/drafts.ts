/**
 * Unsent composer drafts — the Journal and Life events add forms — kept in
 * localStorage per profile, so switching tabs (which unmounts the panel) or
 * reloading never throws away half-written text. A per-browser convenience:
 * every access is wrapped, and a missing or blocked store simply means no
 * draft comes back. Cleared on a successful save.
 */

import {
  LIFE_EVENT_CATEGORIES,
  LIFE_EVENT_PRECISIONS,
  type LifeEventCategory,
  type LifeEventPrecision,
} from "./lifeEventMeta";
import { JOURNAL_MOODS, type JournalMood } from "./journalMeta";

const PREFIX = "astralsync-draft:";

export type DraftKind = "journal" | "life-event";

export function draftKey(kind: DraftKind, profileId: number): string {
  return `${PREFIX}${kind}:${profileId}`;
}

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The stored draft, or null when absent, unreadable or malformed. */
export function loadDraft<T>(
  key: string,
  parse: (raw: unknown) => T | null,
  storage: DraftStorage | null = browserStorage(),
): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? parse(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveDraft(
  key: string,
  value: unknown,
  storage: DraftStorage | null = browserStorage(),
): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or a blocked store: the draft just isn't kept.
  }
}

export function clearDraft(key: string, storage: DraftStorage | null = browserStorage()): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Nothing to do.
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export interface JournalDraft {
  body: string;
  mood: JournalMood | null;
  tags: string;
}

export const EMPTY_JOURNAL_DRAFT: JournalDraft = { body: "", mood: null, tags: "" };

export function parseJournalDraft(raw: unknown): JournalDraft | null {
  if (!isRecord(raw)) return null;
  const mood = (JOURNAL_MOODS as readonly unknown[]).includes(raw.mood)
    ? (raw.mood as JournalMood)
    : null;
  return { body: str(raw.body), mood, tags: str(raw.tags) };
}

export function isJournalDraftEmpty(d: JournalDraft): boolean {
  return d.body.trim() === "" && d.mood === null && d.tags.trim() === "";
}

export interface LifeEventDraft {
  title: string;
  precision: LifeEventPrecision;
  date: { day: string; month: string; year: string };
  category: LifeEventCategory;
  notes: string;
}

export const EMPTY_LIFE_EVENT_DRAFT: LifeEventDraft = {
  title: "",
  precision: "day",
  date: { day: "", month: "", year: "" },
  category: "other",
  notes: "",
};

export function parseLifeEventDraft(raw: unknown): LifeEventDraft | null {
  if (!isRecord(raw)) return null;
  const date = isRecord(raw.date) ? raw.date : {};
  return {
    title: str(raw.title),
    precision: (LIFE_EVENT_PRECISIONS as readonly unknown[]).includes(raw.precision)
      ? (raw.precision as LifeEventPrecision)
      : "day",
    date: { day: str(date.day), month: str(date.month), year: str(date.year) },
    category: (LIFE_EVENT_CATEGORIES as readonly unknown[]).includes(raw.category)
      ? (raw.category as LifeEventCategory)
      : "other",
    notes: str(raw.notes),
  };
}

/** Only typed text counts: a precision or category picked on its own is
 *  not worth keeping. */
export function isLifeEventDraftEmpty(d: LifeEventDraft): boolean {
  return (
    d.title.trim() === "" &&
    d.notes.trim() === "" &&
    d.date.day === "" &&
    d.date.month === "" &&
    d.date.year === ""
  );
}
