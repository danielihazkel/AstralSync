import { circularMidpoint, norm360 } from "./angles";
import { detectAspects } from "./aspects";
import { signOf } from "./chart";
import {
  DEFAULT_ORBS,
  PLANETS,
  type Aspect,
  type OrbConfig,
  type Placement,
} from "./types";

/**
 * Midpoint composite chart: one chart for the relationship itself, each
 * planet at the shorter-arc midpoint of the two people's positions. Like
 * synastry, purely derived from two stored charts — ephemeral, never
 * persisted. No houses in v1 (midpoint-Ascendant house math is contested and
 * either chart may be solar) and no retrograde flags (a midpoint has no
 * motion): rendered like a solar chart, aspects at natal orbs.
 */
export interface CompositeChartData {
  placements: Placement[];
  aspects: Aspect[];
}

export function compositeChart(
  a: Placement[],
  b: Placement[],
  orbs: OrbConfig = DEFAULT_ORBS,
): CompositeChartData {
  const byPlanetA = new Map(a.map((p) => [p.planet, p]));
  const byPlanetB = new Map(b.map((p) => [p.planet, p]));
  const placements: Placement[] = [];
  for (const planet of PLANETS) {
    const pa = byPlanetA.get(planet);
    const pb = byPlanetB.get(planet);
    if (!pa || !pb) continue;
    const longitude = circularMidpoint(pa.longitude, pb.longitude);
    placements.push({
      planet,
      longitude,
      sign: signOf(longitude),
      degreeInSign: norm360(longitude) % 30,
      house: null,
      retrograde: false,
    });
  }
  return { placements, aspects: detectAspects(placements, orbs) };
}
