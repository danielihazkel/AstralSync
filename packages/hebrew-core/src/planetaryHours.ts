import { GeoLocation } from "@hebcal/core";
import type {
  CivilDate,
  ClassicalPlanet,
  MazalInput,
  PlanetaryHourResult,
} from "./types";
import { gregorianToRd, weekdayOf, zmanimForRd } from "./calendar";

/** Descending Chaldean order: slowest to fastest sphere. */
export const CHALDEAN_ORDER: readonly ClassicalPlanet[] = [
  "saturn",
  "jupiter",
  "mars",
  "sun",
  "venus",
  "mercury",
  "moon",
] as const;

/** Index of the Sun in CHALDEAN_ORDER — the cycle's anchor. */
const SUN_INDEX = 3;

function invalid(d: Date): boolean {
  return Number.isNaN(d.getTime());
}

/**
 * Planetary hour of birth: the day (sunrise→sunset) and night (sunset→next
 * sunrise) are each split into twelve unequal hours, and planets follow one
 * continuous descending Chaldean cycle across all 24 hours of every day,
 * anchored at Sunday's first daylight hour = Sun. Planetary days run
 * sunrise to sunrise, so a birth between midnight and sunrise belongs to the
 * previous civil day's night.
 *
 * Returns null for unknown birth time (no instant to place) and when the
 * location/date has no sunrise or sunset (polar).
 */
export function planetaryHour(input: MazalInput): PlanetaryHourResult | null {
  const { civilDate, utc, latitude, longitude, tzId } = input;
  const timeCertainty = input.timeCertainty ?? "exact";
  if (timeCertainty === "unknown") return null;

  const rd = gregorianToRd(civilDate.year, civilDate.month, civilDate.day);
  const gloc = new GeoLocation(null, latitude, longitude, 0, tzId);
  const z = zmanimForRd(gloc, rd);
  const sunrise = z.sunrise();
  const sunset = z.sunset();
  if (invalid(sunrise) || invalid(sunset)) return null;

  let start: Date;
  let end: Date;
  let dayRd: number;
  let isDay: boolean;
  if (utc.getTime() < sunrise.getTime()) {
    // Night of the previous planetary day: previous sunset → this sunrise.
    start = z.gregEve();
    end = sunrise;
    dayRd = rd - 1;
    isDay = false;
  } else if (utc.getTime() < sunset.getTime()) {
    start = sunrise;
    end = sunset;
    dayRd = rd;
    isDay = true;
  } else {
    start = sunset;
    end = zmanimForRd(gloc, rd + 1).sunrise();
    dayRd = rd;
    isDay = false;
  }
  if (invalid(start) || invalid(end)) return null;

  const hourLen = (end.getTime() - start.getTime()) / 12;
  const idx = Math.min(
    11,
    Math.floor((utc.getTime() - start.getTime()) / hourLen),
  );
  const dayIdx = weekdayOf(dayRd);
  const h = isDay ? idx : 12 + idx;

  return {
    planet: CHALDEAN_ORDER[(SUN_INDEX + dayIdx * 24 + h) % 7],
    hourIndex: idx + 1,
    isDay,
    dayRuler: CHALDEAN_ORDER[(SUN_INDEX + dayIdx * 24) % 7],
    startUtc: new Date(start.getTime() + idx * hourLen).toISOString(),
    endUtc: new Date(start.getTime() + (idx + 1) * hourLen).toISOString(),
    uncertain: timeCertainty === "approx",
  };
}

export interface PlanetaryHourSpan {
  planet: ClassicalPlanet;
  /** 1–12 within its half of the day. */
  hourIndex: number;
  isDay: boolean;
  startUtc: string;
  endUtc: string;
}

export interface PlanetaryDayHours {
  /** Ruler of the planetary day that begins at this civil date's sunrise. */
  dayRuler: ClassicalPlanet;
  /** All 24 hours in time order: sunrise → sunset → next sunrise. */
  hours: PlanetaryHourSpan[];
}

export interface PlanetaryDayInput {
  civilDate: CivilDate;
  latitude: number;
  longitude: number;
  tzId: string;
}

/**
 * The full planetary day starting at `civilDate`'s sunrise: twelve unequal
 * daylight hours and twelve night hours, same continuous Chaldean cycle as
 * `planetaryHour` (which places a single instant). The electional picker
 * needs the whole day at once.
 *
 * Returns null when the location/date has no sunrise or sunset (polar).
 */
export function planetaryDayHours(
  input: PlanetaryDayInput,
): PlanetaryDayHours | null {
  const { civilDate, latitude, longitude, tzId } = input;
  const rd = gregorianToRd(civilDate.year, civilDate.month, civilDate.day);
  const gloc = new GeoLocation(null, latitude, longitude, 0, tzId);
  const z = zmanimForRd(gloc, rd);
  const sunrise = z.sunrise();
  const sunset = z.sunset();
  const nextSunrise = zmanimForRd(gloc, rd + 1).sunrise();
  if (invalid(sunrise) || invalid(sunset) || invalid(nextSunrise)) return null;

  const dayIdx = weekdayOf(rd);
  const first = (SUN_INDEX + dayIdx * 24) % 7;

  const hours: PlanetaryHourSpan[] = [];
  const halves: Array<{ start: Date; end: Date; isDay: boolean }> = [
    { start: sunrise, end: sunset, isDay: true },
    { start: sunset, end: nextSunrise, isDay: false },
  ];
  for (const half of halves) {
    const hourLen = (half.end.getTime() - half.start.getTime()) / 12;
    for (let i = 0; i < 12; i++) {
      const h = half.isDay ? i : 12 + i;
      hours.push({
        planet: CHALDEAN_ORDER[(first + h) % 7],
        hourIndex: i + 1,
        isDay: half.isDay,
        startUtc: new Date(half.start.getTime() + i * hourLen).toISOString(),
        endUtc: new Date(half.start.getTime() + (i + 1) * hourLen).toISOString(),
      });
    }
  }

  return { dayRuler: CHALDEAN_ORDER[first], hours };
}
