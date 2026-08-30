import { DEG, angleDiff, norm360 } from "./angles";
import type { HouseSystem, Houses } from "./types";

/** Thrown when a quadrant system's cusps are undefined (circumpolar
 *  ecliptic degrees at high latitude — Placidus, Koch and Alcabitius all
 *  divide semi-arcs and share the failure mode). Callers fall back to
 *  Whole Sign. The name predates the extra systems and is kept for
 *  compatibility. */
export class PlacidusDegenerateError extends Error {
  constructor(system = "Placidus") {
    super(`${system} houses are undefined at this latitude`);
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

/** Porphyry: each ecliptic quadrant between the angles trisected. */
export function porphyryHouses(ramc: number, lat: number, eps: number): number[] {
  const asc = ascendant(ramc, lat, eps);
  const mc = midheaven(ramc, eps);
  const upper = norm360(asc - mc); // MC → ASC along the zodiac
  const lower = 180 - upper; // ASC → IC
  return withOpposites({
    asc,
    mc,
    c11: norm360(mc + upper / 3),
    c12: norm360(mc + (2 * upper) / 3),
    c2: norm360(asc + lower / 3),
    c3: norm360(asc + (2 * lower) / 3),
  });
}

/** Declination of the ecliptic degree with longitude `lon` (degrees). */
function eclipticDeclination(lon: number, eps: number): number {
  return Math.asin(Math.sin(eps * DEG) * Math.sin(lon * DEG)) / DEG;
}

/** Ascensional difference asin(tan φ · tan δ); throws when circumpolar. */
function ascensionalDifference(lat: number, dec: number, system: string): number {
  const x = Math.tan(lat * DEG) * Math.tan(dec * DEG);
  if (Math.abs(x) >= 1) throw new PlacidusDegenerateError(system);
  return Math.asin(x) / DEG;
}

/**
 * Koch ("birthplace houses"): the MC degree's ascensional difference divides
 * its semi-arc into thirds; the cusps are the Ascendants at those RAMCs.
 */
export function kochHouses(ramc: number, lat: number, eps: number): number[] {
  const asc = ascendant(ramc, lat, eps);
  const mc = midheaven(ramc, eps);
  const ad3 = ascensionalDifference(lat, eclipticDeclination(mc, eps), "Koch") / 3;
  return withOpposites({
    asc,
    mc,
    c11: ascendant(norm360(ramc - 60 - 2 * ad3), lat, eps),
    c12: ascendant(norm360(ramc - 30 - ad3), lat, eps),
    c2: ascendant(norm360(ramc + 30 + ad3), lat, eps),
    c3: ascendant(norm360(ramc + 60 + 2 * ad3), lat, eps),
  });
}

/**
 * Regiomontanus: the celestial equator divided into equal 30° arcs from the
 * RAMC; each cusp is the horizon ("Ascendant") formula evaluated at the
 * house circle's pole latitude atan(tan φ · sin H).
 */
export function regiomontanusHouses(
  ramc: number,
  lat: number,
  eps: number,
): number[] {
  const asc = ascendant(ramc, lat, eps);
  const mc = midheaven(ramc, eps);
  const pole = (h: number) =>
    Math.atan(Math.tan(lat * DEG) * Math.sin(h * DEG)) / DEG;
  const p30 = pole(30);
  const p60 = pole(60);
  return withOpposites({
    asc,
    mc,
    c11: ascendant(norm360(ramc - 60), p30, eps),
    c12: ascendant(norm360(ramc - 30), p60, eps),
    c2: ascendant(norm360(ramc + 30), p60, eps),
    c3: ascendant(norm360(ramc + 60), p30, eps),
  });
}

/**
 * Campanus: the prime vertical divided into equal 30° arcs; house-circle
 * poles at asin(sin φ · sin H) with equator offsets atan(tan H · cos φ).
 */
export function campanusHouses(ramc: number, lat: number, eps: number): number[] {
  const asc = ascendant(ramc, lat, eps);
  const mc = midheaven(ramc, eps);
  const f = lat * DEG;
  const pole = (h: number) => Math.asin(Math.sin(f) * Math.sin(h * DEG)) / DEG;
  const offset = (h: number) =>
    Math.atan(Math.tan(h * DEG) * Math.cos(f)) / DEG;
  const p30 = pole(30);
  const p60 = pole(60);
  const x30 = offset(30);
  const x60 = offset(60);
  return withOpposites({
    asc,
    mc,
    c11: ascendant(norm360(ramc - x60), p30, eps),
    c12: ascendant(norm360(ramc - x30), p60, eps),
    c2: ascendant(norm360(ramc + x30), p60, eps),
    c3: ascendant(norm360(ramc + x60), p30, eps),
  });
}

/**
 * Alcabitius: the Ascendant degree's diurnal semi-arc trisected in right
 * ascension; cusps are the ecliptic degrees holding those RAs (the MC
 * formula applied off-meridian).
 */
export function alcabitiusHouses(
  ramc: number,
  lat: number,
  eps: number,
): number[] {
  const asc = ascendant(ramc, lat, eps);
  const mc = midheaven(ramc, eps);
  const ad = ascensionalDifference(
    lat,
    eclipticDeclination(asc, eps),
    "Alcabitius",
  );
  const sda = 90 + ad; // diurnal semi-arc of the rising degree, in RA
  const sna = 180 - sda;
  return withOpposites({
    asc,
    mc,
    c11: raToEclipticLongitude(norm360(ramc + sda / 3), eps),
    c12: raToEclipticLongitude(norm360(ramc + (2 * sda) / 3), eps),
    c2: raToEclipticLongitude(norm360(ramc + sda + sna / 3), eps),
    c3: raToEclipticLongitude(norm360(ramc + sda + (2 * sna) / 3), eps),
  });
}

/**
 * The Vertex: the western intersection of the ecliptic with the prime
 * vertical (the great circle through the zenith and the east/west points).
 * Built explicitly from the two planes — the classical co-latitude
 * shortcut picks the wrong intersection for some configurations — and the
 * western candidate (negative projection on the east direction) is chosen.
 * The Anti-Vertex is its opposite.
 */
export function vertex(ramc: number, lat: number, eps: number): number {
  const r = ramc * DEG;
  const f = lat * DEG;
  const e = eps * DEG;
  // Equatorial frame, x toward the vernal point.
  const zenith = {
    x: Math.cos(f) * Math.cos(r),
    y: Math.cos(f) * Math.sin(r),
    z: Math.sin(f),
  };
  const east = { x: -Math.sin(r), y: Math.cos(r), z: 0 };
  // Prime-vertical plane normal.
  const n = {
    x: zenith.y * east.z - zenith.z * east.y,
    y: zenith.z * east.x - zenith.x * east.z,
    z: zenith.x * east.y - zenith.y * east.x,
  };
  // Ecliptic pole; d = n × pole lies in both planes.
  const pole = { x: 0, y: -Math.sin(e), z: Math.cos(e) };
  let d = {
    x: n.y * pole.z - n.z * pole.y,
    y: n.z * pole.x - n.x * pole.z,
    z: n.x * pole.y - n.y * pole.x,
  };
  if (d.x * east.x + d.y * east.y + d.z * east.z > 0) {
    d = { x: -d.x, y: -d.y, z: -d.z };
  }
  return norm360(
    Math.atan2(d.y * Math.cos(e) + d.z * Math.sin(e), d.x) / DEG,
  );
}

/** The East Point (equatorial ascendant): the ecliptic degree whose right
 *  ascension is RAMC + 90° — the Ascendant a chart would have at the
 *  equator. */
export function eastPoint(ramc: number, eps: number): number {
  return raToEclipticLongitude(norm360(ramc + 90), eps);
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

  const quadrant: Partial<
    Record<HouseSystem, (r: number, la: number, e: number) => number[]>
  > = {
    placidus: placidusHouses,
    koch: kochHouses,
    regiomontanus: regiomontanusHouses,
    campanus: campanusHouses,
    alcabitius: alcabitiusHouses,
    porphyry: porphyryHouses,
  };

  const compute = quadrant[requested];
  if (compute) {
    try {
      cusps = compute(ramc, lat, eps);
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
