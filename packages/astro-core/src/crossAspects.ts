import { separation } from "./angles";
import { MAJOR_ASPECTS, maxOrb, type AspectDef } from "./aspects";
import type { CrossAspect, OrbConfig, Placement } from "./types";
import { DEFAULT_ORBS } from "./types";

const DEFAULT_MINOR_ORB = 2;

/** Detect aspects across the full A×B grid of two placement sets. Unlike
 *  `detectAspects`, same-planet pairs are included (transit Sun conjunct
 *  natal Sun) and every ordered (a, b) pair is examined. Each pair yields at
 *  most one aspect (the tightest within its orb limit). Defaults to majors
 *  only; pass ALL_ASPECTS for read-time minor overlays. Output order is
 *  deterministic: A-index major, B-index minor. */
export function detectCrossAspects(
  a: Pick<Placement, "planet" | "longitude">[],
  b: Pick<Placement, "planet" | "longitude">[],
  orbs: OrbConfig = DEFAULT_ORBS,
  aspects: AspectDef[] = MAJOR_ASPECTS,
): CrossAspect[] {
  const found: CrossAspect[] = [];
  for (const pa of a) {
    for (const pb of b) {
      const sep = separation(pa.longitude, pb.longitude);

      let best: CrossAspect | null = null;
      for (const def of aspects) {
        const orb = Math.abs(sep - def.angle);
        const limit =
          def.class === "minor"
            ? (orbs.minor ?? DEFAULT_MINOR_ORB)
            : maxOrb(pa.planet, pb.planet, orbs);
        if (orb <= limit && (best === null || orb < best.orb)) {
          best = { a: pa.planet, b: pb.planet, type: def.type, angle: def.angle, orb };
        }
      }
      if (best) found.push(best);
    }
  }
  return found;
}
