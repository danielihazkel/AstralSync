import {
  DEFAULT_TRANSIT_ORBS,
  detectCrossAspects,
  positionsAt,
  type CrossAspect,
  type Placement,
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

export interface TodaySky {
  computedAt: string;
  moon: {
    sign: Sign;
    /** Phase name, e.g. "Waxing Gibbous". */
    phaseName: string;
    /** Illuminated fraction, 0–1. */
    illumination: number;
    nextQuarter: { name: string; atUtc: string };
  };
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
      aspects: detectCrossAspects(sky, p.placements, DEFAULT_TRANSIT_ORBS)
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
    },
    hebrew: { parts, mazal, approximate },
    hour,
    transits,
  };
}
