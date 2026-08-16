import {
  isApplying,
  type AspectType,
  type Planet,
} from "@astralsync/astro-core";

/**
 * Applying/separating verdicts for a set of aspect rows, as a plain
 * key → boolean map that serializes across the server/client boundary
 * (the ephemeris speeds live server-side; the tables only look up).
 * Client-safe — pure math, no fs and no provider import.
 */
export type AspectMotion = Record<string, boolean>;

/** Key shape shared by the builder and the table lookups. The second body
 *  may be an angle name for cross-chart angle rows. */
export function motionKey(a: string, b: string, type: AspectType): string {
  return `${a}/${b}/${type}`;
}

/**
 * Build the motion map for planet-pair rows. Both bodies' longitudes and
 * speeds must be for the same instant; rows whose bodies are missing from
 * either record are skipped (no entry — the UI renders no verdict).
 */
export function buildAspectMotion(
  rows: { a: Planet; b: Planet; type: AspectType; angle: number }[],
  lonByPlanet: Partial<Record<Planet, number>>,
  speedByPlanet: Partial<Record<Planet, number>>,
): AspectMotion {
  const motion: AspectMotion = {};
  for (const row of rows) {
    const lonA = lonByPlanet[row.a];
    const lonB = lonByPlanet[row.b];
    const speedA = speedByPlanet[row.a];
    const speedB = speedByPlanet[row.b];
    if (
      lonA === undefined ||
      lonB === undefined ||
      speedA === undefined ||
      speedB === undefined
    )
      continue;
    motion[motionKey(row.a, row.b, row.type)] = isApplying(
      lonA,
      speedA,
      lonB,
      speedB,
      row.angle,
    );
  }
  return motion;
}
