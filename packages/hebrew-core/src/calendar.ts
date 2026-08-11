import { GeoLocation, HDate, Zmanim } from "@hebcal/core";
import type { CivilDate, HebrewDateParts } from "./types";
import { monthKeyFromMonthNumber } from "./mazalot";

/**
 * Gregorian y/m/d → Rata Die fixed day number (Reingold–Dershowitz).
 * Pure arithmetic — identical to hebcal's own `greg2abs`, so `new HDate(rd)`
 * is exact (guarded by a round-trip test). This is how the package honors
 * the "HDate always from explicit y/m/d, never a raw Date" rule: the birth
 * instant never reaches an HDate or Zmanim constructor.
 */
export function gregorianToRd(year: number, month: number, day: number): number {
  const y = year - 1;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return (
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) +
    Math.floor((367 * month - 362) / 12) +
    (month <= 2 ? 0 : leap ? -1 : -2) +
    day
  );
}

export function hdateFromCivil(d: CivilDate): HDate {
  return new HDate(gregorianToRd(d.year, d.month, d.day));
}

/** Zmanim for the civil day identified by an R.D. number (sea-level NOAA). */
export function zmanimForRd(gloc: GeoLocation, rd: number): Zmanim {
  return new Zmanim(gloc, new HDate(rd), false);
}

export function weekdayOf(rd: number): number {
  return new HDate(rd).getDay();
}

export function toParts(hd: HDate): HebrewDateParts {
  return {
    year: hd.getFullYear(),
    month: hd.getMonth(),
    day: hd.getDate(),
    monthKey: monthKeyFromMonthNumber(hd.getMonth()),
    monthName: hd.getMonthName(),
    weekday: hd.getDay(),
    renderGematriya: hd.renderGematriya(),
  };
}
