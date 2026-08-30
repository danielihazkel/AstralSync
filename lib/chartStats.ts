import {
  TRADITIONAL_RULERS,
  SIGNS,
  type Houses,
  type Placement,
  type Planet,
  type Sign,
} from "@astralsync/astro-core";
import {
  ELEMENTS,
  MODALITIES,
  SIGN_ELEMENTS,
  SIGN_MODALITIES,
  type Element,
  type Modality,
} from "./dominance";

/**
 * Whole-chart statistics beyond element/modality dominance (lib/dominance.ts):
 * hemisphere emphasis, the Jones chart shape, missing/weak elements and
 * modalities, the dispositor tree, and house rulers. All pure functions of
 * the stored placements (and houses where they exist), computed at read time
 * and never persisted — the aspect-patterns stance. Rulerships are the
 * traditional seven (the same table profections use) so the dispositor
 * chain always terminates in a classical planet; modern co-rulers are
 * listed alongside for reference only.
 */

// --- hemispheres ------------------------------------------------------------

export interface HemisphereEmphasis {
  /** Houses 10–3 (rising side) vs. 4–9 (setting side). */
  east: number;
  west: number;
  /** Houses 1–6 (below the horizon) vs. 7–12 (above). */
  north: number;
  south: number;
  /** Which side leads on each axis, or null at a tie. */
  eastWest: "east" | "west" | null;
  northSouth: "north" | "south" | null;
}

const EAST_HOUSES = new Set([10, 11, 12, 1, 2, 3]);
const NORTH_HOUSES = new Set([1, 2, 3, 4, 5, 6]);

/** Null on a solar chart (no houses). */
export function hemisphereEmphasis(
  placements: Placement[],
): HemisphereEmphasis | null {
  if (placements.some((p) => p.house === null)) return null;
  let east = 0;
  let north = 0;
  for (const p of placements) {
    if (EAST_HOUSES.has(p.house!)) east++;
    if (NORTH_HOUSES.has(p.house!)) north++;
  }
  const west = placements.length - east;
  const south = placements.length - north;
  return {
    east,
    west,
    north,
    south,
    eastWest: east === west ? null : east > west ? "east" : "west",
    northSouth: north === south ? null : north > south ? "north" : "south",
  };
}

// --- Jones chart shape ------------------------------------------------------

export type ChartShapeType =
  | "bundle"
  | "bowl"
  | "bucket"
  | "locomotive"
  | "seesaw"
  | "splay"
  | "splash";

export interface ChartShape {
  type: ChartShapeType;
  /** Degrees of the largest planet-free arc. */
  largestGap: number;
  /** Bucket: the isolated planet. Locomotive/bowl: the planet leading the
   *  occupied arc in zodiacal order (the first one after the empty space). */
  handle: Planet | null;
  leading: Planet | null;
}

const GROUP_GAP = 60;

/**
 * Marc Edmund Jones's seven shapes from the ten planets' longitudes. Rules
 * (conventional, and stated in the UI): bundle — all within 120°; bowl —
 * all within 180°; bucket — nine within 180° and one "handle" opposite;
 * locomotive — all within 240°; seesaw — two groups facing each other across
 * two empty arcs of 60°+; splash — no empty arc of 60°; splay — the rest
 * (three or more clumps).
 */
export function chartShape(placements: Placement[]): ChartShape {
  const sorted = [...placements].sort((a, b) => a.longitude - b.longitude);
  const n = sorted.length;
  // gaps[i] = empty arc after sorted[i] (to sorted[i+1], wrapping).
  const gaps = sorted.map((p, i) => {
    const next = sorted[(i + 1) % n].longitude;
    return ((next - p.longitude) % 360 + 360) % 360 || (n === 1 ? 360 : 0);
  });
  let largestIdx = 0;
  for (let i = 1; i < n; i++) if (gaps[i] > gaps[largestIdx]) largestIdx = i;
  const largestGap = gaps[largestIdx];
  // The planet following the largest gap leads the occupied arc.
  const leading = sorted[(largestIdx + 1) % n].planet;
  const base = { largestGap, handle: null, leading };

  if (largestGap >= 240) return { ...base, type: "bundle" };
  if (largestGap >= 180) return { ...base, type: "bowl" };

  // Bucket: one planet isolated by 60°+ on both sides, the other nine in
  // a half-circle.
  for (let i = 0; i < n; i++) {
    const before = gaps[(i - 1 + n) % n];
    const after = gaps[i];
    if (before >= GROUP_GAP && after >= GROUP_GAP && before + after >= 180) {
      // The rest span 360 − (before + after + 0)… verify they fit in 180°.
      const restSpan = 360 - before - after;
      if (restSpan <= 180) {
        return {
          ...base,
          type: "bucket",
          handle: sorted[i].planet,
          leading: sorted[(i + 1) % n].planet,
        };
      }
    }
  }

  // Two opposing groups (two empty arcs of 60°+) are a seesaw even when one
  // of the arcs reaches a third of the wheel; the single-gap shapes come
  // after.
  const bigGaps = gaps.filter((g) => g >= GROUP_GAP).length;
  if (bigGaps === 2) return { ...base, type: "seesaw" };
  if (bigGaps >= 3) return { ...base, type: "splay" };
  if (largestGap >= 120) return { ...base, type: "locomotive" };
  if (bigGaps === 0) return { ...base, type: "splash" };
  return { ...base, type: "splay" };
}

// --- element / modality lack -----------------------------------------------

