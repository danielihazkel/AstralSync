import { separation } from "./angles";
import type { Aspect, AspectType, OrbConfig, Placement, Planet } from "./types";
import { DEFAULT_ORBS } from "./types";

const MAJOR_ASPECTS: { type: AspectType; angle: number }[] = [
  { type: "conjunction", angle: 0 },
  { type: "sextile", angle: 60 },
  { type: "square", angle: 90 },
  { type: "trine", angle: 120 },
  { type: "opposition", angle: 180 },
];

const LUMINARIES: Planet[] = ["sun", "moon"];

export function maxOrb(a: Planet, b: Planet, orbs: OrbConfig): number {
  return LUMINARIES.includes(a) || LUMINARIES.includes(b)
    ? orbs.luminary
    : orbs.default;
}

/** Detect major aspects between all placement pairs. Each pair yields at most
 *  one aspect (the tightest within orb). */
export function detectAspects(
  placements: Pick<Placement, "planet" | "longitude">[],
  orbs: OrbConfig = DEFAULT_ORBS,
): Aspect[] {
  const found: Aspect[] = [];
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i];
      const b = placements[j];
      const sep = separation(a.longitude, b.longitude);
      const limit = maxOrb(a.planet, b.planet, orbs);

      let best: Aspect | null = null;
      for (const { type, angle } of MAJOR_ASPECTS) {
        const orb = Math.abs(sep - angle);
        if (orb <= limit && (best === null || orb < best.orb)) {
          best = { a: a.planet, b: b.planet, type, angle, orb };
        }
      }
      if (best) found.push(best);
    }
  }
  return found;
}
