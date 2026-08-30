import type { Aspect } from "@astralsync/astro-core";
import { prisma } from "./db";
import {
  computeTransitGraph,
  type TransitGraphData,
  type TransitGraphOptions,
} from "./transitGraphCore";
import type { StoredChart, WheelChart } from "./view-types";

/** Prisma glue for the transit time-graph (pure scan in
 *  lib/transitGraphCore.ts) — the getTransitCalendar loading path. */
export * from "./transitGraphCore";

export async function getTransitGraph(
  profileId: number,
  from: Date,
  to: Date,
  options?: TransitGraphOptions,
): Promise<TransitGraphData | null> {
  const snapshot = await prisma.astroSnapshot.findFirst({
    where: { profileId },
    orderBy: { version: "desc" },
  });
  if (!snapshot) return null;
  const natal: WheelChart = {
    ...(snapshot.placementsJson as unknown as StoredChart),
    aspects: (snapshot.aspectsJson as unknown as Aspect[]) ?? [],
  };
  return computeTransitGraph(natal, snapshot.version, from, to, options);
}
