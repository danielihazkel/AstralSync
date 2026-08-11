import type { ClassicalPlanet, DateAmbiguity, DayPlanetResult } from "./types";

/** Ruling planet per weekday, Sunday=Sun … Saturday=Saturn (Shabbat 156a). */
export const DAY_PLANETS: readonly ClassicalPlanet[] = [
  "sun",
  "moon",
  "mars",
  "mercury",
  "jupiter",
  "venus",
  "saturn",
] as const;

/**
 * Ruling planet of the sunset-adjusted effective weekday. Any date ambiguity
 * makes the planet ambiguous: shifting the effective date by one day always
 * changes the weekday.
 */
export function dayPlanet(
  effectiveWeekday: number,
  ambiguity: DateAmbiguity | null,
): DayPlanetResult {
  const planet = DAY_PLANETS[effectiveWeekday];
  if (!planet) throw new RangeError(`Invalid weekday: ${effectiveWeekday}`);
  return { weekday: effectiveWeekday, planet, ambiguous: ambiguity !== null };
}
