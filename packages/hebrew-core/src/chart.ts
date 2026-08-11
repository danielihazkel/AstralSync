import { HDate, version as hebcalVersion } from "@hebcal/core";
import type { MazalChart, MazalInput, Uncertainty } from "./types";
import { gregorianToRd } from "./calendar";
import { hebrewBirthDate } from "./hebrewDate";
import { MONTH_MAZAL, monthKeyFromMonthNumber } from "./mazalot";
import { SEFER_YETZIRAH } from "./seferYetzirah";
import { dayPlanet } from "./dayPlanet";
import { planetaryHour } from "./planetaryHours";

const AMBIGUITY_REASONS = {
  unknown_time:
    "Birth time unknown: the Hebrew date assumes a daytime birth (the same convention as the solar chart's local noon).",
  approx_time_near_sunset:
    "Birth time is approximate and within an hour of sunset: the Hebrew date may be off by one day.",
  no_sunset_polar:
    "No sunset occurs at this location on this date: the Hebrew date falls back to the civil daytime mapping.",
} as const;

/**
 * Composes the full Mazal chart (same shape philosophy as astro-core's
 * ChartSnapshot: schemaVersion, input echo, uncertainties, engine metadata).
 */
export function buildMazalChart(input: MazalInput): MazalChart {
  const timeCertainty = input.timeCertainty ?? "exact";
  const hebrewDate = hebrewBirthDate(input);
  const monthKey = hebrewDate.effective.monthKey;
  const day = dayPlanet(hebrewDate.effective.weekday, hebrewDate.ambiguity);
  const hour = planetaryHour(input);

  const uncertainties: Uncertainty[] = [];
  if (hebrewDate.ambiguity !== null) {
    uncertainties.push(
      { field: "hebrew_date", reason: AMBIGUITY_REASONS[hebrewDate.ambiguity] },
      {
        field: "day_planet",
        reason:
          "The Hebrew date is uncertain, and shifting it by a day changes the weekday and its ruling planet.",
      },
    );
    const { civilDate } = input;
    const rd = gregorianToRd(civilDate.year, civilDate.month, civilDate.day);
    const nextKey = monthKeyFromMonthNumber(new HDate(rd + 1).getMonth());
    if (nextKey !== hebrewDate.civil.monthKey) {
      uncertainties.push({
        field: "mazal",
        reason:
          "The birth falls on a Hebrew month boundary, so the uncertain date could shift the month mazal.",
      });
    }
  }
  if (timeCertainty === "unknown") {
    uncertainties.push({
      field: "planetary_hour",
      reason: "Birth time unknown: the planetary hour cannot be computed.",
    });
  } else if (hour === null) {
    uncertainties.push({
      field: "planetary_hour",
      reason:
        "No sunrise or sunset occurs at this location on this date, so the planetary hours are undefined.",
    });
  } else if (timeCertainty === "approx") {
    uncertainties.push({
      field: "planetary_hour",
      reason:
        "Birth time is approximate: the unequal hour boundaries shift with the exact time.",
    });
  }

  return {
    schemaVersion: 1,
    input: {
      civilDate: input.civilDate,
      utc: input.utc.toISOString(),
      latitude: input.latitude,
      longitude: input.longitude,
      tzId: input.tzId,
      timeCertainty,
    },
    hebrewDate,
    mazal: MONTH_MAZAL[monthKey],
    seferYetzirah: SEFER_YETZIRAH[monthKey],
    dayPlanet: day,
    planetaryHour: hour,
    uncertainties,
    engine: { name: "@hebcal/core", version: hebcalVersion },
  };
}
