import {
  SIGNS,
  type AspectType,
  type CrossAspect,
  type Placement,
  type Planet,
  type Sign,
} from "@astralsync/astro-core";
import type { WheelChart } from "@/lib/view-types";

/**
 * Pure geometry for the SVG chart wheel — no React, no DOM. `layoutWheel`
 * maps a stored chart snapshot to positioned SVG primitives; the rendering
 * component just draws what it's given.
 *
 * Conventions:
 * - Screen angles are degrees measured counterclockwise from 3 o'clock
 *   (mathematical convention; `polarToXY` flips the y-axis for SVG).
 * - The Ascendant is anchored at 180° (9 o'clock), the traditional chart
 *   orientation, and zodiacal longitude increases counterclockwise.
 * - Solar charts (no houses) anchor 0° Aries at 9 o'clock instead.
 */

export interface Point {
  x: number;
  y: number;
}

export interface WheelLayout {
  size: number;
  center: Point;
  radii: {
    outer: number;
    signInner: number;
    planetRing: number;
    hub: number;
  };
  signs: { sign: Sign; path: string; labelPoint: Point }[];
  houses:
    | {
        house: number;
        from: Point;
        to: Point;
        labelPoint: Point;
      }[]
    | null;
  angles: { ascendant: Point; ascendantInner: Point; mc: Point; mcInner: Point } | null;
  planets: {
    planet: Planet;
    /** Screen angle of the true longitude (ticks, aspect endpoints). */
    angle: number;
    /** Collision-adjusted screen angle (glyph placement only). */
    displayAngle: number;
    glyphPoint: Point;
    tickFrom: Point;
    tickTo: Point;
    retrograde: boolean;
  }[];
  aspects: {
    a: Planet;
    b: Planet;
    type: AspectType;
    orb: number;
    from: Point;
    to: Point;
  }[];
}

export function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Rotation such that `longitudeToScreenAngle(rotation) === 180`. */
export function wheelRotation(chart: Pick<WheelChart, "houses">): number {
  return chart.houses ? chart.houses.ascendant : 0;
}

/** Ecliptic longitude → screen angle (CCW, Ascendant/0° Aries at 180°). */
export function longitudeToScreenAngle(lon: number, rotation: number): number {
  return norm360(180 + lon - rotation);
}

/** Polar → SVG coordinates (y grows downward, so the y term is negated). */
export function polarToXY(center: Point, r: number, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: center.x + r * Math.cos(rad),
    y: center.y - r * Math.sin(rad),
  };
}

/**
 * Fan out clustered angles so glyphs don't overlap: angles closer than
 * `minSepDeg` (including across the 0°/360° wrap) are grouped and spread
 * symmetrically about the group's centroid, preserving zodiacal order.
 * Returns adjusted angles in the input's order.
 */
export function spreadClusters(
  anglesDeg: number[],
  minSepDeg: number,
): number[] {
  const n = anglesDeg.length;
  if (n < 2) return anglesDeg.map(norm360);

  const sorted = anglesDeg
    .map((angle, index) => ({ angle: norm360(angle), index }))
    .sort((p, q) => p.angle - q.angle);

  // Greedy grouping along the sorted circle.
  const groups: { angle: number; index: number }[][] = [[sorted[0]]];
  for (let i = 1; i < n; i++) {
    const prev = sorted[i - 1];
    if (sorted[i].angle - prev.angle < minSepDeg) {
      groups[groups.length - 1].push(sorted[i]);
    } else {
      groups.push([sorted[i]]);
    }
  }
  // Wrap-around: merge the last group into the first when they touch across 0°.
  if (groups.length > 1) {
    const first = groups[0];
    const last = groups[groups.length - 1];
    const wrapGap = first[0].angle + 360 - last[last.length - 1].angle;
    if (wrapGap < minSepDeg) {
      // Shift the last group below 0 so the merged group is monotonic.
      groups.pop();
      groups[0] = [
        ...last.map((p) => ({ ...p, angle: p.angle - 360 })),
        ...first,
      ];
    }
  }

  const out = new Array<number>(n);
  for (const group of groups) {
    const centroid =
      group.reduce((sum, p) => sum + p.angle, 0) / group.length;
    group.forEach((p, k) => {
      const offset = (k - (group.length - 1) / 2) * minSepDeg;
      out[p.index] = norm360(centroid + offset);
    });
  }
  return out;
}

