import { Prisma, type ReadingGenerator } from "@prisma/client";
import { prisma } from "./db";
import type { LifeEventPrecision } from "./lifeEventMeta";

/**
 * The Trash: undo for the destructive actions the app has. Profiles,
 * journal entries and life events are soft-deleted (`deletedAt`, hidden by the client
 * extension in lib/db.ts); discarded AI readings move to `reading_archive`
 * because their unique slot must be freed for regeneration. Everything here
 * either names `deletedAt` explicitly (trash access) or only creates and
 * hard-deletes — the write-once snapshot guard is never involved.
 */

const TRASHED = { deletedAt: { not: null } } as const;

// --- profiles ---------------------------------------------------------------

/** Move a live profile to the Trash. False when it doesn't exist (or is
 *  already trashed — the live filter hides it). Clears the primary flag so a
 *  later "make primary" elsewhere can't leave two primaries after restore. */
export async function softDeleteProfile(id: number): Promise<boolean> {
  const { count } = await prisma.profile.updateMany({
    where: { id },
    data: { deletedAt: new Date(), isPrimary: false },
  });
  return count > 0;
}

export async function restoreProfile(id: number): Promise<boolean> {
  const { count } = await prisma.profile.updateMany({
    where: { id, ...TRASHED },
    data: { deletedAt: null },
  });
  return count > 0;
}

/** Hard delete a trashed profile (cascade removes every snapshot, reading,
 *  forecast and journal entry). Live profiles are refused — trash first. */
export async function purgeProfile(id: number): Promise<boolean> {
  const { count } = await prisma.profile.deleteMany({
    where: { id, ...TRASHED },
  });
  return count > 0;
}

// --- journal entries --------------------------------------------------------

export async function softDeleteJournalEntry(
  profileId: number,
  entryId: number,
): Promise<boolean> {
  const { count } = await prisma.journalEntry.updateMany({
    where: { id: entryId, profileId },
    data: { deletedAt: new Date() },
  });
  return count > 0;
}

export async function restoreJournalEntry(entryId: number): Promise<boolean> {
  const { count } = await prisma.journalEntry.updateMany({
    where: { id: entryId, ...TRASHED },
    data: { deletedAt: null },
  });
  return count > 0;
}

export async function purgeJournalEntry(entryId: number): Promise<boolean> {
  const { count } = await prisma.journalEntry.deleteMany({
    where: { id: entryId, ...TRASHED },
  });
  return count > 0;
}

// --- life events ------------------------------------------------------------

export async function softDeleteLifeEvent(
  profileId: number,
  eventId: number,
): Promise<boolean> {
  const { count } = await prisma.lifeEvent.updateMany({
    where: { id: eventId, profileId },
    data: { deletedAt: new Date() },
  });
  return count > 0;
}

export async function restoreLifeEvent(eventId: number): Promise<boolean> {
  const { count } = await prisma.lifeEvent.updateMany({
    where: { id: eventId, ...TRASHED },
    data: { deletedAt: null },
  });
  return count > 0;
}

export async function purgeLifeEvent(eventId: number): Promise<boolean> {
  const { count } = await prisma.lifeEvent.deleteMany({
    where: { id: eventId, ...TRASHED },
  });
  return count > 0;
}

// --- AI readings ------------------------------------------------------------

/** Discard a stored reading into the archive. Returns the archive id, or
 *  null when no such reading exists (maps to 404). */
export async function archiveReading(
  astroSnapshotId: number,
  generator: ReadingGenerator,
): Promise<number | null> {
  return prisma.$transaction(async (tx) => {
    const reading = await tx.reading.findUnique({
      where: { astroSnapshotId_generator: { astroSnapshotId, generator } },
    });
    if (!reading) return null;
    const archived = await tx.readingArchive.create({
      data: {
        astroSnapshotId: reading.astroSnapshotId,
        numeroSnapshotId: reading.numeroSnapshotId,
        bodyMd: reading.bodyMd,
        generator: reading.generator,
        modelName: reading.modelName,
        contentVersion: reading.contentVersion,
        createdAt: reading.createdAt,
      },
    });
    await tx.reading.delete({ where: { id: reading.id } });
    return archived.id;
  });
}

export type RestoreReadingResult = "restored" | "not_found" | "slot_taken";

/** Put an archived reading back. "slot_taken" when a new reading has been
 *  generated for that snapshot meanwhile — the archive row is kept so the
 *  user can still read the old text from the Trash. */
