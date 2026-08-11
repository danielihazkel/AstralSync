import { GeoLocation, HDate } from "@hebcal/core";
import type { DateAmbiguity, HebrewBirthDate, MazalInput } from "./types";
import { gregorianToRd, toParts, zmanimForRd } from "./calendar";

const NEAR_SUNSET_WINDOW_MS = 60 * 60_000;

/**
 * Sunset-aware Hebrew birth date. The Hebrew day H(D) spans
 * sunset(D−1) → sunset(D), so the civil daytime mapping already holds for
 * any birth before sunset (early-morning births need no flip);
 * `afterSunset` strictly means "born at or after sunset of the civil date →
 * next Hebrew day".
 *
 * Ambiguity codes, in precedence order:
 * - `unknown_time`: no comparison is possible; the daylight convention is
 *   assumed (mirrors the local-noon solar-chart convention), so
 *   effective == civil. Sunset is still reported when computable.
 * - `no_sunset_polar`: NOAA has no sunset for this date/location (hebcal
 *   returns an Invalid Date); graceful fallback to effective == civil.
 * - `approx_time_near_sunset`: approximate birth time within ±60 minutes of
 *   sunset — the flip decision is honored but flagged.
 */
export function hebrewBirthDate(input: MazalInput): HebrewBirthDate {
  const { civilDate, utc, latitude, longitude, tzId } = input;
  const timeCertainty = input.timeCertainty ?? "exact";

  const rd = gregorianToRd(civilDate.year, civilDate.month, civilDate.day);
  const civilHd = new HDate(rd);

  const gloc = new GeoLocation(null, latitude, longitude, 0, tzId);
  const sunset = zmanimForRd(gloc, rd).sunset();
  const sunsetValid = !Number.isNaN(sunset.getTime());
  const sunsetUtc = sunsetValid ? sunset.toISOString() : null;

  let afterSunset = false;
  let ambiguity: DateAmbiguity | null = null;
  if (timeCertainty === "unknown") {
    ambiguity = "unknown_time";
  } else if (!sunsetValid) {
    ambiguity = "no_sunset_polar";
  } else {
    afterSunset = utc.getTime() >= sunset.getTime();
    if (
      timeCertainty === "approx" &&
      Math.abs(utc.getTime() - sunset.getTime()) <= NEAR_SUNSET_WINDOW_MS
    ) {
      ambiguity = "approx_time_near_sunset";
    }
  }

  const effectiveHd = afterSunset ? new HDate(rd + 1) : civilHd;

  return {
    civil: toParts(civilHd),
    effective: toParts(effectiveHd),
    afterSunset,
    sunsetUtc,
    ambiguity,
  };
}
