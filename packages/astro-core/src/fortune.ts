import { norm360 } from "./angles";
import { signOf } from "./chart";
import { houseOf } from "./houses";
import type { PointPlacement } from "./points";

/**
 * Part of Fortune — the classical lot. Ephemeral like the nodes and Lilith:
 * computed from the stored snapshot on every read, never persisted, and
 * meaningless on a solar chart (no Ascendant).
 */

/** Sect: the Sun above the horizon (houses 7–12) makes a day chart. */
export function isDayChart(sunLongitude: number, cusps: number[]): boolean {
  const house = houseOf(sunLongitude, cusps);
  return house >= 7 && house <= 12;
}

/** Day formula Asc + Moon − Sun; night reverses the luminaries. */
export function partOfFortune(
  ascendant: number,
  sunLongitude: number,
  moonLongitude: number,
  isDay: boolean,
): number {
  return norm360(
    isDay
      ? ascendant + moonLongitude - sunLongitude
      : ascendant + sunLongitude - moonLongitude,
  );
}

/** The Part of Fortune as a chart point (`house` null — overlay against the
 *  chart's cusps with `overlayHouses`, like the other points). */
export function partOfFortunePlacement(
  ascendant: number,
  sunLongitude: number,
  moonLongitude: number,
  cusps: number[],
): PointPlacement {
  const longitude = partOfFortune(
    ascendant,
    sunLongitude,
    moonLongitude,
    isDayChart(sunLongitude, cusps),
  );
  return {
    point: "part_of_fortune",
    longitude,
    sign: signOf(longitude),
    degreeInSign: norm360(longitude) % 30,
    house: null,
    retrograde: false,
  };
}

/** The Part of Spirit — Fortune's day/night mirror (Asc + Sun − Moon by day):
 *  what one wills where Fortune is what befalls one. Reflects Fortune across
 *  the Asc–Desc axis by construction. */
export function partOfSpirit(
  ascendant: number,
  sunLongitude: number,
  moonLongitude: number,
  isDay: boolean,
): number {
  return partOfFortune(ascendant, sunLongitude, moonLongitude, !isDay);
}

/** The Part of Spirit as a chart point, mirroring partOfFortunePlacement. */
export function partOfSpiritPlacement(
  ascendant: number,
  sunLongitude: number,
  moonLongitude: number,
  cusps: number[],
): PointPlacement {
  const longitude = partOfSpirit(
    ascendant,
    sunLongitude,
    moonLongitude,
    isDayChart(sunLongitude, cusps),
  );
  return {
    point: "part_of_spirit",
    longitude,
    sign: signOf(longitude),
    degreeInSign: norm360(longitude) % 30,
    house: null,
    retrograde: false,
  };
}
