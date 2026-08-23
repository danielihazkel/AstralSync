import { meanObliquity } from "./angles";
import { astronomyEngineProvider } from "./ephemeris/astronomyEngine";
import type { EphemerisProvider } from "./ephemeris/interface";
import type { Planet } from "./types";
import { PLANETS } from "./types";

/**
 * Declinations — the north–south dimension the longitude-only chart ignores.
 * Ephemeral like minor aspects and angle aspects: computed read-time from the
 * stored birth instant, never part of a snapshot (the byte-identity invariant
 * holds). Two doctrines ride on it: parallels/contraparallels (same declination
 * on the same or opposite side of the equator, read like a conjunction/
 * opposition) and out-of-bounds (beyond the Sun's maximum declination — the
 * obliquity — where a planet is said to act outside the rules).
 */

/** Declination aspects read tight; 1° is the customary orb, deliberately not
 *  user-tunable (OrbSettingsControl does not apply). */
export const DECLINATION_ORB = 1;

export interface PlanetDeclination {
  planet: Planet;
  /** Geocentric apparent declination of date, degrees, positive north. */
  declination: number;
  /** True when |declination| exceeds the obliquity — beyond the Sun's reach.
   *  The Sun itself can never be out of bounds. */
  outOfBounds: boolean;
}

export type DeclinationAspectType = "parallel" | "contraparallel";

export interface DeclinationAspect {
  /** Pair in PLANETS order (a before b). */
  a: Planet;
  b: Planet;
  type: DeclinationAspectType;
  /** Degrees from exact, [0, orb]. */
  orb: number;
}

/** All ten planets' declinations at an instant, with out-of-bounds flags. */
export function declinationsAt(
  utc: Date,
  provider: EphemerisProvider = astronomyEngineProvider,
): PlanetDeclination[] {
  const eps = meanObliquity(utc);
  return PLANETS.map((planet) => {
    const declination = provider.declination(planet, utc);
    return {
      planet,
      declination,
      outOfBounds: Math.abs(declination) > eps,
    };
  });
}

/**
 * Parallels (|δa − δb| within orb) and contraparallels (|δa + δb| within orb)
 * over a set of declinations, sorted by orb ascending. Each pair yields at
 * most one aspect — when both hold (both planets near the equator), the
 * tighter wins, conventionally the parallel on a tie.
 */
export function detectDeclinationAspects(
  declinations: PlanetDeclination[],
  orb: number = DECLINATION_ORB,
): DeclinationAspect[] {
  const out: DeclinationAspect[] = [];
  for (let i = 0; i < declinations.length; i++) {
    for (let j = i + 1; j < declinations.length; j++) {
      const a = declinations[i];
      const b = declinations[j];
      const parallelOrb = Math.abs(a.declination - b.declination);
      const contraOrb = Math.abs(a.declination + b.declination);
      const type: DeclinationAspectType =
        parallelOrb <= contraOrb ? "parallel" : "contraparallel";
      const best = Math.min(parallelOrb, contraOrb);
      if (best <= orb) {
        out.push({ a: a.planet, b: b.planet, type, orb: best });
      }
    }
  }
  return out.sort((x, y) => x.orb - y.orb);
}
