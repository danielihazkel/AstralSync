import type { Placement, Planet } from "@astralsync/astro-core";

/**
 * Row-building for the two-ring wheels' table view (TwoRingTable): pair two
 * placement sets by planet. Pure so node-env tests cover it without a DOM.
 */

export interface TwoRingRow {
  planet: Planet;
  left: Placement;
  right: Placement;
}

/** Pair `left` and `right` by planet, preserving `left`'s order. Planets
 *  missing from either side are dropped (both rings carry the same ten in
 *  practice). */
export function pairPlacements(
  left: Placement[],
  right: Placement[],
): TwoRingRow[] {
  const byPlanet = new Map(right.map((p) => [p.planet, p]));
  return left.flatMap((l) => {
    const r = byPlanet.get(l.planet);
    return r ? [{ planet: l.planet, left: l, right: r }] : [];
  });
}