/** Annular-sector path between screen angles [a1, a2] (a2 > a1, CCW). */
function sectorPath(
  center: Point,
  rInner: number,
  rOuter: number,
  a1: number,
  a2: number,
): string {
  const p1 = polarToXY(center, rOuter, a1);
  const p2 = polarToXY(center, rOuter, a2);
  const p3 = polarToXY(center, rInner, a2);
  const p4 = polarToXY(center, rInner, a1);
  const fmt = (p: Point) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  // CCW screen sweep = SVG sweep-flag 0 (SVG's positive rotation is CW).
  return [
    `M ${fmt(p1)}`,
    `A ${rOuter} ${rOuter} 0 0 0 ${fmt(p2)}`,
    `L ${fmt(p3)}`,
    `A ${rInner} ${rInner} 0 0 1 ${fmt(p4)}`,
    "Z",
  ].join(" ");
}

export const DEFAULT_WHEEL_SIZE = 600;
/** Minimum angular separation between planet glyphs, degrees. */
export const GLYPH_MIN_SEPARATION = 9;

export function layoutWheel(
  chart: WheelChart,
  size: number = DEFAULT_WHEEL_SIZE,
): WheelLayout {
  const center: Point = { x: size / 2, y: size / 2 };
  const outer = size / 2 - 24; // margin for ASC/MC labels outside the ring
  const radii = {
    outer,
    signInner: outer * 0.85,
    planetRing: outer * 0.68,
    hub: outer * 0.53,
  };
  const rotation = wheelRotation(chart);

  const signs = SIGNS.map((sign, i) => {
    const a1 = longitudeToScreenAngle(i * 30, rotation);
    const a2 = a1 + 30; // sectorPath needs a monotonic CCW pair
    return {
      sign,
      path: sectorPath(center, radii.signInner, radii.outer, a1, a2),
      labelPoint: polarToXY(
        center,
        (radii.signInner + radii.outer) / 2,
        a1 + 15,
      ),
    };
  });

  const houses = chart.houses
    ? chart.houses.cusps.map((cusp, i) => {
        const a = longitudeToScreenAngle(cusp, rotation);
        const nextCusp = chart.houses!.cusps[(i + 1) % 12];
        const span = norm360(nextCusp - cusp) || 30;
        const mid = longitudeToScreenAngle(cusp + span / 2, rotation);
        return {
          house: i + 1,
          from: polarToXY(center, radii.hub, a),
          to: polarToXY(center, radii.signInner, a),
          labelPoint: polarToXY(center, radii.hub * 0.88, mid),
        };
      })
    : null;

  const angles = chart.houses
    ? {
        ascendant: polarToXY(
          center,
          outer + 13,
          longitudeToScreenAngle(chart.houses.ascendant, rotation),
        ),
        ascendantInner: polarToXY(
          center,
          radii.hub,
          longitudeToScreenAngle(chart.houses.ascendant, rotation),
        ),
        mc: polarToXY(
          center,
          outer + 13,
          longitudeToScreenAngle(chart.houses.mc, rotation),
        ),
        mcInner: polarToXY(
          center,
          radii.hub,
          longitudeToScreenAngle(chart.houses.mc, rotation),
        ),
      }
    : null;

  const rawAngles = chart.placements.map((p) =>
    longitudeToScreenAngle(p.longitude, rotation),
  );
  const displayAngles = spreadClusters(rawAngles, GLYPH_MIN_SEPARATION);
  const planets = chart.placements.map((p, i) => ({
    planet: p.planet,
    angle: rawAngles[i],
    displayAngle: displayAngles[i],
    glyphPoint: polarToXY(center, radii.planetRing, displayAngles[i]),
    tickFrom: polarToXY(center, radii.signInner, rawAngles[i]),
    tickTo: polarToXY(center, radii.signInner - 7, rawAngles[i]),
    retrograde: p.retrograde,
  }));

  const angleByPlanet = new Map(
    chart.placements.map((p, i) => [p.planet, rawAngles[i]]),
  );
  const aspects = chart.aspects.map((a) => ({
    a: a.a,
    b: a.b,
    type: a.type,
    orb: a.orb,
    from: polarToXY(center, radii.hub, angleByPlanet.get(a.a) ?? 0),
    to: polarToXY(center, radii.hub, angleByPlanet.get(a.b) ?? 0),
  }));

  return { size, center, radii, signs, houses, angles, planets, aspects };
}

/** Width of the annular band reserved for transiting bodies. */
export const TRANSIT_RING_WIDTH = 40;

