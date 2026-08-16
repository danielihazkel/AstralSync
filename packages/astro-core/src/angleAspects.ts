import { separation } from "./angles";
import { MAJOR_ASPECTS } from "./aspects";
import type { AspectType, Houses, OrbConfig, Placement, Planet } from "./types";
import { DEFAULT_ORBS } from "./types";

/**
 * Aspects to the chart angles (Ascendant and Midheaven). Angles are
 * geometric points, not bodies, so this stays deliberately conservative:
 *
 * - Majors only — a minor aspect to an angle is below this app's noise floor.
 * - The non-luminary (`default`) orb for every planet, luminaries included:
 *   the wide luminary orb encodes the Sun's and Moon's own influence, which
 *   an angle does not share.
 * - Targets are the ASC and MC only. The Descendant and IC are the same
 *   axes: a Descendant conjunction IS the ASC opposition this reports.
 *
 * NEVER stored in snapshots — angle aspects are read-time results, computed
 * beside the stored majors the way the minor-aspect overlay is. Solar charts
 * have no houses and therefore no angle aspects.
 */

export type AngleBody = "ascendant" | "mc";

export const ANGLE_BODIES: AngleBody[] = ["ascendant", "mc"];

export interface AngleAspect {
  /** The moving/partner body: a natal planet, a transiting planet, or the
   *  other chart's planet, depending on the read. */
  planet: Planet;
  /** The chart angle being aspected. */
  target: AngleBody;
  type: AspectType;
  /** Exact angle of this aspect type (e.g. 0, 60, 90, 120, 180). */
  angle: number;
  /** Deviation from exact, degrees. */
  orb: number;
}

/**
 * Detect major aspects from each placement to the chart's ASC and MC. Each
 * planet–angle pair yields at most one aspect (the tightest within orb).
 * Output order is deterministic: placement order major, ASC-before-MC minor.
 */
export function detectAngleAspects(
  placements: Pick<Placement, "planet" | "longitude">[],
  houses: Pick<Houses, "ascendant" | "mc">,
  orbs: OrbConfig = DEFAULT_ORBS,
): AngleAspect[] {
  const angles: Record<AngleBody, number> = {
    ascendant: houses.ascendant,
    mc: houses.mc,
  };
  const found: AngleAspect[] = [];
  for (const p of placements) {
    for (const target of ANGLE_BODIES) {
      const sep = separation(p.longitude, angles[target]);

      let best: AngleAspect | null = null;
      for (const def of MAJOR_ASPECTS) {
        const orb = Math.abs(sep - def.angle);
        if (orb <= orbs.default && (best === null || orb < best.orb)) {
          best = { planet: p.planet, target, type: def.type, angle: def.angle, orb };
        }
      }
      if (best) found.push(best);
    }
  }
  return found;
}
