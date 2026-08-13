import { prisma } from "./db";

/**
 * Prisma glue for journal entries — user notes pinned to a civil date
 * (Phase 3g). Entries are the user's own words: freely editable and
 * deletable, so unlike snapshots nothing here is write-once. The sky for an
 * entry's date is never stored; the Journal tab recomputes it through
 * /api/transits/[id]?at= like any other ephemeral transit read.
 */

export interface JournalEntryView {
  id: number;
  /** "YYYY-MM-DD" civil date the note is about. */
  entryDate: string;
  bodyMd: string;
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
  createdAt: Date;
  updatedAt: Date;
}): JournalEntryView {
  return {
    id: row.id,
    entryDate: dateString(row.entryDate),
    bodyMd: row.bodyMd,
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
    },
  });
  return serialize(row);
}

/** Null when no entry with that id belongs to the profile (maps to 404).
 *  The profileId guard keeps one profile's URL from editing another's note. */
export async function updateJournalEntry(
  profileId: number,
  entryId: number,
  patch: { entryDate?: string; bodyMd?: string },
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
    },
  });
  return serialize(row);
}

/** False when no entry with that id belongs to the profile (maps to 404). */
export async function deleteJournalEntry(
  profileId: number,
  entryId: number,
): Promise<boolean> {
  const { count } = await prisma.journalEntry.deleteMany({
    where: { id: entryId, profileId },
  });
  return count > 0;
}