export interface TransitWheelLayout {
  size: number;
  /** Center of the full-size wheel (overlay coordinates). */
  center: Point;
  /** Natal wheel laid out at `size − 2·TRANSIT_RING_WIDTH`. Render it inside
   *  `translate(baseOffset, baseOffset)` so its center lands on `center` —
   *  the sign-sector paths are baked strings, so the renderer translates the
   *  whole group rather than this module shifting every coordinate. */
  base: WheelLayout;
  baseOffset: number;
  /** Outer boundary circle of the transit band, centered on `center`. */
  ringRadius: number;
  /** Transiting bodies in the outer band (full-size coordinates). */
  planets: WheelLayout["planets"];
  /** Inter-ring chords: transit body (band inner edge) → natal body (hub). */
  crossAspects: {
    a: Planet;
    b: Planet;
    type: AspectType;
    orb: number;
    from: Point;
    to: Point;
  }[];
}

/**
 * Two-ring transit wheel: the natal wheel shrunk to free an outer annulus,
 * transiting glyphs in the band, and cross-aspect chords diving from the
 * band's inner edge to the natal hub (visually distinct from natal aspects,
 * which stay hub-to-hub). Both rings share the natal rotation so longitudes
 * align radially; a solar natal anchors 0° Aries as usual.
 */
export function layoutTransitWheel(
  natal: WheelChart,
  transit: { placements: Placement[]; crossAspects: CrossAspect[] },
  size: number = DEFAULT_WHEEL_SIZE,
): TransitWheelLayout {
  const base = layoutWheel(natal, size - 2 * TRANSIT_RING_WIDTH);
  const center: Point = { x: size / 2, y: size / 2 };
  const rotation = wheelRotation(natal);

  const rawAngles = transit.placements.map((p) =>
    longitudeToScreenAngle(p.longitude, rotation),
  );
  // Fanned per-ring: transit glyphs dodge each other, not the natal ring.
  const displayAngles = spreadClusters(rawAngles, GLYPH_MIN_SEPARATION);
  const planets = transit.placements.map((p, i) => ({
    planet: p.planet,
    angle: rawAngles[i],
    displayAngle: displayAngles[i],
    glyphPoint: polarToXY(center, base.radii.outer + 22, displayAngles[i]),
    tickFrom: polarToXY(center, base.radii.outer, rawAngles[i]),
    tickTo: polarToXY(center, base.radii.outer + 7, rawAngles[i]),
    retrograde: p.retrograde,
  }));

  const natalAngleByPlanet = new Map(
    natal.placements.map((p) => [
      p.planet,
      longitudeToScreenAngle(p.longitude, rotation),
    ]),
  );
  const transitAngleByPlanet = new Map(
    transit.placements.map((p, i) => [p.planet, rawAngles[i]]),
  );
  const crossAspects = transit.crossAspects.map((c) => ({
    a: c.a,
    b: c.b,
    type: c.type,
    orb: c.orb,
    from: polarToXY(center, base.radii.outer, transitAngleByPlanet.get(c.a) ?? 0),
    to: polarToXY(center, base.radii.hub, natalAngleByPlanet.get(c.b) ?? 0),
  }));

  return {
    size,
    center,
    base,
    baseOffset: TRANSIT_RING_WIDTH,
    ringRadius: base.radii.outer + TRANSIT_RING_WIDTH - 4,
    planets,
    crossAspects,
  };
}

export type BiWheelLayout = TransitWheelLayout;

/**
 * Synastry bi-wheel: person A (inner, with houses) and person B (outer band)
 * share the transit geometry, but the aspect convention flips — synastry
 * cross aspects carry `a` = person A's planet (inner) while
 * `layoutTransitWheel` expects `a` = the outer body. Endpoints are swapped on
 * the way in and the fields swapped back on the way out, so returned chords
 * keep the synastry convention: `from` = band inner edge at B's angle,
 * `to` = hub at A's angle.
 */
export function layoutBiWheel(
  inner: WheelChart,
  outer: { placements: Placement[]; crossAspects: CrossAspect[] },
  size: number = DEFAULT_WHEEL_SIZE,
): BiWheelLayout {
  const layout = layoutTransitWheel(
    inner,
    {
      placements: outer.placements,
      crossAspects: outer.crossAspects.map((c) => ({ ...c, a: c.b, b: c.a })),
    },
    size,
  );
  return {
    ...layout,
    crossAspects: layout.crossAspects.map((c) => ({ ...c, a: c.b, b: c.a })),
  };
}
