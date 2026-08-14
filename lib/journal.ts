import { Prisma } from "@prisma/client";
import type { CrossAspect, Placement } from "@astralsync/astro-core";
import { prisma } from "./db";
import { getTransitView, type TransitData } from "./transits";

/**
 * Prisma glue for journal entries — user notes pinned to a civil date
 * (Phase 3g). Entries are the user's own words: freely editable and
 * deletable, so unlike snapshots nothing here is write-once. Each entry
 * additionally snapshots the transits active when it was saved (skyJson) so
 * "what was in the sky when I wrote this" survives engine upgrades; the
 * browsable sky view still recomputes via /api/transits/[id]?at=.
 */

/** The sky stored with an entry: a trimmed transit view (majors at the
 *  engine's default transit orbs — exactly what the Journal tab displays). */
export interface EntrySky {
  /** ISO instant the transits were computed for (local noon of entryDate). */
  computedAt: string;
  /** Natal snapshot version the aspects were cast against. */
  natalVersion: number;
  engine: { name: string; version: string };
  placements: Placement[];
  crossAspects: CrossAspect[];
}

/** Pure: full transit view → the slice worth storing per entry. */
export function entrySkyFromTransits(t: TransitData): EntrySky {
  return {
    computedAt: t.computedAt,
    natalVersion: t.natal.version,
    engine: t.engine,
    placements: t.placements,
    crossAspects: t.crossAspects,
  };
}

/** The entry's sky: the same transit view the Journal tab shows, computed
 *  at the client's local noon (`at`) or UTC noon as a fallback. Null when
 *  the profile has no snapshot or the ephemeris rejects the instant — the
 *  note is always saved regardless. */
export async function skyForEntry(
  profileId: number,
  entryDate: string,
  at: string | undefined,
): Promise<EntrySky | null> {
  const instant = at ? new Date(at) : new Date(`${entryDate}T12:00:00Z`);
  try {
    const view = await getTransitView(profileId, instant);
    return view ? entrySkyFromTransits(view) : null;
  } catch {
    return null;
  }
}

export interface JournalEntryView {
  id: number;
  /** "YYYY-MM-DD" civil date the note is about. */
  entryDate: string;
  bodyMd: string;
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
  skyJson: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): JournalEntryView {
  return {
    id: row.id,
    entryDate: dateString(row.entryDate),
    bodyMd: row.bodyMd,
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
