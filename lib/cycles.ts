import {
  ALL_ASPECTS,
  DEFAULT_TRANSIT_ORBS,
  MAJOR_ASPECTS,
  PLANET_SCAN_STEP_MS,
  annualProfection,
  astronomyEngineProvider,
  buildChart,
  currentFirdaria,
  detectAngleAspects,
  detectCrossAspects,
  findAspectHits,
  isDayChart,
  norm360,
  overlayHouses,
  partOfFortune,
  partOfSpirit,
  positionsAt,
  signOf,
  zodiacalReleasing,
  type AngleAspect,
  type AnnualProfection,
  type Aspect,
  type CrossAspect,
  type CurrentFirdaria,
  type OrbConfig,
  type Placement,
  type ZodiacalReleasing,
} from "@astralsync/astro-core";
import * as Astronomy from "astronomy-engine";
import { prisma } from "./db";
import { moonPhaseName } from "./moonPhase";
import type { TransitOptions } from "./transits";
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
/** Mean tropical month in days — the day-for-a-lunar-month rate of
 *  tertiary progressions (Troinski's convention). */
const TROPICAL_MONTH_DAYS = 27.321582;

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
    /** The progressed chart in its own right: cast at the progressed instant
     *  for the birth place, giving progressed ASC/MC/cusps (the simplest
     *  progressed-house convention; quotidian variants could layer on
     *  later). Houses are null when the natal chart is solar — the
     *  progressed instant inherits the birth time's uncertainty. */
    chart: WheelChart;
    /** The progressed Sun–Moon cycle: phase now and its next turning points
     *  in real time (a progressed lunation lasts ~29½ years). */
    lunation: ProgressedLunation;
  };
  /** Tertiary progressions — a day for each lunar month of life, so the
   *  tertiary Moon moves ~1° per real day: a month-scale timing layer. */
  tertiary: {
    progressedUtc: string;
    /** Lunar months of age at computedAt. */
    ageMonths: number;
    placements: Placement[];
    /** Tertiary (a) vs natal (b), sorted by orb ascending. */
    crossAspects: CrossAspect[];
  };
  solarArc: {
    /** Progressed-Sun minus natal-Sun longitude, degrees (~1°/year of age). */
    arcDegrees: number;
    /** Natal placements advanced by the arc; `house` is the natal-house
     *  overlay (null on solar charts), `retrograde` carried from natal —
     *  a directed chart is symbolic, it mirrors the natal condition. */
    placements: Placement[];
    /** Directed (a) vs natal (b) at the fixed 1° directions orb, majors
     *  only, sorted by orb ascending. */
    crossAspects: CrossAspect[];
    /** Directed planets on the natal ASC/MC at the same 1° orb; empty when
     *  the natal chart is houseless. */
    angleAspects: AngleAspect[];
  };
  solarReturn: {
    /** Calendar year the return falls in (the solar year containing now). */
    year: number;
    /** Exact instant the Sun returns to its natal longitude. */
    returnUtc: string;
    /** Full chart at the return instant — cast for the birth location, or
     *  the requested relocation. */
    chart: WheelChart;
    /** True when the chart was cast for a location other than the birth
     *  place (the instant is the same; only houses and angles move). */
    relocated: boolean;
  };
  lunarReturn: {
    /** Most recent instant the Moon returned to its natal longitude. */
    returnUtc: string;
    /** The next return — the lunar month this chart colors ends here. */
    nextReturnUtc: string;
    /** Full chart at the return instant — cast for the birth location, or
     *  the requested relocation. */
    chart: WheelChart;
    /** True when the chart was cast for a location other than the birth
     *  place (the instant is the same; only houses and angles move). */
    relocated: boolean;
  } | null;
  /** Jupiter and Saturn returns, in that order. */
  planetaryReturns: PlanetaryReturnData[];
  /** Whole-sign annual profection; null on a solar chart (no Ascendant). */
  profection: AnnualProfection | null;
  /** Persian time-lord periods; null on a solar chart (sect needs houses)
   *  and true when the chart is a day chart. */
  firdaria: (CurrentFirdaria & { isDay: boolean }) | null;
  /** Zodiacal releasing from the lots of Fortune and Spirit; null on a
   *  solar chart (the lots need an Ascendant). */
  zodiacalReleasing: {
    fortune: ZodiacalReleasing;
    spirit: ZodiacalReleasing;
  } | null;
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

/** One resolved content entry, ready to render. */
export interface CyclesEntryProse {
  title: string;
  bodyMd: string;
}

