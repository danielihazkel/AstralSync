import { separation } from "./angles";
import type { Placement, Planet, Sign } from "./types";
import { PLANETS } from "./types";

/**
 * Whole-chart aspect patterns, detected from longitudes directly (pairwise
 * separations with fixed orbs) rather than from a stored aspect list — so
 * detection is independent of orb preferences and of which aspect types a
 * chart snapshot recorded. Ephemeral: computed on read, never persisted.
 *
 * Orbs: 7° for the major legs (trine/square/opposition/sextile), 3° for the
 * quincunx legs of a yod — conventional pattern-hunting values, deliberately
 * flat (no luminary bonus) to keep the definition explainable in one line.
 */

export type PatternType =
  | "stellium"
  | "grand_trine"
  | "t_square"
  | "grand_cross"
  | "yod";

export interface ChartPattern {
  type: PatternType;
  /** Members in PLANETS order; for t_square/yod the apex comes last. */
  planets: Planet[];
  /** The shared sign for a stellium; each member's sign otherwise. */
  signs: Sign[];
  /** Focal planet of a t_square (squared by both ends of the opposition)
   *  or yod (quincunxed by both ends of the sextile). */
  apex?: Planet;
}

const MAJOR_LEG_ORB = 7;
const QUINCUNX_LEG_ORB = 3;

type Member = Pick<Placement, "planet" | "longitude" | "sign">;

function inAspect(a: Member, b: Member, angle: number, orb: number): boolean {
  return Math.abs(separation(a.longitude, b.longitude) - angle) <= orb;
}

function byPlanetOrder(a: Member, b: Member): number {
  return PLANETS.indexOf(a.planet) - PLANETS.indexOf(b.planet);
}

/** Maximal cliques (size ≥ 3) of an adjacency relation, by bitmask sweep —
 *  n ≤ 10 members keeps this trivially cheap. */
function maximalCliques(members: Member[], adjacent: boolean[][]): Member[][] {
  const n = members.length;
  const qualifying: number[] = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    const bits: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) bits.push(i);
    if (bits.length < 3) continue;
    let ok = true;
    for (let i = 0; i < bits.length && ok; i++) {
      for (let j = i + 1; j < bits.length && ok; j++) {
        if (!adjacent[bits[i]][bits[j]]) ok = false;
      }
    }
    if (ok) qualifying.push(mask);
  }
  return qualifying
    .filter((mask) =>
      qualifying.every((other) => other === mask || (other & mask) !== mask),
    )
    .map((mask) => members.filter((_, i) => mask & (1 << i)));
}

export function detectPatterns(placements: Member[]): ChartPattern[] {
  const ps = [...placements].sort(byPlanetOrder);
  const n = ps.length;
  const patterns: ChartPattern[] = [];

  // Stellium: three or more planets sharing a sign.
  const bySign = new Map<Sign, Member[]>();
  for (const p of ps) {
    const group = bySign.get(p.sign) ?? [];
    group.push(p);
    bySign.set(p.sign, group);
  }
  for (const [sign, group] of bySign) {
    if (group.length >= 3) {
      patterns.push({
        type: "stellium",
        planets: group.map((p) => p.planet),
        signs: [sign],
      });
    }
  }

  // Grand cross: two oppositions whose four ends are pairwise square.
  const crosses: ChartPattern[] = [];
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) {
          const four = [ps[a], ps[b], ps[c], ps[d]];
          const opp: [Member, Member][] = [];
          const sq: [Member, Member][] = [];
          for (let i = 0; i < 4; i++)
            for (let j = i + 1; j < 4; j++) {
              if (inAspect(four[i], four[j], 180, MAJOR_LEG_ORB))
                opp.push([four[i], four[j]]);
              else if (inAspect(four[i], four[j], 90, MAJOR_LEG_ORB))
                sq.push([four[i], four[j]]);
            }
          if (opp.length === 2 && sq.length === 4) {
            crosses.push({
              type: "grand_cross",
              planets: four.map((p) => p.planet),
              signs: four.map((p) => p.sign),
            });
          }
        }
  patterns.push(...crosses);

  // Grand trine: maximal sets of pairwise-trine planets.
  const trineAdj = ps.map((a) => ps.map((b) => inAspect(a, b, 120, MAJOR_LEG_ORB)));
  for (const clique of maximalCliques(ps, trineAdj)) {
    patterns.push({
      type: "grand_trine",
      planets: clique.map((p) => p.planet),
      signs: clique.map((p) => p.sign),
    });
  }

  // T-square: an opposition whose both ends square an apex — unless the trio
  // sits inside a reported grand cross.
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) {
      if (!inAspect(ps[a], ps[b], 180, MAJOR_LEG_ORB)) continue;
      for (let c = 0; c < n; c++) {
        if (c === a || c === b) continue;
        if (
          !inAspect(ps[a], ps[c], 90, MAJOR_LEG_ORB) ||
          !inAspect(ps[b], ps[c], 90, MAJOR_LEG_ORB)
        )
          continue;
        const trio = [ps[a].planet, ps[b].planet, ps[c].planet];
        if (
          crosses.some((cross) => trio.every((p) => cross.planets.includes(p)))
        )
          continue;
        patterns.push({
          type: "t_square",
          planets: [ps[a].planet, ps[b].planet, ps[c].planet],
          signs: [ps[a].sign, ps[b].sign, ps[c].sign],
          apex: ps[c].planet,
        });
      }
    }

  // Yod: a sextile whose both ends quincunx an apex (tight 3° legs).
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++) {
      if (!inAspect(ps[a], ps[b], 60, MAJOR_LEG_ORB)) continue;
      for (let c = 0; c < n; c++) {
        if (c === a || c === b) continue;
        if (
          !inAspect(ps[a], ps[c], 150, QUINCUNX_LEG_ORB) ||
          !inAspect(ps[b], ps[c], 150, QUINCUNX_LEG_ORB)
        )
          continue;
        patterns.push({
          type: "yod",
          planets: [ps[a].planet, ps[b].planet, ps[c].planet],
          signs: [ps[a].sign, ps[b].sign, ps[c].sign],
          apex: ps[c].planet,
        });
      }
    }

  return patterns;
}
