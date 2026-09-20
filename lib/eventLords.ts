import {
  annualProfection,
  currentFirdaria,
  isDayChart,
  partOfFortune,
  partOfSpirit,
  signOf,
  zodiacalReleasing,
  type Planet,
} from "@astralsync/astro-core";
import type { WheelChart } from "./view-types";

/**
 * The time-lord state at an arbitrary instant, computed from the natal chart
 * alone.
 *
 * Deliberately *not* computeCycles: that also searches for solar, lunar,
 * Jupiter and Saturn returns, which means ephemeris scanning per call. The
 * Life Story prompt needs this for every recorded event — up to a hundred —
 * so it uses only the cheap half: profections, firdaria and releasing are
 * calendar arithmetic over the natal chart, with no ephemeris search at all.
 *
 * Null throughout on a solar chart: every one of these techniques needs an
 * Ascendant.
 */

export interface EventLords {
  profection: { age: number; house: number; sign: string; lord: Planet };
  firdaria: { major: string; sub: string | null };
  releasing: {
    fortuneSign: string;
    fortuneLord: Planet;
    /** The conventional peak: a 10th-sign period from the lot. */
    fortunePeak: boolean;
    fortuneLoosedBond: boolean;
    spiritSign: string;
  } | null;
}

/**
 * The full period lists for the life-arc timeline: every releasing L1 period
 * and every firdaria major period from birth. Same cheap-primitives rule as
 * computeEventLords — no return searches.
 */
export function computeArcPeriods(
  natal: WheelChart,
  at: Date,
): {
  releasing: {
    sign: string;
    lord: Planet;
    startUtc: string;
    endUtc: string;
    peak: boolean;
    loosedBond: boolean;
  }[];
  firdaria: { lord: string; startUtc: string; endUtc: string }[];
} | null {
  const ascendant = natal.bigThree.ascendant;
  if (!ascendant || !natal.houses) return null;
  const natalUtc = new Date(natal.input.utc);
  const sunLon = natal.placements.find((p) => p.planet === "sun")?.longitude;
  const moonLon = natal.placements.find((p) => p.planet === "moon")?.longitude;
  if (sunLon === undefined || moonLon === undefined) return null;

  const isDay = isDayChart(sunLon, natal.houses.cusps);
  const firdaria = currentFirdaria(natalUtc, isDay, at);
  const fortune = zodiacalReleasing(
    signOf(partOfFortune(natal.houses.ascendant, sunLon, moonLon, isDay)),
    natalUtc,
    at,
  );

  return {
    releasing: fortune.l1.map((p) => ({
      sign: p.sign,
      lord: p.lord,
      startUtc: p.startUtc,
      endUtc: p.endUtc,
      peak: p.angular === "10th",
      loosedBond: p.loosedBond,
    })),
    firdaria: (firdaria?.cycle ?? []).map((p) => ({
      lord: p.lord,
      startUtc: p.startUtc,
      endUtc: p.endUtc,
    })),
  };
}

export function computeEventLords(
  natal: WheelChart,
  at: Date,
): EventLords | null {
  const ascendant = natal.bigThree.ascendant;
  if (!ascendant || !natal.houses) return null;

  const natalUtc = new Date(natal.input.utc);
  const profection = annualProfection(ascendant, natalUtc, at);

  const sunLon = natal.placements.find((p) => p.planet === "sun")?.longitude;
  const moonLon = natal.placements.find((p) => p.planet === "moon")?.longitude;
  if (sunLon === undefined || moonLon === undefined) return null;

  const isDay = isDayChart(sunLon, natal.houses.cusps);
  const firdaria = currentFirdaria(natalUtc, isDay, at);
  if (!firdaria) return null;

  const asc = natal.houses.ascendant;
  const fortune = zodiacalReleasing(
    signOf(partOfFortune(asc, sunLon, moonLon, isDay)),
    natalUtc,
    at,
  );
  const spirit = zodiacalReleasing(
    signOf(partOfSpirit(asc, sunLon, moonLon, isDay)),
    natalUtc,
    at,
  );

  return {
    profection: {
      age: profection.age,
      house: profection.profectedHouse,
      sign: profection.profectedSign,
      lord: profection.yearLord,
    },
    firdaria: {
      major: firdaria.major.lord,
      sub: firdaria.sub?.lord ?? null,
    },
    releasing:
      fortune.current && spirit.current
        ? {
            fortuneSign: fortune.current.l1.sign,
            fortuneLord: fortune.current.l1.lord,
            fortunePeak: fortune.current.l1.angular === "10th",
            fortuneLoosedBond: fortune.current.l1.loosedBond,
            spiritSign: spirit.current.l1.sign,
          }
        : null,
  };
}
