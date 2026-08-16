import type { Planet, Sign } from "./types";
import { SIGNS } from "./types";
import { separation } from "./angles";
import { TRADITIONAL_RULERS } from "./profections";

/**
 * Essential dignities and solar conditions — the classical seven-planet
 * tables (the same pre-outer-planet doctrine as TRADITIONAL_RULERS; the
 * moderns get null throughout). Deliberately basic: domicile, exaltation and
 * their opposites only — triplicity, terms and faces are contested-table
 * territory and stay out until something needs them.
 */

/** Classical exaltations (degree-specific traditions reduced to signs). */
export const EXALTATIONS: Partial<Record<Planet, Sign>> = {
  sun: "aries",
  moon: "taurus",
  mercury: "virgo",
  venus: "pisces",
  mars: "capricorn",
  jupiter: "cancer",
  saturn: "libra",
};

export type EssentialDignity =
  | "domicile"
  | "exaltation"
  | "detriment"
  | "fall";

function oppositeSign(sign: Sign): Sign {
  return SIGNS[(SIGNS.indexOf(sign) + 6) % 12];
}

/**
 * The planet's essential dignity in a sign, or null when neutral (or when
 * the planet is a modern with no classical dignities). Domicile outranks
 * exaltation where both hold — Mercury in Virgo is at home first, exalted
 * second — and detriment likewise outranks fall.
 */
export function essentialDignity(
  planet: Planet,
  sign: Sign,
): EssentialDignity | null {
  if (TRADITIONAL_RULERS[sign] === planet) return "domicile";
  if (TRADITIONAL_RULERS[oppositeSign(sign)] === planet) return "detriment";
  if (EXALTATIONS[planet] === sign) return "exaltation";
  const exaltation = EXALTATIONS[planet];
  if (exaltation && oppositeSign(exaltation) === sign) return "fall";
  return null;
}

export type SolarCondition = "cazimi" | "combust" | "under_beams";

/** Classical thresholds on ecliptic separation from the Sun. */
const CAZIMI_DEG = 17 / 60;
const COMBUST_DEG = 8.5;
const UNDER_BEAMS_DEG = 17;

/**
 * The planet's condition relative to the Sun by ecliptic separation:
 * cazimi ("in the heart", < 17′) protects, combustion (< 8.5°) burns,
 * under the beams (< 17°) obscures; null beyond that. Meaningless for the
 * Sun itself — callers gate.
 */
export function solarCondition(
  planetLon: number,
  sunLon: number,
): SolarCondition | null {
  const sep = separation(planetLon, sunLon);
  if (sep < CAZIMI_DEG) return "cazimi";
  if (sep < COMBUST_DEG) return "combust";
  if (sep < UNDER_BEAMS_DEG) return "under_beams";
  return null;
}
