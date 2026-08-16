import type { Planet } from "../types";

/**
 * Thin ephemeris abstraction (PRD §4.2). The default implementation is
 * astronomy-engine (MIT); a Swiss Ephemeris implementation can be swapped in
 * without touching the rest of astro-core.
 */
export interface EphemerisProvider {
  name: string;
  version: string;
  /** Geocentric apparent tropical ecliptic longitude of date, degrees [0, 360). */
  eclipticLongitude(planet: Planet, utc: Date): number;
  /** True if the planet's ecliptic longitude is decreasing at this instant. */
  isRetrograde(planet: Planet, utc: Date): boolean;
  /** Rate of change of ecliptic longitude, degrees per day — negative while
   *  retrograde. Finite-difference precision is fine for display purposes
   *  (applying/separating flags), not for root finding. */
  longitudeSpeed(planet: Planet, utc: Date): number;
  /** Greenwich apparent sidereal time, degrees [0, 360). */
  siderealTimeDeg(utc: Date): number;
}