/**
 * Optional per-section prose the cycles route resolves from the content
 * library and attaches to the payload (the /api/transits pattern — the
 * panel is a client component, so prose must ride the response). Each field
 * maps to one fixed section slot; missing entries or null inputs (solar
 * charts have no profection or progressed Ascendant) leave the field absent.
 */
export interface CyclesProse {
  /** profection_year/<house 1-12> */
  profection?: CyclesEntryProse;
  /** progressed_sun_sign/<sign> */
  progressedSun?: CyclesEntryProse;
  /** progressed_asc_sign/<sign> */
  progressedAsc?: CyclesEntryProse;
  /** return_overview/{solar,lunar,jupiter,saturn} */
  solarReturn?: CyclesEntryProse;
  lunarReturn?: CyclesEntryProse;
  jupiterReturn?: CyclesEntryProse;
  saturnReturn?: CyclesEntryProse;
  /** solar_arc/overview */
  solarArc?: CyclesEntryProse;
}

export interface ProgressedLunation {
  /** Progressed Moon − progressed Sun, degrees [0, 360). */
  phaseDeg: number;
  /** "Waxing Gibbous" etc. — the natal/transit naming bands. */
  phaseName: string;
  waxing: boolean;
  /** Real-time ISO instants: the last progressed New Moon (the current
   *  ~29½-year cycle's start) and the next New and Full Moons. */
  lastNewMoonUtc: string;
  nextNewMoonUtc: string;
  nextFullMoonUtc: string;
}

/** Progressed offset in days ↔ real elapsed time: one ephemeris day per
 *  tropical year. */
function realFromProgressed(natalUtc: Date, progressedUtc: Date): Date {
  const offsetDays = (progressedUtc.getTime() - natalUtc.getTime()) / DAY_MS;
  return new Date(natalUtc.getTime() + offsetDays * TROPICAL_YEAR_DAYS * DAY_MS);
}

/**
 * Pure: the progressed lunation phase at `progressedUtc` and its turning
 * points. The scan runs in progressed time (a ~30-progressed-day window
 * covers ~30 real years) and maps the hits back to real dates.
 */
export function computeProgressedLunation(
  natalUtc: Date,
  progressedUtc: Date,
): ProgressedLunation {
  const eph = astronomyEngineProvider;
  const moonAt = (t: Date) => eph.eclipticLongitude("moon", t);
  const sunAt = (t: Date) => eph.eclipticLongitude("sun", t);
  const phaseDeg = norm360(moonAt(progressedUtc) - sunAt(progressedUtc));
  const step = PLANET_SCAN_STEP_MS.moon;
  const back = findAspectHits(
    moonAt,
    sunAt,
    [0],
    new Date(progressedUtc.getTime() - 31 * DAY_MS),
    progressedUtc,
    step,
  );
  const ahead = findAspectHits(
    moonAt,
    sunAt,
    [0, 180],
    progressedUtc,
    new Date(progressedUtc.getTime() + 31 * DAY_MS),
    step,
  );
  const lastNew = back[back.length - 1]?.utc ?? progressedUtc;
  const nextNew = ahead.find((h) => h.angle === 0)?.utc ?? progressedUtc;
  const nextFull = ahead.find((h) => h.angle === 180)?.utc ?? progressedUtc;
  return {
    phaseDeg,
    phaseName: moonPhaseName(phaseDeg),
    waxing: phaseDeg < 180,
    lastNewMoonUtc: realFromProgressed(natalUtc, lastNew).toISOString(),
    nextNewMoonUtc: realFromProgressed(natalUtc, nextNew).toISOString(),
    nextFullMoonUtc: realFromProgressed(natalUtc, nextFull).toISOString(),
  };
}

/** Pure: natal chart + instant → tertiary placements and natal contacts. */
export function computeTertiaryProgressions(
  natal: WheelChart,
  at: Date,
  options: TransitOptions = {},
): CyclesData["tertiary"] {
  const natalUtc = new Date(natal.input.utc);
  const ageMonths =
    (at.getTime() - natalUtc.getTime()) / (TROPICAL_MONTH_DAYS * DAY_MS);
  const progressedUtc = new Date(natalUtc.getTime() + ageMonths * DAY_MS);
  const placements = overlayHouses(
    positionsAt(progressedUtc),
    natal.houses?.cusps ?? null,
  );
  const crossAspects = detectCrossAspects(
    placements,
    natal.placements,
    options.orbs ?? DEFAULT_TRANSIT_ORBS,
    options.includeMinors ? ALL_ASPECTS : MAJOR_ASPECTS,
  ).sort((x, y) => x.orb - y.orb);
  return {
    progressedUtc: progressedUtc.toISOString(),
    ageMonths,
    placements,
    crossAspects,
  };
}

