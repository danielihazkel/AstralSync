import {
  DEFAULT_TRANSIT_ORBS,
  detectCrossAspects,
  positionsAt,
  upcomingEclipses,
  type CrossAspect,
  type EclipseEvent,
  type OrbConfig,
  type Placement,
  type Planet,
  type Sign,
} from "@astralsync/astro-core";
import {
  MONTH_MAZAL,
  civilToHebrewDateParts,
  planetaryHour,
  type HebrewDateParts,
  type MazalEntry,
  type PlanetaryHourResult,
} from "@astralsync/hebrew-core";
import * as Astronomy from "astronomy-engine";

/**
 * The home page's "Today" dashboard — computed entirely in the browser from
 * the bundled engines so it works offline and stays live across midnight.
 * Pure and Prisma-free: the server only supplies the saved profiles' natal
 * placements. Loaded via dynamic import so only the home page pays for the
 * ephemeris bundle.
 */

export interface HomeLocation {
  label: string;
  lat: number;
  lng: number;
  tzIana: string;
}

export interface TodayProfile {
  id: number;
  displayName: string;
  placements: Placement[];
}

export interface ProfileTransits {
  profileId: number;
  displayName: string;
  /** Tightest transiting contacts to this natal chart (top 3 by orb). */
  aspects: CrossAspect[];
}

export interface MoonVoidOfCourse {
  /** Ingress instant ending the void period. */
  until: string;
  nextSign: Sign;
}

export interface StationAlert {
  planet: Planet;
  kind: "retrograde" | "direct";
  /** Approximate instant (daily sampling): midpoint of the flip's bracket. */
  aroundUtc: string;
}

export interface TodaySky {
  computedAt: string;
  moon: {
    sign: Sign;
    /** Phase name, e.g. "Waxing Gibbous". */
    phaseName: string;
    /** Illuminated fraction, 0–1. */
    illumination: number;
    nextQuarter: { name: string; atUtc: string };
    /** Non-null while the Moon is void of course (no further exact major
     *  aspect before it leaves its sign). */
    voidOfCourse: MoonVoidOfCourse | null;
  };
  /** Planets flipping direction within the next week. */
  stations: StationAlert[];
  /** Eclipses peaking within the next ~5 weeks — enough lead time to catch a
   *  whole eclipse season, unlike the 7-day station horizon. */
  eclipses: EclipseEvent[];
  hebrew: {
    parts: HebrewDateParts;
    mazal: MazalEntry;
    /** True when no location is known: after sunset the next Hebrew day has
     *  already begun, and without a sunset we can't tell. */
    approximate: boolean;
  };
  /** Null without a home location (or during polar day/night). */
  hour: PlanetaryHourResult | null;
  transits: ProfileTransits[];
}

const QUARTER_NAMES = ["New Moon", "First Quarter", "Full Moon", "Third Quarter"];

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Signed wrap of `lon − target` into (−180, 180]. */
function signedDelta(lon: number, target: number): number {
  return ((((lon - target) % 360) + 540) % 360) - 180;
}

function moonLonAt(t: Date): number {
  return positionsAt(t).find((p) => p.planet === "moon")!.longitude;
}

/** Modern VoC practice: aspects to Sun through Pluto, Moon excluded. */
const VOC_PLANETS: Planet[] = [
  "sun",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];
/** Signed Moon−planet separations that mark an exact major aspect; the
 *  opposition (±180) is caught separately as a wrap jump. */
const VOC_CROSSINGS = [-120, -90, -60, 0, 60, 90, 120];

/**
 * Void-of-course check: from `now` to the Moon's next sign ingress, does it
 * perfect no further major aspect? Hourly samples of the signed Moon−planet
 * separation catch every crossing (the Moon gains at most ~0.6°/hour on any
 * aspect target, so crossings can't hide between samples). Deliberately
 * reports only "void until <ingress>" — when the void *began* needs a
 * backward search and adds nothing actionable.
 */