export interface ClassBalance<K extends string> {
  counts: Record<K, number>;
  /** Classes with no planet at all. */
  missing: K[];
  /** Classes with exactly one planet. */
  weak: K[];
}

function balanceBy<K extends string>(
  placements: Placement[],
  classOf: Record<Sign, K>,
  order: K[],
): ClassBalance<K> {
  const counts = Object.fromEntries(order.map((k) => [k, 0])) as Record<K, number>;
  for (const p of placements) counts[classOf[p.sign]]++;
  return {
    counts,
    missing: order.filter((k) => counts[k] === 0),
    weak: order.filter((k) => counts[k] === 1),
  };
}

export function elementBalance(placements: Placement[]): ClassBalance<Element> {
  return balanceBy(placements, SIGN_ELEMENTS, ELEMENTS);
}

export function modalityBalance(
  placements: Placement[],
): ClassBalance<Modality> {
  return balanceBy(placements, SIGN_MODALITIES, MODALITIES);
}

// --- dispositors ------------------------------------------------------------

/** Modern co-rulers, for the reference column only. */
export const MODERN_RULERS: Partial<Record<Sign, Planet>> = {
  scorpio: "pluto",
  aquarius: "uranus",
  pisces: "neptune",
};

export interface Dispositors {
  /** Each planet's traditional dispositor (the ruler of its sign). A planet
   *  in its own sign disposes itself. */
  dispositorOf: Record<Planet, Planet>;
  /** Planets in domicile — every chain that reaches one stops there. */
  inDomicile: Planet[];
  /** The single planet every chain ends in, when there is exactly one
   *  domicile planet and no closed loop bypasses it. */
  finalDispositor: Planet | null;
  /** Pairs disposing each other (mutual reception by sign). */
  mutualReceptions: Array<[Planet, Planet]>;
  /** Closed rings of three or more (rare); listed in chain order. */
  loops: Planet[][];
}

export function dispositors(placements: Placement[]): Dispositors {
  const signOf = new Map(placements.map((p) => [p.planet, p.sign]));
  const dispositorOf = {} as Record<Planet, Planet>;
  for (const p of placements) {
    dispositorOf[p.planet] = TRADITIONAL_RULERS[p.sign];
  }
  const planets = placements.map((p) => p.planet);
  const inDomicile = planets.filter((p) => dispositorOf[p] === p);

  const mutualReceptions: Array<[Planet, Planet]> = [];
  const loops: Planet[][] = [];
  const seenInLoop = new Set<Planet>();
  for (const start of planets) {
    if (seenInLoop.has(start) || dispositorOf[start] === start) continue;
    // Walk until a repeat; if we return to `start`, that's a loop.
    const path: Planet[] = [start];
    let cur = dispositorOf[start];
    while (!path.includes(cur) && dispositorOf[cur] !== cur) {
      path.push(cur);
      cur = dispositorOf[cur];
    }
    if (cur === start) {
      const loop = path;
      loop.forEach((p) => seenInLoop.add(p));
      if (loop.length === 2) {
        mutualReceptions.push([loop[0], loop[1]]);
      } else {
        loops.push(loop);
      }
    }
  }

  // Final dispositor: exactly one domicile planet, and every other chain
  // reaches it (no loop cuts a chain short).
  let finalDispositor: Planet | null = null;
  if (inDomicile.length === 1) {
    const target = inDomicile[0];
    const allReach = planets.every((p) => {
      let cur = p;
      for (let i = 0; i < planets.length + 1; i++) {
        if (cur === target) return true;
        cur = dispositorOf[cur];
      }
      return false;
    });
    if (allReach) finalDispositor = target;
  }

  void signOf;
  return { dispositorOf, inDomicile, finalDispositor, mutualReceptions, loops };
}

// --- house rulers -----------------------------------------------------------

export interface HouseRuler {
  house: number;
  cuspSign: Sign;
  ruler: Planet;
  /** Modern co-ruler where one exists (Scorpio, Aquarius, Pisces). */
  modernRuler: Planet | null;
  /** The house the ruler occupies. */
  rulerHouse: number;
  /** The ruler's sign. */
  rulerSign: Sign;
}

/** Null on a solar chart. */
export function houseRulers(
  houses: Houses | null,
  placements: Placement[],
): HouseRuler[] | null {
  if (!houses) return null;
  const byPlanet = new Map(placements.map((p) => [p.planet, p]));
  return houses.cusps.map((cusp, i) => {
    const cuspSign = SIGNS[Math.floor((((cusp % 360) + 360) % 360) / 30)];
    const ruler = TRADITIONAL_RULERS[cuspSign];
    const placement = byPlanet.get(ruler)!;
    return {
      house: i + 1,
      cuspSign,
      ruler,
      modernRuler: MODERN_RULERS[cuspSign] ?? null,
      rulerHouse: placement.house ?? 0,
      rulerSign: placement.sign,
    };
  });
}

// --- everything -------------------------------------------------------------

export interface ChartStats {
  hemispheres: HemisphereEmphasis | null;
  shape: ChartShape;
  elements: ClassBalance<Element>;
  modalities: ClassBalance<Modality>;
  dispositors: Dispositors;
  houseRulers: HouseRuler[] | null;
}

export function computeChartStats(
  placements: Placement[],
  houses: Houses | null,
): ChartStats {
  return {
    hemispheres: hemisphereEmphasis(placements),
    shape: chartShape(placements),
    elements: elementBalance(placements),
    modalities: modalityBalance(placements),
    dispositors: dispositors(placements),
    houseRulers: houseRulers(houses, placements),
  };
}