/** Pure: natal chart + instant → progressed placements and natal contacts. */
export function computeProgressions(
  natal: WheelChart,
  at: Date,
  options: TransitOptions = {},
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
    options.orbs ?? DEFAULT_TRANSIT_ORBS,
    options.includeMinors ? ALL_ASPECTS : MAJOR_ASPECTS,
  ).sort((x, y) => x.orb - y.orb);
  const snapshot = buildChart({
    utc: progressedUtc,
    latitude: natal.input.latitude,
    longitude: natal.input.longitude,
    houseSystem: natal.input.houseSystem,
    // Unlike the returns (whose instants are exact), the progressed instant
    // is natal + offset, so it inherits the birth time's certainty — a solar
    // natal degrades to a houseless solar progressed chart. Internal aspects
    // stay at chart-default orbs like every other full chart in this view.
    timeCertainty: natal.input.timeCertainty,
  });
  const chart: WheelChart = { ...snapshot, tzWarnings: [] };
  return {
    progressedUtc: progressedUtc.toISOString(),
    ageYears,
    placements,
    crossAspects,
    chart,
    lunation: computeProgressedLunation(natalUtc, progressedUtc),
  };
}

/** Directions doctrine: contacts perfect by a symbolic arc, not real motion,
 *  so they are read at a tight fixed 1° — deliberately not user-tunable
 *  (OrbSettingsControl does not apply; the UI says so). */
const SOLAR_ARC_ORBS: OrbConfig = { luminary: 1, default: 1 };

/**
 * Pure: natal chart + instant → solar arc directions. Every natal point is
 * advanced by the progressed Sun's arc (the same day-for-a-year instant as
 * computeProgressions, so directed Sun ≡ progressed Sun by construction),
 * then read against the natal chart. Aspects and angle contacts only — a
 * directed chart is a timing overlay, not a chart in its own right.
 */
export function computeSolarArc(
  natal: WheelChart,
  at: Date,
): CyclesData["solarArc"] {
  const natalUtc = new Date(natal.input.utc);
  const ageYears =
    (at.getTime() - natalUtc.getTime()) / (TROPICAL_YEAR_DAYS * DAY_MS);
  const progressedUtc = new Date(natalUtc.getTime() + ageYears * DAY_MS);
  // The progressed Sun from the same pipeline as the stored natal Sun, so
  // the arc is internally consistent with the snapshot's longitudes.
  const progSun = positionsAt(progressedUtc).find((p) => p.planet === "sun")!;
  const natalSun = natal.placements.find((p) => p.planet === "sun")!;
  const arcDegrees = norm360(progSun.longitude - natalSun.longitude);

  const placements = overlayHouses(
    natal.placements.map((p) => {
      const longitude = norm360(p.longitude + arcDegrees);
      return {
        planet: p.planet,
        longitude,
        sign: signOf(longitude),
        degreeInSign: longitude % 30,
        house: null,
        retrograde: p.retrograde,
      };
    }),
    natal.houses?.cusps ?? null,
  );
  const crossAspects = detectCrossAspects(
    placements,
    natal.placements,
    SOLAR_ARC_ORBS,
    MAJOR_ASPECTS,
  ).sort((x, y) => x.orb - y.orb);
  const angleAspects = natal.houses
    ? detectAngleAspects(placements, natal.houses, SOLAR_ARC_ORBS).sort(
        (x, y) => x.orb - y.orb,
      )
    : [];
  return { arcDegrees, placements, crossAspects, angleAspects };
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

/** An alternate casting location for a return chart (relocation). */
export interface ReturnLocation {
  latitude: number;
  longitude: number;
}

/** Pure: natal chart + instant → the solar return chart for the solar year
 *  containing `at` (the most recent return not after `at`). The return
 *  instant is location-independent; `location` relocates only the chart —
 *  houses and angles move, the planets hold their degrees. */
export function computeSolarReturn(
  natal: WheelChart,
  at: Date,
  location?: ReturnLocation,
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
    latitude: location?.latitude ?? natal.input.latitude,
    longitude: location?.longitude ?? natal.input.longitude,
    houseSystem: natal.input.houseSystem,
    // The return instant itself is exact; when the natal chart is solar the
    // instant inherits the noon estimate — surfaced via natal.isSolarChart.
    timeCertainty: "exact",
  });
  const chart: WheelChart = { ...snapshot, tzWarnings: [] };
  return {
    year,
    returnUtc: instant.toISOString(),
    chart,
    relocated: location !== undefined,
  };
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
 *  containing `at` (most recent return ≤ `at`), plus the next return. The
 *  return instant is location-independent; `location` relocates only the
 *  chart — houses and angles move, the planets hold their degrees. */