export function computeVoidOfCourse(now: Date): MoonVoidOfCourse | null {
  const moonLon = moonLonAt(now);
  // Next 30°-multiple ahead of the Moon; reached in under 3 days.
  const target = ((Math.floor(moonLon / 30) + 1) * 30) % 360;
  const found = Astronomy.Search(
    (t) => signedDelta(moonLonAt(t.date), target),
    Astronomy.MakeTime(now),
    Astronomy.MakeTime(new Date(now.getTime() + 3 * DAY_MS)),
  );
  if (!found) return null;
  const ingress = found.date;

  const deltasAt = (t: Date): Record<string, number> => {
    const sky = positionsAt(t);
    const moon = sky.find((p) => p.planet === "moon")!.longitude;
    const out: Record<string, number> = {};
    for (const planet of VOC_PLANETS) {
      const lon = sky.find((p) => p.planet === planet)!.longitude;
      out[planet] = signedDelta(moon, lon);
    }
    return out;
  };

  let prev = deltasAt(now);
  for (let ms = now.getTime() + HOUR_MS; ; ms += HOUR_MS) {
    const clamped = Math.min(ms, ingress.getTime());
    const cur = deltasAt(new Date(clamped));
    for (const planet of VOC_PLANETS) {
      const d0 = prev[planet];
      const d1 = cur[planet];
      // A jump across the ±180 wrap is an exact opposition.
      if (Math.abs(d1 - d0) > 180) return null;
      for (const v of VOC_CROSSINGS) {
        if ((d0 - v) * (d1 - v) < 0 || d1 === v) return null;
      }
    }
    prev = cur;
    if (clamped >= ingress.getTime()) break;
  }

  const nextSign = positionsAt(new Date(ingress.getTime() + 60_000)).find(
    (p) => p.planet === "moon",
  )!.sign;
  return { until: ingress.toISOString(), nextSign };
}

/**
 * Direction flips within the horizon: daily samples of each planet's
 * retrograde flag; a flip reports the bracket midpoint, matching the
 * forecast module's ±1-day sampling stance.
 */
export function computeStations(now: Date, horizonDays = 7): StationAlert[] {
  const stations: StationAlert[] = [];
  let prev = positionsAt(now);
  for (let i = 1; i <= horizonDays; i++) {
    const t = new Date(now.getTime() + i * DAY_MS);
    const cur = positionsAt(t);
    for (const p of cur) {
      if (p.planet === "sun" || p.planet === "moon") continue;
      const was = prev.find((q) => q.planet === p.planet)!.retrograde;
      if (was !== p.retrograde) {
        stations.push({
          planet: p.planet,
          kind: p.retrograde ? "retrograde" : "direct",
          aroundUtc: new Date(t.getTime() - DAY_MS / 2).toISOString(),
        });
      }
    }
    prev = cur;
  }
  return stations;
}

/** Phase-angle → common name; cardinal points get a ±11.25° band. */
export function moonPhaseName(phaseDeg: number): string {
  const p = ((phaseDeg % 360) + 360) % 360;
  const band = 11.25;
  if (p < band || p >= 360 - band) return "New Moon";
  if (Math.abs(p - 90) < band) return "First Quarter";
  if (Math.abs(p - 180) < band) return "Full Moon";
  if (Math.abs(p - 270) < band) return "Third Quarter";
  if (p < 90) return "Waxing Crescent";
  if (p < 180) return "Waxing Gibbous";
  if (p < 270) return "Waning Gibbous";
  return "Waning Crescent";
}

/** Civil Y/M/D of `now` in the given zone (machine-local when zone is null). */
function civilDateIn(now: Date, tzIana: string | null) {
  if (!tzIana) {
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
    };
  }
  // en-CA renders as YYYY-MM-DD, locale-independent enough to parse.
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: tzIana,
  })
    .format(now)
    .split("-")
    .map(Number);
  return { year, month, day };
}

/** True when `now` is after today's sunset at the location (Hebrew day has
 *  begun); null when the sun doesn't set (polar). */
