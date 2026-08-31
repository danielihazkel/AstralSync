import { prisma } from "./db";
import { softDeleteLifeEvent } from "./trash";
import {
  MAX_LIFE_EVENTS_PER_PROFILE,
  type LifeEventCategory,
  type LifeEventPrecision,
} from "./lifeEventMeta";

/**
 * Prisma glue for major life events — dated milestones the user records per
 * profile (marriage, births, moves, losses…), which the Life Story reading
 * feeds to the LLM alongside the chart and numerology data. Events are the
 * user's own words: freely editable and deletable (the JournalEntry stance,
 * not the write-once snapshot one), soft-deleted into the Trash.
 */

export interface LifeEventView {
  id: number;
  title: string;
  /** Canonical "YYYY-MM-DD": day 01 / January 01 for coarser precisions. */
  eventDate: string;
  precision: LifeEventPrecision;
  category: LifeEventCategory;
  /** Optional markdown notes; null when none. */
  notesMd: string | null;
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
  title: string;
  eventDate: Date;
  precision: string;
  category: string;
  notesMd: string | null;
  createdAt: Date;
  updatedAt: Date;
}): LifeEventView {
  return {
    id: row.id,
    title: row.title,
    eventDate: dateString(row.eventDate),
    precision: row.precision as LifeEventPrecision,
    category: row.category as LifeEventCategory,
    notesMd: row.notesMd,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** All of a profile's events, oldest first — a life story reads forward.
 *  Null when the profile doesn't exist (maps to 404). */
export async function listLifeEvents(
  profileId: number,
): Promise<LifeEventView[] | null> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { id: true },
  });
  if (!profile) return null;
  const rows = await prisma.lifeEvent.findMany({
    where: { profileId },
    orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(serialize);
}

/** Null when the profile doesn't exist (404); "limit" when the profile
 *  already holds MAX_LIFE_EVENTS_PER_PROFILE live events (409). */
export async function createLifeEvent(args: {
  profileId: number;
  title: string;
  eventDate: string;
  precision: LifeEventPrecision;
  category: LifeEventCategory;
  notesMd?: string | null;
}): Promise<LifeEventView | "limit" | null> {
  const profile = await prisma.profile.findUnique({
    where: { id: args.profileId },
    select: { id: true },
  });
  if (!profile) return null;
  // The client extension narrows count to live rows (deletedAt: null).
  const live = await prisma.lifeEvent.count({
    where: { profileId: args.profileId },
  });
  if (live >= MAX_LIFE_EVENTS_PER_PROFILE) return "limit";
  const row = await prisma.lifeEvent.create({
    data: {
      profileId: args.profileId,
      title: args.title,
      eventDate: dateValue(args.eventDate),
      precision: args.precision,
      category: args.category,
      notesMd: args.notesMd ?? null,
    },
  });
  return serialize(row);
}

/** Null when no event with that id belongs to the profile (maps to 404).
 *  The profileId guard keeps one profile's URL from editing another's
 *  events. eventDate and precision always travel together (validation
 *  enforces it) — the canonical form depends on both. */
export async function updateLifeEvent(
  profileId: number,
  eventId: number,
  patch: {
    title?: string;
    eventDate?: string;
    precision?: LifeEventPrecision;
    category?: LifeEventCategory;
    /** Null clears the notes; undefined leaves them untouched. */
    notesMd?: string | null;
  },
): Promise<LifeEventView | null> {
  const existing = await prisma.lifeEvent.findFirst({
    where: { id: eventId, profileId },
    select: { id: true },
  });
  if (!existing) return null;
  const row = await prisma.lifeEvent.update({
    where: { id: eventId },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.eventDate !== undefined
        ? { eventDate: dateValue(patch.eventDate) }
        : {}),
      ...(patch.precision !== undefined ? { precision: patch.precision } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.notesMd !== undefined ? { notesMd: patch.notesMd } : {}),
    },
  });
  return serialize(row);
}

/** Move an event to the Trash (undoable from Settings → Trash). False when
 *  no live event with that id belongs to the profile (maps to 404). */
export async function deleteLifeEvent(
  profileId: number,
  eventId: number,
): Promise<boolean> {
  return softDeleteLifeEvent(profileId, eventId);
}
