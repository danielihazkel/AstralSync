import {
  essentialDignity,
  solarCondition,
  type EssentialDignity,
  type Placement,
  type Planet,
  type SolarCondition,
} from "@astralsync/astro-core";

/**
 * Read-time dignity decoration for a chart's placements — client-safe pure
 * math over stored longitudes, never persisted (same contract as minor
 * aspects and angle aspects). Classical doctrine throughout: the moderns
 * carry no essential dignity, and solar conditions are reported for the six
 * classical non-Sun planets only (the Sun cannot be combust by itself; the
 * outers postdate the doctrine).
 */

/** Planets whose separation from the Sun reads as a solar condition. */
const SOLAR_CONDITION_PLANETS: ReadonlySet<Planet> = new Set([
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
]);

export interface PlacementDignity {
  dignity: EssentialDignity | null;
  solar: SolarCondition | null;
}

export type ChartDignities = Partial<Record<Planet, PlacementDignity>>;

/** Per-planet essential dignity + solar condition for one chart's placements. */
export function chartDignities(placements: Placement[]): ChartDignities {
  const sunLon = placements.find((p) => p.planet === "sun")?.longitude;
  const out: ChartDignities = {};
  for (const p of placements) {
    out[p.planet] = {
      dignity: essentialDignity(p.planet, p.sign),
      solar:
        sunLon !== undefined && SOLAR_CONDITION_PLANETS.has(p.planet)
          ? solarCondition(p.longitude, sunLon)
          : null,
    };
  }
  return out;
}

/** True when at least one placement has something to show — hosts can skip
 *  the column entirely for an all-neutral chart. */
export function hasAnyDignity(dignities: ChartDignities): boolean {
  return Object.values(dignities).some(
    (d) => d !== undefined && (d.dignity !== null || d.solar !== null),
  );
}