function afterSunset(now: Date, location: HomeLocation): boolean | null {
  const observer = new Astronomy.Observer(location.lat, location.lng, 0);
  // Search back a full day, stepping past each found event (the search is
  // inclusive of its start), until the first sunset after `now` — the one
  // before it is the most recent sunset.
  let cursor = new Date(now.getTime() - 86_400_000);
  let last: Date | null = null;
  for (let i = 0; i < 4; i++) {
    const found = Astronomy.SearchRiseSet(
      Astronomy.Body.Sun,
      observer,
      -1,
      cursor,
      2,
    );
    if (!found) return last === null ? null : false;
    if (found.date.getTime() > now.getTime()) break;
    last = found.date;
    cursor = new Date(found.date.getTime() + 60_000);
  }
  if (last === null) return false; // daytime — today's sunset hasn't happened
  // The Hebrew day that began at `last` runs until the next sunset — so
  // "after sunset" means the most recent sunset fell on today's civil date.
  const sunsetCivil = civilDateIn(last, location.tzIana);
  const nowCivil = civilDateIn(now, location.tzIana);
  return (
    sunsetCivil.year === nowCivil.year &&
    sunsetCivil.month === nowCivil.month &&
    sunsetCivil.day === nowCivil.day
  );
}

/** Advance a civil date by one day (via Date arithmetic, DST-safe in UTC). */
function nextDay(civil: { year: number; month: number; day: number }) {
  const d = new Date(Date.UTC(civil.year, civil.month - 1, civil.day + 1));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

export function computeToday(
  now: Date,
  location: HomeLocation | null,
  profiles: TodayProfile[],
  // Per-browser orb settings; majors only regardless — minor aspects on the
  // home strip would be noise.
  orbs: OrbConfig = DEFAULT_TRANSIT_ORBS,
): TodaySky {
  const sky = positionsAt(now);
  const moonPlacement = sky.find((p) => p.planet === "moon")!;
  const phaseDeg = Astronomy.MoonPhase(now);
  const illum = Astronomy.Illumination(Astronomy.Body.Moon, now);
  const quarter = Astronomy.SearchMoonQuarter(now);

  // Hebrew date: with a location, roll to the next Hebrew day after sunset;
  // without one, show the civil daytime mapping and flag it approximate.
  const civilToday = civilDateIn(now, location?.tzIana ?? null);
  let hebrewCivil = civilToday;
  let approximate = true;
  if (location) {
    const after = afterSunset(now, location);
    if (after !== null) {
      if (after) hebrewCivil = nextDay(civilToday);
      approximate = false;
    }
  }
  const parts = civilToHebrewDateParts(hebrewCivil);
  const mazal = MONTH_MAZAL[parts.monthKey];

  // The planetary-hour engine takes the ACTUAL civil date — it handles the
  // sunset/sunrise boundaries itself.
  const hour = location
    ? planetaryHour({
        civilDate: civilToday,
        utc: now,
        latitude: location.lat,
        longitude: location.lng,
        tzId: location.tzIana,
        timeCertainty: "exact",
      })
    : null;

  const transits: ProfileTransits[] = profiles
    .map((p) => ({
      profileId: p.id,
      displayName: p.displayName,
      aspects: detectCrossAspects(sky, p.placements, orbs)
        .sort((a, b) => a.orb - b.orb)
        .slice(0, 3),
    }))
    .filter((t) => t.aspects.length > 0)
    .sort((a, b) => (a.aspects[0]?.orb ?? 99) - (b.aspects[0]?.orb ?? 99));

  return {
    computedAt: now.toISOString(),
    moon: {
      sign: moonPlacement.sign,
      phaseName: moonPhaseName(phaseDeg),
      illumination: illum.phase_fraction,
      nextQuarter: {
        name: QUARTER_NAMES[quarter.quarter],
        atUtc: quarter.time.date.toISOString(),
      },
      voidOfCourse: computeVoidOfCourse(now),
    },
    stations: computeStations(now),
    eclipses: upcomingEclipses(now, 35),
    hebrew: { parts, mazal, approximate },
    hour,
    transits,
  };
}
