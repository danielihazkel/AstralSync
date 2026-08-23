import { norm360, separation } from "./angles";
import type { Placement, Planet } from "./types";

/**
 * Antiscia — reflections across the solstitial axis (0° Cancer / 0°
 * Capricorn). Two planets equidistant from the axis "see" each other as
 * shadow partners: the antiscion contact reads like a hidden conjunction,
 * the contra-antiscion (reflection across the equinoctial axis) like a
 * hidden opposition. Ephemeral like minors and declinations: computed
 * read-time, never part of a stored snapshot.
 */

/** The reflection of a longitude across 0° Cancer / 0° Capricorn. */
export function antiscionOf(longitude: number): number {
  return norm360(180 - longitude);
}

/** Antiscia contacts read tight; 1° is customary, deliberately not
 *  user-tunable (OrbSettingsControl does not apply). */
export const ANTISCIA_ORB = 1;

export type AntisciaType = "antiscia" | "contra_antiscia";

export interface AntisciaContact {
  /** Pair in the given placement order (a before b). */
  a: Planet;
  b: Planet;
  type: AntisciaType;
  /** Degrees from exact, [0, orb]. */
  orb: number;
}

/**
 * All pairs where one planet sits on the other's antiscion (λa + λb ≈ 180°)
 * or contra-antiscion (λa + λb ≈ 0°/360°), within `orb`, sorted by orb
 * ascending. The relation is symmetric, so each pair yields at most one
 * contact — when both hold (only possible near the axes), the tighter wins,
 * the antiscion on a tie.
 */
export function detectAntiscia(
  placements: Array<Pick<Placement, "planet" | "longitude">>,
  orb: number = ANTISCIA_ORB,
): AntisciaContact[] {
  const out: AntisciaContact[] = [];
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const sum = norm360(placements[i].longitude + placements[j].longitude);
      const antisciaOrb = separation(sum, 180);
      const contraOrb = separation(sum, 0);
      const type: AntisciaType =
        antisciaOrb <= contraOrb ? "antiscia" : "contra_antiscia";
      const best = Math.min(antisciaOrb, contraOrb);
      if (best <= orb) {
        out.push({
          a: placements[i].planet,
          b: placements[j].planet,
          type,
          orb: best,
        });
      }
    }
  }
  return out.sort((x, y) => x.orb - y.orb);
}
