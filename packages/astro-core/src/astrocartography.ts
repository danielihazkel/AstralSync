import { DEG } from "./angles";
import { astronomyEngineProvider } from "./ephemeris/astronomyEngine";
import type { EphemerisProvider } from "./ephemeris/interface";
import { PLANETS, type Planet } from "./types";

/**
 * Astrocartography: for one instant, the places on Earth where each planet
 * was on an angle — culminating (MC), anti-culminating (IC), rising (ASC)
 * or setting (DSC). Lines are drawn "in mundo" from the planet's true right
 * ascension and declination, the convention of Jim Lewis's maps: a planet
 * with ecliptic latitude rises when it crosses the horizon, which can be
 * a little off the ecliptic degree that rises with it.
 *
 * - MC: where local sidereal time equals the planet's RA — a meridian,
 *   longitude α − θ (θ the Greenwich sidereal time); the IC is opposite.
 * - ASC/DSC: at latitude φ the planet sits on the horizon at hour angle
 *   ∓H₀, cos H₀ = −tan φ · tan δ, so λ = α − θ ∓ H₀. Past the latitude
 *   where |tan φ · tan δ| > 1 the planet never rises or sets (circumpolar),
 *   and the rising and setting lines meet the MC/IC meridians there.
 */

export type AcgAngle = "mc" | "ic" | "asc" | "dsc";

export interface AcgLine {
  planet: Planet;
  angle: AcgAngle;
  /** Polyline segments of [longitude, latitude] in degrees (east and north
   *  positive), split wherever the line wraps the antimeridian. */
  segments: Array<Array<[number, number]>>;
}

export interface AcgOptions {
  /** Highest |latitude| drawn — maps rarely need the polar caps. */
  maxLatitude?: number;
  /** Latitude sampling step for the curved ASC/DSC lines, degrees. */
  step?: number;
  planets?: readonly Planet[];
}

/** Longitude into [−180, 180). */
function wrap180(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/** Split a polyline wherever consecutive longitudes jump across the map,
 *  ending one piece and starting the next on the ±180° edge itself (at the
 *  interpolated latitude) so the line leaves no gap at the map's border. */
export function splitAtAntimeridian(
  points: Array<[number, number]>,
): Array<Array<[number, number]>> {
  const out: Array<Array<[number, number]>> = [];
  let current: Array<[number, number]> = [];
  for (const p of points) {
    const prev = current[current.length - 1];
    if (prev && Math.abs(p[0] - prev[0]) > 180) {
      const edge = prev[0] > 0 ? 180 : -180;
      const unwrapped = p[0] + (edge > 0 ? 360 : -360);
      const t = (edge - prev[0]) / (unwrapped - prev[0]);
      const lat = prev[1] + t * (p[1] - prev[1]);
      current.push([edge, lat]);
      if (current.length > 1) out.push(current);
      current = [[-edge, lat]];
    }
    current.push(p);
  }
  if (current.length > 1) out.push(current);
  return out;
}

/**
 * The latitudes to sample a rising/setting line at: the regular grid, plus
 * an even sweep of the hour angle H₀ from 0° to 180° mapped back to
 * latitude (tan φ = −cos H₀ / tan δ). The grid alone ends a whole step
 * short of the circumpolar limit, where the curve runs nearly east–west —
 * a gap of 15° of longitude or more before it meets the MC/IC meridian;
 * the H₀ sweep lands on the limit exactly (H₀ = 0° and 180°) and follows
 * the bend into it.
 */
function horizonSampleLatitudes(dec: number, maxLat: number, step: number): number[] {
  const lats: number[] = [];
  for (let lat = -maxLat; lat <= maxLat + 1e-9; lat += step) lats.push(lat);
  const tanDec = Math.tan(dec * DEG);
  if (Math.abs(tanDec) > 1e-9) {
    for (let h = 0; h <= 180; h += 2) {
      const lat = Math.atan(-Math.cos(h * DEG) / tanDec) / DEG;
      if (Math.abs(lat) <= maxLat) lats.push(lat);
    }
  }
  return [...new Set(lats.map((l) => Math.round(l * 1e6) / 1e6))].sort((a, b) => a - b);
}

/** The longitude where `planet` is on the MC for an instant. */
export function mcLongitude(ra: number, gst: number): number {
  return wrap180(ra - gst);
}

/**
 * The longitude where the planet rises (asc) or sets (dsc) at latitude
 * `lat`; null where it is circumpolar or never rises.
 */
export function horizonLongitude(
  ra: number,
  dec: number,
  gst: number,
  lat: number,
  angle: "asc" | "dsc",
): number | null {
  const x = -Math.tan(lat * DEG) * Math.tan(dec * DEG);
  // A hair of tolerance: the sampled limit latitude can round to |x| = 1 + ε.
  if (x < -1 - 1e-9 || x > 1 + 1e-9) return null;
  const h0 = Math.acos(Math.max(-1, Math.min(1, x))) / DEG;
  return wrap180(ra - gst + (angle === "asc" ? -h0 : h0));
}

export function astrocartographyLines(
  utc: Date,
  options: AcgOptions = {},
  provider: EphemerisProvider = astronomyEngineProvider,
): AcgLine[] {
  const maxLat = options.maxLatitude ?? 75;
  const step = options.step ?? 1;
  const gst = provider.siderealTimeDeg(utc);
  const lines: AcgLine[] = [];
  for (const planet of options.planets ?? PLANETS) {
    const ra = provider.rightAscension(planet, utc);
    const dec = provider.declination(planet, utc);
    const mc = mcLongitude(ra, gst);
    const ic = wrap180(mc + 180);
    lines.push(
      { planet, angle: "mc", segments: [[[mc, -maxLat], [mc, maxLat]]] },
      { planet, angle: "ic", segments: [[[ic, -maxLat], [ic, maxLat]]] },
    );
    for (const angle of ["asc", "dsc"] as const) {
      const points: Array<[number, number]> = [];
      for (const lat of horizonSampleLatitudes(dec, maxLat, step)) {
        const lng = horizonLongitude(ra, dec, gst, lat, angle);
        if (lng !== null) points.push([lng, lat]);
      }
      lines.push({ planet, angle, segments: splitAtAntimeridian(points) });
    }
  }
  return lines;
}
