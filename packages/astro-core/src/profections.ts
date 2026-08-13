import type { Planet, Sign } from "./types";
import { SIGNS } from "./types";

/**
 * Annual profections — the whole-sign time-lord technique: each birthday the
 * profected house advances one place from the Ascendant, and the traditional
 * ruler of the profected sign becomes lord of the year.
 */

/** Traditional (pre-outer-planet) rulerships. */
export const TRADITIONAL_RULERS: Record<Sign, Planet> = {
  aries: "mars",
  taurus: "venus",
  gemini: "mercury",
  cancer: "moon",
  leo: "sun",
  virgo: "mercury",
  libra: "venus",
  scorpio: "mars",
  sagittarius: "jupiter",
  capricorn: "saturn",
  aquarius: "saturn",
  pisces: "jupiter",
};

export interface AnnualProfection {
  /** Completed years of age at `at` (birthday-anniversary arithmetic, UTC). */
  age: number;
  /** 1–12: (age mod 12) + 1, counted from the Ascendant. */
  profectedHouse: number;
  /** The Ascendant sign advanced (age mod 12) whole signs. */
  profectedSign: Sign;
  yearLord: Planet;
  /** Birthday anniversaries bracketing `at`. */
  yearStartUtc: string;
  yearEndUtc: string;
}

export function annualProfection(
  ascendantSign: Sign,
  birthUtc: Date,
  at: Date,
): AnnualProfection {
  const anniversary = (year: number) =>
    new Date(
      Date.UTC(
        year,
        birthUtc.getUTCMonth(),
        birthUtc.getUTCDate(),
        birthUtc.getUTCHours(),
        birthUtc.getUTCMinutes(),
        birthUtc.getUTCSeconds(),
      ),
    );
  let age = at.getUTCFullYear() - birthUtc.getUTCFullYear();
  if (anniversary(birthUtc.getUTCFullYear() + age).getTime() > at.getTime()) {
    age -= 1;
  }
  const offset = ((age % 12) + 12) % 12;
  const profectedSign =
    SIGNS[(SIGNS.indexOf(ascendantSign) + offset) % SIGNS.length];
  return {
    age,
    profectedHouse: offset + 1,
    profectedSign,
    yearLord: TRADITIONAL_RULERS[profectedSign],
    yearStartUtc: anniversary(birthUtc.getUTCFullYear() + age).toISOString(),
    yearEndUtc: anniversary(birthUtc.getUTCFullYear() + age + 1).toISOString(),
  };
}
