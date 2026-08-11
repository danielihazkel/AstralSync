import { DEG, angleDiff, norm360 } from "./angles";
import type { HouseSystem, Houses } from "./types";

/** Thrown when Placidus house cusps are undefined (circumpolar ecliptic
 *  degrees at high latitude). Callers fall back to Whole Sign. */
export class PlacidusDegenerateError extends Error {
  constructor() {
    super("Placidus houses are undefined at this latitude");
    this.name = "PlacidusDegenerateError";
  }
}

/** Ecliptic longitude of the point on the ecliptic with right ascension `ra`
 *  (degrees), for obliquity `eps` (degrees). Preserves quadrant. */
function raToEclipticLongitude(ra: number, eps: number): number {
  const a = ra * DEG;
  return norm360(Math.atan2(Math.sin(a), Math.cos(a) * Math.cos(eps * DEG)) / DEG);
}

/** Midheaven: ecliptic longitude culminating at RAMC. */
export function midheaven(ramc: number, eps: number): number {
  return raToEclipticLongitude(ramc, eps);
}

/** Ascendant: ecliptic longitude rising at RAMC for geographic latitude. */
export function ascendant(ramc: number, lat: number, eps: number): number {
  const r = ramc * DEG;
  const e = eps * DEG;
  const f = lat * DEG;
  const asc = Math.atan2(
    Math.cos(r),
    -(Math.sin(r) * Math.cos(e) + Math.tan(f) * Math.sin(e)),
  );
  return norm360(asc / DEG);
}

/**
 * One intermediate Placidus cusp, solved iteratively.
 *
 * A Placidus cusp trisects the diurnal (houses 11, 12) or nocturnal
 * (houses 2, 3) semi-arc of every point on it. In right ascension this means
 *   cusp 11: RA = RAMC +  30 + AD/3        cusp 12: RA = RAMC +  60 + 2·AD/3
 *   cusp  2: RA = RAMC + 120 + 2·AD/3      cusp  3: RA = RAMC + 150 + AD/3
 * where AD = asin(tan φ · tan δ) is the ascensional difference of the point,
 * recomputed from its declination δ each iteration until fixed.
 */
function placidusCusp(
  ramc: number,
  lat: number,
  eps: number,
  offset: number,
  thirds: number,
): number {
  const f = lat * DEG;
  const e = eps * DEG;
  let ra = norm360(ramc + offset);
  for (let i = 0; i < 100; i++) {
    const delta = Math.atan(Math.tan(e) * Math.sin(ra * DEG));
    const x = Math.tan(f) * Math.tan(delta);
    if (Math.abs(x) >= 1) throw new PlacidusDegenerateError();
    const ad = Math.asin(x) / DEG;
    const next = norm360(ramc + offset + (thirds * ad) / 3);
    if (Math.abs(angleDiff(next, ra)) < 1e-9) {
      ra = next;
      break;
    }
    ra = next;
  }
  return raToEclipticLongitude(ra, eps);
}

function withOpposites(c: {
  asc: number;
  mc: number;
  c11: number;
  c12: number;
  c2: number;
  c3: number;
}): number[] {
  return [
    c.asc,
    c.c2,
    c.c3,
    norm360(c.mc + 180),
    norm360(c.c11 + 180),
    norm360(c.c12 + 180),
    norm360(c.asc + 180),
    norm360(c.c2 + 180),
    norm360(c.c3 + 180),
    c.mc,
    c.c11,
    c.c12,
  ];
}

export function placidusHouses(ramc: number, lat: number, eps: number): number[] {
  const asc = ascendant(ramc, lat, eps);
  const mc = midheaven(ramc, eps);
  return withOpposites({
    asc,
    mc,
    c11: placidusCusp(ramc, lat, eps, 30, 1),
    c12: placidusCusp(ramc, lat, eps, 60, 2),
    c2: placidusCusp(ramc, lat, eps, 120, 2),
    c3: placidusCusp(ramc, lat, eps, 150, 1),
  });
}

export function wholeSignHouses(asc: number): number[] {
  const start = Math.floor(norm360(asc) / 30) * 30;
  return Array.from({ length: 12 }, (_, i) => norm360(start + 30 * i));
}

export function equalHouses(asc: number): number[] {
  return Array.from({ length: 12 }, (_, i) => norm360(asc + 30 * i));
}

/** House number (1–12) containing an ecliptic longitude. */
export function houseOf(longitude: number, cusps: number[]): number {
  const x = norm360(longitude);
  for (let i = 0; i < 12; i++) {
    const lo = cusps[i];
    const hi = cusps[(i + 1) % 12];
    const inHouse = lo <= hi ? x >= lo && x < hi : x >= lo || x < hi;
    if (inHouse) return i + 1;
  }
  return 12; // unreachable for well-formed cusps
}

/**
 * Compute the house structure, applying the automatic Whole Sign fallback
 * when Placidus degenerates at high latitude (PRD §3.2).
 */
export function computeHouses(
  requested: HouseSystem,
  ramc: number,
  lat: number,
  eps: number,
): Houses {
  const asc = ascendant(ramc, lat, eps);
  const mc = midheaven(ramc, eps);

  let system = requested;
  let fallbackApplied = false;
  let cusps: number[];

  if (requested === "placidus") {
    try {
      cusps = placidusHouses(ramc, lat, eps);
    } catch (err) {
      if (!(err instanceof PlacidusDegenerateError)) throw err;
      system = "whole_sign";
      fallbackApplied = true;
      cusps = wholeSignHouses(asc);
    }
  } else if (requested === "whole_sign") {
    cusps = wholeSignHouses(asc);
  } else {
    cusps = equalHouses(asc);
  }

  return { system, requestedSystem: requested, fallbackApplied, cusps, ascendant: asc, mc };
}