export function computeLunarReturn(
  natal: WheelChart,
  at: Date,
  location?: ReturnLocation,
): CyclesData["lunarReturn"] {
  const natalMoon = natal.placements.find((p) => p.planet === "moon");
  if (!natalMoon) return null;

  const returnInstant = lunarReturnInstant(natalMoon.longitude, at, "previous");
  const nextInstant = lunarReturnInstant(natalMoon.longitude, at, "next");
  if (!returnInstant || !nextInstant) return null;

  const snapshot = buildChart({
    utc: returnInstant,
    latitude: location?.latitude ?? natal.input.latitude,
    longitude: location?.longitude ?? natal.input.longitude,
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
    relocated: location !== undefined,
  };
}

const CYCLE_YEARS: Record<SlowPlanet, number> = {
  jupiter: 11.862,
  saturn: 29.457,
};

function planetLonAt(planet: SlowPlanet, t: Date): number {
  return astronomyEngineProvider.eclipticLongitude(planet, t);
}

/** All instants in [from, to] where the planet crosses `natalLon`, in time
 *  order — ascending and descending passes both count (retrograde loops give
 *  up to three per return). The shared scan layer applies the same |delta|
 *  < 90° wrap guard this file used to hand-roll; a conjunction (angle 0) to
 *  the fixed natal longitude is exactly a return crossing. */
function slowPlanetCrossings(
  planet: SlowPlanet,
  natalLon: number,
  from: Date,
  to: Date,
): Date[] {
  return findAspectHits(
    (t) => planetLonAt(planet, t),
    () => natalLon,
    [0],
    from,
    to,
    PLANET_SCAN_STEP_MS[planet],
  ).map((h) => h.utc);
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
  options: TransitOptions = {},
  srLocation?: ReturnLocation,
  lrLocation?: ReturnLocation,
): CyclesData | null {
  const solarReturn = computeSolarReturn(natal, at, srLocation);
  if (!solarReturn) return null;
  const natalUtc = new Date(natal.input.utc);
  let firdaria: CyclesData["firdaria"] = null;
  let releasing: CyclesData["zodiacalReleasing"] = null;
  if (natal.houses) {
    const sunLon = natal.placements.find((p) => p.planet === "sun")!.longitude;
    const moonLon = natal.placements.find((p) => p.planet === "moon")!.longitude;
    const isDay = isDayChart(sunLon, natal.houses.cusps);
    const current = currentFirdaria(natalUtc, isDay, at);
    if (current) firdaria = { ...current, isDay };
    const asc = natal.houses.ascendant;
    releasing = {
      fortune: zodiacalReleasing(
        signOf(partOfFortune(asc, sunLon, moonLon, isDay)),
        natalUtc,
        at,
      ),
      spirit: zodiacalReleasing(
        signOf(partOfSpirit(asc, sunLon, moonLon, isDay)),
        natalUtc,
        at,
      ),
    };
  }
  return {
    computedAt: at.toISOString(),
    natal: {
      version: natalVersion,
      isSolarChart: natal.isSolarChart,
      moonUncertain: natal.uncertainties.some((u) => u.field === "moon_sign"),
    },
    progressions: computeProgressions(natal, at, options),
    tertiary: computeTertiaryProgressions(natal, at, options),
    solarArc: computeSolarArc(natal, at),
    solarReturn,
    lunarReturn: computeLunarReturn(natal, at, lrLocation),
    planetaryReturns: (["jupiter", "saturn"] as const).map((p) =>
      computePlanetaryReturn(natal, at, p),
    ),
    profection: natal.bigThree.ascendant
      ? annualProfection(natal.bigThree.ascendant, natalUtc, at)
      : null,
    firdaria,
    zodiacalReleasing: releasing,
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
  options?: TransitOptions,
  srLocation?: ReturnLocation,
  lrLocation?: ReturnLocation,
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
  return computeCycles(
    natal,
    snapshot.version,
    at ?? new Date(),
    options,
    srLocation,
    lrLocation,
  );
}