export async function restoreReading(
  archiveId: number,
): Promise<RestoreReadingResult> {
  const archived = await prisma.readingArchive.findUnique({
    where: { id: archiveId },
  });
  if (!archived) return "not_found";
  try {
    await prisma.$transaction(async (tx) => {
      await tx.reading.create({
        data: {
          astroSnapshotId: archived.astroSnapshotId,
          numeroSnapshotId: archived.numeroSnapshotId,
          bodyMd: archived.bodyMd,
          generator: archived.generator,
          modelName: archived.modelName,
          contentVersion: archived.contentVersion,
          createdAt: archived.createdAt,
        },
      });
      await tx.readingArchive.delete({ where: { id: archiveId } });
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return "slot_taken";
    }
    throw e;
  }
  return "restored";
}

export async function purgeReading(archiveId: number): Promise<boolean> {
  const { count } = await prisma.readingArchive.deleteMany({
    where: { id: archiveId },
  });
  return count > 0;
}

// --- listing / emptying -----------------------------------------------------

export interface TrashData {
  profiles: Array<{
    id: number;
    displayName: string;
    birthDate: string;
    deletedAt: string;
  }>;
  journalEntries: Array<{
    id: number;
    profileId: number;
    displayName: string;
    entryDate: string;
    /** First line of the note, for the list. */
    excerpt: string;
    deletedAt: string;
  }>;
  lifeEvents: Array<{
    id: number;
    profileId: number;
    displayName: string;
    title: string;
    /** Canonical "YYYY-MM-DD" (see lib/lifeEvents.ts). */
    eventDate: string;
    precision: LifeEventPrecision;
    deletedAt: string;
  }>;
  readings: Array<{
    id: number;
    profileId: number;
    displayName: string;
    version: number;
    generator: ReadingGenerator;
    /** First line of the reading, for the list. */
    excerpt: string;
    discardedAt: string;
  }>;
}

function excerpt(md: string): string {
  const line = md.split("\n").find((l) => l.trim() !== "") ?? "";
  const plain = line.replace(/^#+\s*/, "").replace(/[*_`]/g, "").trim();
  return plain.length > 120 ? `${plain.slice(0, 117)}…` : plain;
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Everything restorable. Entries and readings whose whole profile is in
 *  the Trash are folded into that profile (restoring it brings them back). */
export async function listTrash(): Promise<TrashData> {
  const [profiles, entries, lifeEvents, readings] = await Promise.all([
    prisma.profile.findMany({
      where: TRASHED,
      orderBy: { deletedAt: "desc" },
      select: { id: true, displayName: true, birthDate: true, deletedAt: true },
    }),
    prisma.journalEntry.findMany({
      where: { ...TRASHED, profile: { deletedAt: null } },
      orderBy: { deletedAt: "desc" },
      include: { profile: { select: { id: true, displayName: true } } },
    }),
    prisma.lifeEvent.findMany({
      where: { ...TRASHED, profile: { deletedAt: null } },
      orderBy: { deletedAt: "desc" },
      include: { profile: { select: { id: true, displayName: true } } },
    }),
    prisma.readingArchive.findMany({
      where: { astroSnapshot: { profile: { deletedAt: null } } },
      orderBy: { discardedAt: "desc" },
      include: {
        astroSnapshot: {
          select: {
            version: true,
            profile: { select: { id: true, displayName: true } },
          },
        },
      },
    }),
  ]);
  return {
    profiles: profiles.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      birthDate: dateOnly(p.birthDate),
      deletedAt: p.deletedAt!.toISOString(),
    })),
    journalEntries: entries.map((e) => ({
      id: e.id,
      profileId: e.profile.id,
      displayName: e.profile.displayName,
      entryDate: dateOnly(e.entryDate),
      excerpt: excerpt(e.bodyMd),
      deletedAt: e.deletedAt!.toISOString(),
    })),
    lifeEvents: lifeEvents.map((e) => ({
      id: e.id,
      profileId: e.profile.id,
      displayName: e.profile.displayName,
      title: e.title,
      eventDate: dateOnly(e.eventDate),
      precision: e.precision as LifeEventPrecision,
      deletedAt: e.deletedAt!.toISOString(),
    })),
    readings: readings.map((r) => ({
      id: r.id,
      profileId: r.astroSnapshot.profile.id,
      displayName: r.astroSnapshot.profile.displayName,
      version: r.astroSnapshot.version,
      generator: r.generator,
      excerpt: excerpt(r.bodyMd),
      discardedAt: r.discardedAt.toISOString(),
    })),
  };
}

/** Hard-delete everything in the Trash. Returns the row counts removed. */
export async function emptyTrash(): Promise<{
  profiles: number;
  journalEntries: number;
  lifeEvents: number;
  readings: number;
}> {
  const [readings, journalEntries, lifeEvents, profiles] =
    await prisma.$transaction([
      prisma.readingArchive.deleteMany({}),
      prisma.journalEntry.deleteMany({ where: TRASHED }),
      prisma.lifeEvent.deleteMany({ where: TRASHED }),
      prisma.profile.deleteMany({ where: TRASHED }),
    ]);
  return {
    profiles: profiles.count,
    journalEntries: journalEntries.count,
    lifeEvents: lifeEvents.count,
    readings: readings.count,
  };
}
