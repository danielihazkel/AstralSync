import {
  MAJOR_ASPECTS,
  PLANET_SCAN_STEP_MS,
  astronomyEngineProvider,
  findAspectHits,
  type Aspect,
  type AspectType,
  type AngleBody,
  type Planet,
} from "@astralsync/astro-core";
import { prisma } from "./db";
import type { StoredChart, WheelChart } from "./view-types";

/**
 * "When is my next X?" — the next N instants a transiting planet perfects a
 * major aspect to one natal point, scanned fresh on every read and never
 * persisted (the PRD §9 stance shared with lib/transitCalendar.ts). Where
 * the calendar sweeps every contact in a bounded range, this walks an
 * open-ended horizon for a single (planet, aspect, target) triple — which is
 * also why the transiting Moon is allowed here: one pair is cheap, and "my
 * next lunar return of a contact" is exactly the query the calendar refuses.
 *
 * Retrograde loops produce one hit per pass, in time order; hits carry the
 * transiting planet's Rx flag instead of "pass n of m" numbering, which is
 * ill-defined when the horizon ends wherever the Nth hit lands.
 */

const DAY_MS = 86_400_000;
const YEAR_MS = 365.25 * DAY_MS;

/** The ephemeris' validity window (the Pluto model bound the calendar route
 *  already enforces). Scans never leave it. */
const SCAN_FLOOR = new Date(Date.UTC(1700, 0, 1));
const SCAN_CAP = new Date(Date.UTC(2201, 0, 1));

/** Chunk lengths sized so one chunk usually contains the next few hits for
 *  that mover (aspect recurrence ≈ its synodic pace), keeping the common
 *  case to one or two scans. The outers just scan straight to the cap: at a
 *  10-day step even the full 1700–2200 window is only ~18k samples. */
const CHUNK_MS: Record<Planet, number> = {
  moon: 90 * DAY_MS,
  sun: 400 * DAY_MS,
  mercury: 400 * DAY_MS,
  venus: 400 * DAY_MS,
  mars: 800 * DAY_MS,
  jupiter: 15 * YEAR_MS,
  saturn: 40 * YEAR_MS,
  uranus: SCAN_CAP.getTime() - SCAN_FLOOR.getTime(),
  neptune: SCAN_CAP.getTime() - SCAN_FLOOR.getTime(),
  pluto: SCAN_CAP.getTime() - SCAN_FLOOR.getTime(),
};

export type SearchTarget = Planet | AngleBody;

export interface AspectSearchHit {
  /** ISO instant the aspect perfects. */
  utc: string;
  /** True when the transiting planet was retrograde at the hit. */
  retrograde: boolean;
  /** True when the signed separation was increasing at the hit. */
  ascending: boolean;
}

export interface AspectSearchData {
  /** ISO instant the search started from. */
  from: string;
  planet: Planet;
  target: SearchTarget;
  aspect: AspectType;
  /** The requested number of hits. */
  count: number;
  natal: {
    version: number;
    isSolarChart: boolean;
    moonUncertain: boolean;
  };
  /** Up to `count` perfection instants, time-ascending. */
  hits: AspectSearchHit[];
  /** True when the ephemeris cap (end of 2200) arrived before `count` hits. */
  truncated: boolean;
  engine: { name: string; version: string };
}

/** Pure: natal chart + query → the next `count` exact hits. Null when the
 *  target is an angle and the chart is houseless (solar). */
export function computeAspectSearch(
  natal: WheelChart,
  natalVersion: number,
  params: {
    planet: Planet;
    target: SearchTarget;
    aspect: AspectType;
    count: number;
    from: Date;
  },
): AspectSearchData | null {
  const { planet, target, aspect, count } = params;
  const eph = astronomyEngineProvider;

  let targetLon: number;
  if (target === "ascendant" || target === "mc") {
    if (!natal.houses) return null;
    targetLon = natal.houses[target];
  } else {
    const placement = natal.placements.find((p) => p.planet === target);
    if (!placement) return null;
    targetLon = placement.longitude;
  }

  const angle = MAJOR_ASPECTS.find((d) => d.type === aspect)!.angle;
  const lonAt = (t: Date) => eph.eclipticLongitude(planet, t);
  const from = new Date(
    Math.max(params.from.getTime(), SCAN_FLOOR.getTime()),
  );

  const hits: AspectSearchHit[] = [];
  let chunkFrom = from;
  while (hits.length < count && chunkFrom.getTime() < SCAN_CAP.getTime()) {
    const chunkTo = new Date(
      Math.min(chunkFrom.getTime() + CHUNK_MS[planet], SCAN_CAP.getTime()),
    );
    // Chunks abut exactly, so no hit can fall between them; a hit landing on
    // the shared boundary instant would duplicate, so keep only hits strictly
    // before each chunk's end (the final chunk ends at the cap, exclusive).
    const found = findAspectHits(
      lonAt,
      () => targetLon,
      [angle],
      chunkFrom,
      chunkTo,
      PLANET_SCAN_STEP_MS[planet],
    );
    for (const h of found) {
      if (h.utc.getTime() >= chunkTo.getTime()) continue;
      hits.push({
        utc: h.utc.toISOString(),
        retrograde: eph.isRetrograde(planet, h.utc),
        ascending: h.ascending,
      });
      if (hits.length === count) break;
    }
    chunkFrom = chunkTo;
  }

  return {
    from: from.toISOString(),
    planet,
    target,
    aspect,
    count,
    natal: {
      version: natalVersion,
      isSolarChart: natal.isSolarChart,
      moonUncertain: natal.uncertainties.some((u) => u.field === "moon_sign"),
    },
    hits,
    truncated: hits.length < count,
    engine: { name: eph.name, version: eph.version },
  };
}

/** Ephemeral read against the profile's latest natal snapshot — the same
 *  loading path as getTransitCalendar. The sentinels let the route pick the
 *  right status: no snapshot is a 404, an angle target on a houseless solar
 *  chart is a 400 (the query can never succeed for this profile). */
export async function getAspectSearch(
  profileId: number,
  params: {
    planet: Planet;
    target: SearchTarget;
    aspect: AspectType;
    count: number;
    from: Date;
  },
): Promise<AspectSearchData | "no_snapshot" | "no_angles"> {
  const snapshot = await prisma.astroSnapshot.findFirst({
    where: { profileId },
    orderBy: { version: "desc" },
  });
  if (!snapshot) return "no_snapshot";
  const natal: WheelChart = {
    ...(snapshot.placementsJson as unknown as StoredChart),
    aspects: (snapshot.aspectsJson as unknown as Aspect[]) ?? [],
  };
  return computeAspectSearch(natal, snapshot.version, params) ?? "no_angles";
}
