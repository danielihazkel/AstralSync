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
  /** Great-circle distance from the place to the nearest point of the line. */
  km: number;
  /** "east" when that nearest point lies east of the place. */
  side: "east" | "west";
}

const EARTH_KM = 6371;
const RAD = Math.PI / 180;

/** Haversine distance between two points, km. */
function greatCircleKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const a =
    Math.sin(((lat2 - lat1) * RAD) / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(((lng2 - lng1) * RAD) / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The nearest point of a rising/setting line to a place: the line's exact
 *  longitude as a function of latitude, searched on a quarter-degree grid
 *  around the place and refined to a hundredth. Null when the line does
 *  not come within the search span (circumpolar there). */
function nearestOnHorizonLine(
  eq: { ra: number; dec: number },
  gst: number,
  angle: "asc" | "dsc",
  place: RelocationPlace,
): { km: number; lng: number } | null {
  let best: { km: number; lng: number; lat: number } | null = null;
  const probe = (lat: number) => {
    if (Math.abs(lat) >= 89.99) return;
    const lng = horizonLongitude(eq.ra, eq.dec, gst, lat, angle);
    if (lng === null) return;
    const km = greatCircleKm(place.lat, place.lng, lat, lng);
    if (best === null || km < best.km) best = { km, lng, lat };
  };
  for (let d = -12; d <= 12; d += 0.25) probe(place.lat + d);
  const coarse = best as { lat: number } | null;
  if (coarse === null) return null;
  for (let d = -0.25; d <= 0.25; d += 0.01) probe(coarse.lat + d);
  return best;
}

/**
 * The astrocartography lines within `maxKm` of a place, nearest first, by
 * great-circle distance to the nearest point of each line. A meridian (MC/
 * IC) is a great circle, so that is exact; a rising or setting line is
 * searched along its exact curve, so a place near the circumpolar limit —
 * where those lines bend nearly east–west — is not measured across the
 * bend.
 */
export function linesNear(
  lines: Pick<AcgLine, "planet" | "angle">[],
  equatorial: Partial<Record<Planet, { ra: number; dec: number }>>,
  gst: number,
  place: RelocationPlace,
  maxKm = LINE_BAND_KM,
): LineNear[] {
  const out: LineNear[] = [];
  for (const { planet, angle } of lines) {
    const eq = equatorial[planet];
    if (!eq) continue;
    let km: number;
    let lng: number;
    if (angle === "mc" || angle === "ic") {
      lng = mcLongitude(eq.ra, gst) + (angle === "ic" ? 180 : 0);
      const d = lngDelta(lng, place.lng) * RAD;
      // Distance to a meridian half: asin(cos φ · sin Δλ) while it faces
      // the place; past 90° of longitude the line is half a world away.
      if (Math.abs(d) > Math.PI / 2) continue;
      km = EARTH_KM * Math.asin(Math.abs(Math.cos(place.lat * RAD) * Math.sin(d)));
    } else {
      const nearest = nearestOnHorizonLine(eq, gst, angle, place);
      if (nearest === null) continue;
      ({ km, lng } = nearest);
    }
    if (km <= maxKm) {
      out.push({ planet, angle, km, side: lngDelta(lng, place.lng) >= 0 ? "east" : "west" });
    }
  }
  return out.sort((a, b) => a.km - b.km);
}
