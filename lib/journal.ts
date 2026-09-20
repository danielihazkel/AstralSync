import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { softDeleteJournalEntry } from "./trash";
import type { JournalMood } from "./journalMeta";
import type { TimelineEntryData } from "./journalTimeline";
import {
  pinnedSkyFromTransits,
  skyForDate,
  type PinnedSky,
} from "./pinnedSky";

/**
 * Prisma glue for journal entries — user notes pinned to a civil date
 * (Phase 3g). Entries are the user's own words: freely editable and
 * deletable, so unlike snapshots nothing here is write-once. Each entry
 * additionally snapshots the transits active when it was saved (skyJson) so
 * "what was in the sky when I wrote this" survives engine upgrades; the
 * browsable sky view still recomputes via /api/transits/[id]?at=.
 */

/**
 * The sky stored with an entry. Aliases the shared PinnedSky (lib/pinnedSky)
 * — life events keep one too, on the same terms — and the names stay for the
 * call sites and the stored JSON shape, which is frozen.
 */
export type EntrySky = PinnedSky;

export const entrySkyFromTransits = pinnedSkyFromTransits;

/** The entry's sky: the same transit view the Journal tab shows. */
export const skyForEntry = skyForDate;

export interface JournalEntryView {
  id: number;
  /** "YYYY-MM-DD" civil date the note is about. */
  entryDate: string;
  bodyMd: string;
  /** Optional 5-point mood; null when the user didn't set one. */
  mood: JournalMood | null;
  /** Normalized tags; empty when none. */
  tags: string[];
  /** Null for pre-feature entries or when no natal snapshot existed. */
  sky: EntrySky | null;
  createdAt: Date;
  updatedAt: Date;
}

/** `@db.Date` column value for a "YYYY-MM-DD" string (UTC midnight). */
function dateValue(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Inverse of dateValue: `@db.Date` column value → "YYYY-MM-DD". */
function dateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function serialize(row: {
  id: number;
  entryDate: Date;
  bodyMd: string;
  mood: string | null;
  tagsJson: Prisma.JsonValue;
  skyJson: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): JournalEntryView {
  return {
    id: row.id,
    entryDate: dateString(row.entryDate),
    bodyMd: row.bodyMd,
    mood: (row.mood as JournalMood | null) ?? null,
    tags: (row.tagsJson as unknown as string[] | null) ?? [],
    sky: (row.skyJson as unknown as EntrySky | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** All of a profile's entries, optionally date-bounded (inclusive), newest
 *  entry date first. Null when the profile doesn't exist (maps to 404). */
export async function listJournalEntries(
  profileId: number,
  range?: { from?: string; to?: string },
): Promise<JournalEntryView[] | null> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { id: true },
  });
  if (!profile) return null;
  const rows = await prisma.journalEntry.findMany({
    where: {
      profileId,
      entryDate: {
        ...(range?.from ? { gte: dateValue(range.from) } : {}),
        ...(range?.to ? { lte: dateValue(range.to) } : {}),
      },
    },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(serialize);
}

/** Null when the profile doesn't exist (maps to 404). */
export async function createJournalEntry(args: {
  profileId: number;
  entryDate: string;
  bodyMd: string;
  mood?: JournalMood | null;
  tags?: string[];
  /** The sky captured at save time; null when no snapshot existed. */
  sky?: EntrySky | null;
}): Promise<JournalEntryView | null> {
  const profile = await prisma.profile.findUnique({
    where: { id: args.profileId },
    select: { id: true },
  });
  if (!profile) return null;
  const row = await prisma.journalEntry.create({
    data: {
      profileId: args.profileId,
      entryDate: dateValue(args.entryDate),
      bodyMd: args.bodyMd,
      mood: args.mood ?? null,
      tagsJson:
        args.tags && args.tags.length > 0
          ? (args.tags as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      skyJson: args.sky
        ? (args.sky as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
    },
  });
  return serialize(row);
}

/** Null when no entry with that id belongs to the profile (maps to 404).
 *  The profileId guard keeps one profile's URL from editing another's note. */
export async function updateJournalEntry(
  profileId: number,
  entryId: number,
  patch: {
    entryDate?: string;
    bodyMd?: string;
    /** Null clears the mood; undefined leaves it untouched. */
    mood?: JournalMood | null;
    /** Full replacement; [] clears. Undefined leaves tags untouched. */
    tags?: string[];
    /** Only passed when entryDate changed — a body edit never touches the
     *  stored sky (the entry's date, and therefore its sky, is unchanged). */
    sky?: EntrySky | null;
  },
): Promise<JournalEntryView | null> {
  const existing = await prisma.journalEntry.findFirst({
    where: { id: entryId, profileId },
    select: { id: true },
  });
  if (!existing) return null;
  const row = await prisma.journalEntry.update({
    where: { id: entryId },
    data: {
      ...(patch.entryDate ? { entryDate: dateValue(patch.entryDate) } : {}),
      ...(patch.bodyMd !== undefined ? { bodyMd: patch.bodyMd } : {}),
      ...(patch.mood !== undefined ? { mood: patch.mood } : {}),
      ...(patch.tags !== undefined
        ? {
            tagsJson:
              patch.tags.length > 0
                ? (patch.tags as unknown as Prisma.InputJsonValue)
                : Prisma.DbNull,
          }
        : {}),
      ...(patch.sky !== undefined
        ? {
            skyJson: patch.sky
              ? (patch.sky as unknown as Prisma.InputJsonValue)
              : Prisma.DbNull,
          }
        : {}),
    },
  });
  return serialize(row);
}

/** Every entry across every profile, newest first — the global timeline's
 *  data source (lib/journalTimeline.ts holds the serializable shape and the
 *  client-side filter). The sky snapshot stays out: the timeline is a
 *  reading surface, and each entry links back to its profile's Journal tab
 *  for the full view. */
export async function listAllJournalEntries(page?: {
  cursor?: number;
  limit: number;
}): Promise<TimelineEntryData[]> {
  const rows = await prisma.journalEntry.findMany({
    // The client extension hides trashed entries; entries whose whole
    // profile is in the Trash need the relation filter.
    where: { profile: { deletedAt: null } },
    // id desc mirrors createdAt desc while keeping the cursor unique.
    orderBy: [{ entryDate: "desc" }, { id: "desc" }],
    ...(page ? { take: page.limit } : {}),
    ...(page?.cursor !== undefined
      ? { cursor: { id: page.cursor }, skip: 1 }
      : {}),
    include: { profile: { select: { id: true, displayName: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    profileId: row.profile.id,
    displayName: row.profile.displayName,
    entryDate: dateString(row.entryDate),
    bodyMd: row.bodyMd,
    mood: (row.mood as JournalMood | null) ?? null,
    tags: (row.tagsJson as unknown as string[] | null) ?? [],
  }));
}

/** Move an entry to the Trash (undoable from Settings → Trash). False when
 *  no live entry with that id belongs to the profile (maps to 404). */
export async function deleteJournalEntry(
  profileId: number,
  entryId: number,
): Promise<boolean> {
  return softDeleteJournalEntry(profileId, entryId);
}
