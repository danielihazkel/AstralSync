import { GeoLocation } from "@hebcal/core";
import type { ClassicalPlanet, MazalInput, PlanetaryHourResult } from "./types";
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
