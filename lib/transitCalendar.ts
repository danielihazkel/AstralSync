import type { Aspect } from "@astralsync/astro-core";
import { prisma } from "./db";
import {
  computeTransitCalendar,
  type TransitCalendarData,
  type TransitCalendarOptions,
} from "./transitCalendarCore";
import type { StoredChart, WheelChart } from "./view-types";

/**
 * Prisma glue for the transit calendar — the pure scan lives in
 * lib/transitCalendarCore.ts (DB-free so client surfaces can bundle it);
 * this module re-exports it for the existing server-side import sites.
 */
export * from "./transitCalendarCore";

/** Ephemeral read against the profile's latest natal snapshot — the same
 *  loading path as getTransitView. Null when the profile has no snapshot. */
export async function getTransitCalendar(
  profileId: number,
  from: Date,
  to: Date,
  options?: TransitCalendarOptions,
): Promise<TransitCalendarData | null> {
  const snapshot = await prisma.astroSnapshot.findFirst({
    where: { profileId },
    orderBy: { version: "desc" },
  });
  if (!snapshot) return null;
  const natal: WheelChart = {
    ...(snapshot.placementsJson as unknown as StoredChart),
    aspects: (snapshot.aspectsJson as unknown as Aspect[]) ?? [],
  };
  return computeTransitCalendar(natal, snapshot.version, from, to, options);
}
