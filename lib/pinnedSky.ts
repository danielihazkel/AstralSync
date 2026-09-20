import type { CrossAspect, Placement } from "@astralsync/astro-core";
import { getTransitView, type TransitData } from "./transits";

/**
 * A sky pinned to a dated row.
 *
 * Journal entries and life events both keep one: the transits in force on
 * their date, captured once and stored, rather than recomputed on every
 * read. Shared here because both need exactly the same shape and the same
 * capture rule, and lib/lifeEvents importing lib/journal to get it would be
 * the wrong dependency.
 *
 * Why store it at all, when the transits route can recompute the same thing
 * from the same immutable snapshot? Two reasons, and only two: the stored
 * copy survives an ephemeris-provider swap (the numbers a reading was
 * actually written against stay the numbers it was written against), and it
 * travels in the export, so a restored profile carries its own history
 * rather than re-deriving it. Everything else about a pinned sky is
 * deterministic, which is why the browsable views still recompute.
 */

/** A trimmed transit view: majors at the engine's default transit orbs. */
export interface PinnedSky {
  /** ISO instant the transits were computed for (local noon of the date). */
  computedAt: string;
  /** Natal snapshot version the aspects were cast against. */
  natalVersion: number;
  engine: { name: string; version: string };
  placements: Placement[];
  crossAspects: CrossAspect[];
}

/**
 * Pure: full transit view → the slice worth storing. The read-time extras
 * (applying flags, angle aspects) stay out — the stored shape is the plain
 * cross-aspect list and must not grow with the live view.
 */
export function pinnedSkyFromTransits(t: TransitData): PinnedSky {
  return {
    computedAt: t.computedAt,
    natalVersion: t.natal.version,
    engine: t.engine,
    placements: t.placements,
    crossAspects: t.crossAspects.map(({ applying: _applying, ...c }) => c),
  };
}

/**
 * The sky for a profile on a civil date, computed at the client's local noon
 * (`at`) or UTC noon as a fallback. Null when the profile has no snapshot or
 * the ephemeris rejects the instant — the row is always saved regardless,
 * because a missing sky is a missing decoration, not a failed write.
 */
export async function skyForDate(
  profileId: number,
  date: string,
  at: string | undefined,
): Promise<PinnedSky | null> {
  const instant = at ? new Date(at) : new Date(`${date}T12:00:00Z`);
  try {
    const view = await getTransitView(profileId, instant);
    return view ? pinnedSkyFromTransits(view) : null;
  } catch {
    return null;
  }
}
