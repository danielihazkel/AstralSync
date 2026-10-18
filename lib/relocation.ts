import {
  buildChart,
  horizonLongitude,
  mcLongitude,
  separation,
  signOf,
  type AcgAngle,
  type AcgLine,
  type Planet,
  type Sign,
} from "@astralsync/astro-core";
import type { WheelChart } from "./view-types";

/**
 * Relocation: the natal instant cast for another place. The planets do not
 * move — the same sky — but the angles and houses do, so the question a
 * relocated chart answers is "which parts of my chart come to the fore
 * there?". The astrocartography lines are the same idea drawn for every
 * place at once. Pure and client-safe; the relocation page computes in the
 * browser.
 */

export interface RelocationPlace {
  label: string;
  lat: number;
  lng: number;
}

/** A planet within this many degrees of an angle counts as angular. */
export const ANGULAR_ORB = 5;

/** How far from a line still counts as "under" it, east–west kilometres —
 *  the conventional ~700 km band of an astrocartography line's influence. */
export const LINE_BAND_KM = 700;

export interface Relocated {
  chart: WheelChart;
  ascendant: { natal: Sign; here: Sign };
  mc: { natal: Sign; here: Sign };
  /** Planets whose house differs from the natal one. */
  houseChanges: Array<{ planet: Planet; natal: number; here: number }>;
  /** Planets within ANGULAR_ORB of an angle here, tightest first. */
  angular: Array<{ planet: Planet; angle: AcgAngle; orb: number }>;
}

/** Null when the natal chart has no houses (unknown birth time): the
 *  angles are exactly what relocation changes, and they are unknown. */
export function relocateChart(natal: WheelChart, place: RelocationPlace): Relocated | null {
  if (natal.houses === null || natal.isSolarChart) return null;
  const snapshot = buildChart({
    utc: new Date(natal.input.utc),
    latitude: place.lat,
    longitude: place.lng,
    houseSystem: natal.input.houseSystem,
    timeCertainty: natal.input.timeCertainty,
  });
  const chart: WheelChart = { ...snapshot, tzWarnings: [] };
  const houses = chart.houses!;
  const houseChanges: Relocated["houseChanges"] = [];
  for (const p of chart.placements) {
    const before = natal.placements.find((n) => n.planet === p.planet)?.house ?? null;
    if (before !== null && p.house !== null && before !== p.house) {
      houseChanges.push({ planet: p.planet, natal: before, here: p.house });
    }
  }
  const angles: Array<[AcgAngle, number]> = [
    ["asc", houses.ascendant],
    ["mc", houses.mc],
    ["dsc", (houses.ascendant + 180) % 360],
    ["ic", (houses.mc + 180) % 360],
  ];
  const angular: Relocated["angular"] = [];
  for (const p of chart.placements) {
    for (const [angle, lon] of angles) {
      const orb = separation(p.longitude, lon);
      if (orb <= ANGULAR_ORB) angular.push({ planet: p.planet, angle, orb });
    }
  }
  angular.sort((a, b) => a.orb - b.orb);
  return {
    chart,
    ascendant: { natal: signOf(natal.houses.ascendant), here: signOf(houses.ascendant) },
    mc: { natal: signOf(natal.houses.mc), here: signOf(houses.mc) },
    houseChanges,
    angular,
  };
}

/** Signed difference a − b in degrees, folded into (−180, 180]. */
function lngDelta(a: number, b: number): number {
  const d = (((a - b) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

export interface LineNear {
  planet: Planet;
  angle: AcgAngle;
  /** East–west distance from the place to the line along its latitude. */
  km: number;
  /** "east" when the line lies east of the place. */
  side: "east" | "west";
}

/**
 * The astrocartography lines within `maxKm` of a place, nearest first,
 * measured east–west along the place's latitude (the lines run roughly
 * north–south, so that is close to the true distance, and it is how
 * astrocartographers read a map). Uses the exact line position at the
 * place's latitude, not the sampled polyline.
 */
export function linesNear(
  lines: Pick<AcgLine, "planet" | "angle">[],
  equatorial: Partial<Record<Planet, { ra: number; dec: number }>>,
  gst: number,
  place: RelocationPlace,
  maxKm = LINE_BAND_KM,
): LineNear[] {
  const kmPerDegree = 111.32 * Math.cos((place.lat * Math.PI) / 180);
  const out: LineNear[] = [];
  for (const { planet, angle } of lines) {
    const eq = equatorial[planet];
    if (!eq) continue;
    const lng =
      angle === "mc"
        ? mcLongitude(eq.ra, gst)
        : angle === "ic"
          ? mcLongitude(eq.ra, gst) + 180
          : horizonLongitude(eq.ra, eq.dec, gst, place.lat, angle);
    if (lng === null) continue;
    const d = lngDelta(lng, place.lng);
    const km = Math.abs(d) * kmPerDegree;
    if (km <= maxKm) out.push({ planet, angle, km, side: d >= 0 ? "east" : "west" });
  }
  return out.sort((a, b) => a.km - b.km);
}
