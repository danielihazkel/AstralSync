import { separation } from "./angles";
import { MAJOR_ASPECTS, maxOrb } from "./aspects";
import type { CrossAspect, OrbConfig, Placement } from "./types";
import { DEFAULT_ORBS } from "./types";

/** Detect major aspects across the full A×B grid of two placement sets.
 *  Unlike `detectAspects`, same-planet pairs are included (transit Sun
 *  conjunct natal Sun) and every ordered (a, b) pair is examined. Each pair
 *  yields at most one aspect (the tightest within orb). Output order is
 *  deterministic: A-index major, B-index minor. */
export function detectCrossAspects(
  a: Pick<Placement, "planet" | "longitude">[],
  b: Pick<Placement, "planet" | "longitude">[],
  orbs: OrbConfig = DEFAULT_ORBS,
): CrossAspect[] {
  const found: CrossAspect[] = [];
  for (const pa of a) {
    for (const pb of b) {
      const sep = separation(pa.longitude, pb.longitude);
      const limit = maxOrb(pa.planet, pb.planet, orbs);

      let best: CrossAspect | null = null;
      for (const { type, angle } of MAJOR_ASPECTS) {
        const orb = Math.abs(sep - angle);
        if (orb <= limit && (best === null || orb < best.orb)) {
          best = { a: pa.planet, b: pb.planet, type, angle, orb };
        }
      }
      if (best) found.push(best);
    }
  }
  return found;
}
