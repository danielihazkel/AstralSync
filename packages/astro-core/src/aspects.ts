import { separation } from "./angles";
import type { Aspect, AspectType, OrbConfig, Placement, Planet } from "./types";
import { DEFAULT_ORBS } from "./types";

export interface AspectDef {
  type: AspectType;
  angle: number;
  class: "major" | "minor";
}

export const MAJOR_ASPECTS: AspectDef[] = [
  { type: "conjunction", angle: 0, class: "major" },
  { type: "sextile", angle: 60, class: "major" },
  { type: "square", angle: 90, class: "major" },
  { type: "trine", angle: 120, class: "major" },
  { type: "opposition", angle: 180, class: "major" },
];

/** Opt-in: never part of stored snapshots (buildChart stays majors-only);
 *  read-time computations pass them explicitly. */
export const MINOR_ASPECTS: AspectDef[] = [
  { type: "semisextile", angle: 30, class: "minor" },
  { type: "semisquare", angle: 45, class: "minor" },
  { type: "quintile", angle: 72, class: "minor" },
  { type: "sesquiquadrate", angle: 135, class: "minor" },
  { type: "quincunx", angle: 150, class: "minor" },
];

export const ALL_ASPECTS: AspectDef[] = [...MAJOR_ASPECTS, ...MINOR_ASPECTS];

/** Minor aspects read tight regardless of the bodies involved. */
const DEFAULT_MINOR_ORB = 2;

const LUMINARIES: Planet[] = ["sun", "moon"];

export function maxOrb(a: Planet, b: Planet, orbs: OrbConfig): number {
  return LUMINARIES.includes(a) || LUMINARIES.includes(b)
    ? orbs.luminary
    : orbs.default;
}

function limitFor(def: AspectDef, a: Planet, b: Planet, orbs: OrbConfig): number {
  return def.class === "minor"
    ? (orbs.minor ?? DEFAULT_MINOR_ORB)
    : maxOrb(a, b, orbs);
}

/** Detect aspects between all placement pairs. Each pair yields at most one
 *  aspect (the tightest within its orb limit). Defaults to majors only —
 *  stored snapshots must stay byte-identical; pass ALL_ASPECTS (or
 *  MINOR_ASPECTS) for read-time overlays. */
export function detectAspects(
  placements: Pick<Placement, "planet" | "longitude">[],
  orbs: OrbConfig = DEFAULT_ORBS,
  aspects: AspectDef[] = MAJOR_ASPECTS,
): Aspect[] {
  const found: Aspect[] = [];
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = placements[i];
      const b = placements[j];
      const sep = separation(a.longitude, b.longitude);

      let best: Aspect | null = null;
      for (const def of aspects) {
        const orb = Math.abs(sep - def.angle);
        const limit = limitFor(def, a.planet, b.planet, orbs);
        if (orb <= limit && (best === null || orb < best.orb)) {
          best = { a: a.planet, b: b.planet, type: def.type, angle: def.angle, orb };
        }
      }
      if (best) found.push(best);
    }
  }
  return found;
}
