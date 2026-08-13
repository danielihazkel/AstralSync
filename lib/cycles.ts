import {
  DEFAULT_TRANSIT_ORBS,
  annualProfection,
  astronomyEngineProvider,
  buildChart,
  detectCrossAspects,
  overlayHouses,
  positionsAt,
  type AnnualProfection,
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
  lunarReturn: {
    /** Most recent instant the Moon returned to its natal longitude. */
    returnUtc: string;
    /** The next return — the lunar month this chart colors ends here. */
    nextReturnUtc: string;
    /** Full chart at the return instant, cast for the birth location. */
    chart: WheelChart;
  } | null;
  /** Jupiter and Saturn returns, in that order. */
  planetaryReturns: PlanetaryReturnData[];
  /** Whole-sign annual profection; null on a solar chart (no Ascendant). */
  profection: AnnualProfection | null;
  engine: { name: string; version: string };
}

export type SlowPlanet = "jupiter" | "saturn";

export interface PlanetaryReturnData {
  planet: SlowPlanet;
  /** Approximate cycle length in years (~11.86 Jupiter, ~29.46 Saturn). */
  cycleYears: number;
  natalLongitude: number;
  currentLongitude: number;
  /** Most recent exact crossing ≤ computedAt; null before the first return. */
  lastExactUtc: string | null;
  /** All exact crossings within ±18 months of computedAt — a retrograde loop
   *  over the natal degree produces up to three passes. */
  crossings: string[];
  /** Next exact crossing after computedAt. */
  nextExactUtc: string | null;
  /** Full chart at lastExactUtc, cast for the birth location; null before
   *  the first return. */
  chart: WheelChart | null;
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

/** The Moon's apparent longitude via the same pipeline as the natal chart,
 *  so return instants land exactly on the stored natal longitude. */
function moonLonAt(t: Date): number {
  return positionsAt(t).find((p) => p.planet === "moon")!.longitude;
}

/** Signed wrap of `lon − target` into (−180, 180]. */
function signedDelta(lon: number, target: number): number {
  return ((((lon - target) % 360) + 540) % 360) - 180;
}

/**
 * The exact crossing inside a bracket where the delta ascends through zero.
 * The Moon moves ~13°/day forward, so every true return is an ascending root
 * (the ±180° wrap is a descending jump and never brackets one).
 */
function refineLunarReturn(target: number, from: Date, to: Date): Date | null {
  const found = Astronomy.Search(
    (t) => signedDelta(moonLonAt(t.date), target),
    Astronomy.MakeTime(from),
    Astronomy.MakeTime(to),
  );
  return found ? found.date : null;
}

/** The sidereal month is ~27.32 days; 29 daily steps always spans one. */
const LUNAR_SCAN_DAYS = 29;

/** Most recent Moon-return instant ≤ `at`, or the next one > `at` when
 *  `direction` is "next". Daily samples bracket the crossing; Search
 *  refines it. */
function lunarReturnInstant(
  natalMoonLon: number,
  at: Date,
  direction: "previous" | "next",
): Date | null {
  const step = direction === "previous" ? -DAY_MS : DAY_MS;
  let newer = at;
  let newerDelta = signedDelta(moonLonAt(newer), natalMoonLon);
  for (let i = 1; i <= LUNAR_SCAN_DAYS; i++) {
    const older = new Date(at.getTime() + i * step);
    const olderDelta = signedDelta(moonLonAt(older), natalMoonLon);
    // Ascending zero: negative before the return, positive after. In the
    // "next" direction the roles are mirrored — `older` is later in time.
    const [fromDate, toDate, fromDelta, toDelta] =
      direction === "previous"
        ? [older, newer, olderDelta, newerDelta]
        : [newer, older, newerDelta, olderDelta];
    if (fromDelta < 0 && toDelta >= 0 && toDelta - fromDelta < 180) {
      return refineLunarReturn(natalMoonLon, fromDate, toDate);
    }
    newer = older;
    newerDelta = olderDelta;
  }
  return null;
}

/** Pure: natal chart + instant → the lunar return chart for the lunar month
 *  containing `at` (most recent return ≤ `at`), plus the next return. */
export function computeLunarReturn(
  natal: WheelChart,
  at: Date,
): CyclesData["lunarReturn"] {
  const natalMoon = natal.placements.find((p) => p.planet === "moon");
  if (!natalMoon) return null;

  const returnInstant = lunarReturnInstant(natalMoon.longitude, at, "previous");
  const nextInstant = lunarReturnInstant(natalMoon.longitude, at, "next");
  if (!returnInstant || !nextInstant) return null;

  const snapshot = buildChart({
    utc: returnInstant,
    latitude: natal.input.latitude,
    longitude: natal.input.longitude,
    houseSystem: natal.input.houseSystem,
    // The return instant is exact relative to the natal Moon; when the natal
    // chart is solar that longitude is itself a noon estimate — surfaced via
    // natal.isSolarChart/moonUncertain in the UI.
    timeCertainty: "exact",
  });
  const chart: WheelChart = { ...snapshot, tzWarnings: [] };
  return {
    returnUtc: returnInstant.toISOString(),
    nextReturnUtc: nextInstant.toISOString(),
    chart,
  };
}

const CYCLE_YEARS: Record<SlowPlanet, number> = {
  jupiter: 11.862,
  saturn: 29.457,
};

/** 10-day sampling: Saturn moves ≤ ~0.13°/day and Jupiter ≤ ~0.24°/day, so
 *  consecutive samples differ by ≤ ~2.4° and no natal-degree crossing can
 *  hide between them. */
const RETURN_STEP_MS = 10 * DAY_MS;

function planetLonAt(planet: SlowPlanet, t: Date): number {
  return astronomyEngineProvider.eclipticLongitude(planet, t);
}

/** Refine a bracketed crossing. Astronomy.Search finds ascending roots only,
 *  so a descending crossing (retrograde re-pass) negates the delta. */
function refineCrossing(
  planet: SlowPlanet,
  target: number,
  from: Date,
  to: Date,
  ascending: boolean,
): Date | null {
  const found = Astronomy.Search(
    (t) => {
      const d = signedDelta(planetLonAt(planet, t.date), target);
      return ascending ? d : -d;
    },
    Astronomy.MakeTime(from),
    Astronomy.MakeTime(to),
  );
  return found ? found.date : null;
}

/** All instants in [from, to] where the planet crosses `natalLon`, in time
 *  order — ascending and descending passes both count (retrograde loops give
 *  up to three per return). Brackets straddling the ±180° wrap are the far
 *  point of the cycle, not a crossing, and are skipped via the |delta| < 90°
 *  guard. */
function slowPlanetCrossings(
  planet: SlowPlanet,
  natalLon: number,
  from: Date,
  to: Date,
): Date[] {
  const out: Date[] = [];
  let prevT = from;
  let prevD = signedDelta(planetLonAt(planet, prevT), natalLon);
  while (prevT.getTime() < to.getTime()) {
    const t = new Date(Math.min(prevT.getTime() + RETURN_STEP_MS, to.getTime()));
    const d = signedDelta(planetLonAt(planet, t), natalLon);
    if (Math.abs(prevD) < 90 && Math.abs(d) < 90 && prevD * d < 0) {
      const found = refineCrossing(planet, natalLon, prevT, t, d > prevD);
      if (found) out.push(found);
    }
    prevT = t;
    prevD = d;
  }
  return out;
}

/** Pure: natal chart + instant → the Jupiter/Saturn return picture. Scans
 *  one full cycle back (clamped to a year after birth — the planet sits on
 *  its natal degree at birth, and a retrograde re-pass months later is not a
 *  return) and one forward. */
export function computePlanetaryReturn(
  natal: WheelChart,
  at: Date,
  planet: SlowPlanet,
): PlanetaryReturnData {
  const natalPlacement = natal.placements.find((p) => p.planet === planet)!;
  const natalLon = natalPlacement.longitude;
  const cycleYears = CYCLE_YEARS[planet];
  const cycleMs = cycleYears * TROPICAL_YEAR_DAYS * DAY_MS;
  const birthMs = new Date(natal.input.utc).getTime();

  const backFrom = new Date(
    Math.max(birthMs + 365 * DAY_MS, at.getTime() - cycleMs - 180 * DAY_MS),
  );
  const past =
    backFrom.getTime() < at.getTime()
      ? slowPlanetCrossings(planet, natalLon, backFrom, at)
      : [];
  const future = slowPlanetCrossings(
    planet,
    natalLon,
    at,
    new Date(at.getTime() + cycleMs + 180 * DAY_MS),
  );

  const last = past.length > 0 ? past[past.length - 1] : null;
  const windowMs = 548 * DAY_MS; // ±18 months
  const crossings = [...past, ...future]
    .filter((d) => Math.abs(d.getTime() - at.getTime()) <= windowMs)
    .map((d) => d.toISOString());

  let chart: WheelChart | null = null;
  if (last) {
    const snapshot = buildChart({
      utc: last,
      latitude: natal.input.latitude,
      longitude: natal.input.longitude,
      houseSystem: natal.input.houseSystem,
      // The crossing instant is exact; a solar natal's longitude is itself a
      // noon estimate — surfaced via natal.isSolarChart in the UI.
      timeCertainty: "exact",
    });
    chart = { ...snapshot, tzWarnings: [] };
  }

  return {
    planet,
    cycleYears,
    natalLongitude: natalLon,
    currentLongitude: planetLonAt(planet, at),
    lastExactUtc: last ? last.toISOString() : null,
    crossings,
    nextExactUtc: future.length > 0 ? future[0].toISOString() : null,
    chart,
  };
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
    lunarReturn: computeLunarReturn(natal, at),
    planetaryReturns: (["jupiter", "saturn"] as const).map((p) =>
      computePlanetaryReturn(natal, at, p),
    ),
    profection: natal.bigThree.ascendant
      ? annualProfection(natal.bigThree.ascendant, new Date(natal.input.utc), at)
      : null,
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
