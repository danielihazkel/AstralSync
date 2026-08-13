import {
  DEFAULT_TRANSIT_ORBS,
  astronomyEngineProvider,
  buildChart,
  detectCrossAspects,
  overlayHouses,
  positionsAt,
  type Aspect,
  type CrossAspect,
  type Placement,
} from "@astralsync/astro-core";
import * as Astronomy from "astronomy-engine";
import { prisma } from "./db";
import type { StoredChart, WheelChart } from "./view-types";

/**
 * Cycles — secondary progressions and the solar return, both ephemeral reads
 * in the lib/transits.ts mold: pure functions of the immutable latest natal
 * snapshot and the current moment, recomputed on every read and NEVER
 * persisted. The write-once guard in lib/db.ts is untouched.
 */

const DAY_MS = 86_400_000;
/** Mean tropical year in days — the day-for-a-year progression rate. */
const TROPICAL_YEAR_DAYS = 365.2425;

export interface CyclesData {
  /** ISO instant the cycles were computed for (the `at` param or now). */
  computedAt: string;
  natal: {
    version: number;
    isSolarChart: boolean;
    /** True when the stored snapshot flags moon_sign uncertainty. */
    moonUncertain: boolean;
  };
  progressions: {
    /** The progressed instant: birth + one ephemeris day per year of age. */
    progressedUtc: string;
    /** Age in tropical years at `computedAt`. */
    ageYears: number;
    /** Progressed placements; `house` is the natal-house overlay, null when
     *  the natal chart is solar. */
    placements: Placement[];
    /** Progressed (a) vs natal (b), sorted by orb ascending. */
    crossAspects: CrossAspect[];
  };
  solarReturn: {
    /** Calendar year the return falls in (the solar year containing now). */
    year: number;
    /** Exact instant the Sun returns to its natal longitude. */
    returnUtc: string;
    /** Full chart at the return instant, cast for the birth location. */
    chart: WheelChart;
  };
  engine: { name: string; version: string };
}

/** Pure: natal chart + instant → progressed placements and natal contacts. */
export function computeProgressions(
  natal: WheelChart,
  at: Date,
): CyclesData["progressions"] {
  const natalUtc = new Date(natal.input.utc);
  const ageYears =
    (at.getTime() - natalUtc.getTime()) / (TROPICAL_YEAR_DAYS * DAY_MS);
  const progressedUtc = new Date(natalUtc.getTime() + ageYears * DAY_MS);
  const placements = overlayHouses(
    positionsAt(progressedUtc),
    natal.houses?.cusps ?? null,
  );
  const crossAspects = detectCrossAspects(
    placements,
    natal.placements,
    DEFAULT_TRANSIT_ORBS,
  ).sort((x, y) => x.orb - y.orb);
  return {
    progressedUtc: progressedUtc.toISOString(),
    ageYears,
    placements,
    crossAspects,
  };
}

/** The instant the Sun returns to `natalSunLon` nearest the birthday in
 *  `year`. The return drifts under a day from the calendar birthday, so an
 *  ±4-day window keeps SearchSunLongitude's bracket tight (it rejects wide
 *  windows). */
function solarReturnInstant(
  natalUtc: Date,
  natalSunLon: number,
  year: number,
): Date | null {
  const birthday = Date.UTC(
    year,
    natalUtc.getUTCMonth(),
    natalUtc.getUTCDate(),
    natalUtc.getUTCHours(),
    natalUtc.getUTCMinutes(),
  );
  const found = Astronomy.SearchSunLongitude(
    natalSunLon,
    new Date(birthday - 4 * DAY_MS),
    8,
  );
  return found ? found.date : null;
}

/** Pure: natal chart + instant → the solar return chart for the solar year
 *  containing `at` (the most recent return not after `at`). */
export function computeSolarReturn(
  natal: WheelChart,
  at: Date,
): CyclesData["solarReturn"] | null {
  const natalUtc = new Date(natal.input.utc);
  const natalSun = natal.placements.find((p) => p.planet === "sun");
  if (!natalSun) return null;

  let year = at.getUTCFullYear();
  let instant = solarReturnInstant(natalUtc, natalSun.longitude, year);
  if (!instant || instant.getTime() > at.getTime()) {
    year -= 1;
    instant = solarReturnInstant(natalUtc, natalSun.longitude, year);
  }
  if (!instant) return null;

  const snapshot = buildChart({
    utc: instant,
    latitude: natal.input.latitude,
    longitude: natal.input.longitude,
    houseSystem: natal.input.houseSystem,
    // The return instant itself is exact; when the natal chart is solar the
    // instant inherits the noon estimate — surfaced via natal.isSolarChart.
    timeCertainty: "exact",
  });
  const chart: WheelChart = { ...snapshot, tzWarnings: [] };
  return { year, returnUtc: instant.toISOString(), chart };
}

/** Pure: natal chart + instant → the full cycles view. */
export function computeCycles(
  natal: WheelChart,
  natalVersion: number,
  at: Date,
): CyclesData | null {
  const solarReturn = computeSolarReturn(natal, at);
  if (!solarReturn) return null;
  return {
    computedAt: at.toISOString(),
    natal: {
      version: natalVersion,
      isSolarChart: natal.isSolarChart,
      moonUncertain: natal.uncertainties.some((u) => u.field === "moon_sign"),
    },
    progressions: computeProgressions(natal, at),
    solarReturn,
    engine: {
      name: astronomyEngineProvider.name,
      version: astronomyEngineProvider.version,
    },
  };
}

/** Ephemeral read against the profile's latest natal snapshot, mirroring
 *  getTransitView. Null when the profile has no snapshot (or the search
 *  window fails, which does not occur for supported ephemeris years). */
export async function getCyclesView(
  profileId: number,
  at?: Date,
): Promise<CyclesData | null> {
  const snapshot = await prisma.astroSnapshot.findFirst({
    where: { profileId },
    orderBy: { version: "desc" },
  });
  if (!snapshot) return null;
  const natal: WheelChart = {
    ...(snapshot.placementsJson as unknown as StoredChart),
    aspects: (snapshot.aspectsJson as unknown as Aspect[]) ?? [],
  };
  return computeCycles(natal, snapshot.version, at ?? new Date());
}
