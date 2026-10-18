import type { Placement, Planet } from "@astralsync/astro-core";
import { PLANET_NAMES } from "@/components/format";

/**
 * Which natal points an eclipse lands on. An eclipse is read personally
 * when its degree falls on (conjunction) or across from (opposition) a
 * natal planet or angle — the axis an eclipse activates is the nodal axis,
 * so both ends count. Pure and client-safe — type-only engine imports, so
 * the Today strip can use it without loading the engine: the transit
 * calendar, the Today strip and the notification scheduler share it.
 */

/** Angular distance, [0, 180]. */
function separation(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** Degrees either side of exact. Eclipse orbs are conventionally tight; 3°
 *  keeps a year's four-to-six eclipses from touching every chart. */
export const ECLIPSE_ORB = 3;

export type EclipsePoint = Planet | "ascendant" | "mc";

export interface EclipseContact {
  point: EclipsePoint;
  type: "conjunction" | "opposition";
  orb: number;
}

export interface NatalPoint {
  point: EclipsePoint;
  longitude: number;
}

/** The natal points worth checking: the planets, plus the Ascendant and MC
 *  when the chart has them. A solar chart's Moon degree is a noon guess
 *  that can be off by six degrees, so it is left out there. */
export function natalEclipsePoints(chart: {
  placements: Array<Pick<Placement, "planet" | "longitude">>;
  houses?: { ascendant: number; mc: number } | null;
  isSolarChart?: boolean;
}): NatalPoint[] {
  const points: NatalPoint[] = chart.placements
    .filter((p) => !(chart.isSolarChart && p.planet === "moon"))
    .map((p) => ({ point: p.planet, longitude: p.longitude }));
  if (chart.houses && !chart.isSolarChart) {
    points.push(
      { point: "ascendant", longitude: chart.houses.ascendant },
      { point: "mc", longitude: chart.houses.mc },
    );
  }
  return points;
}

const POINT_NAMES: Record<EclipsePoint, string> = {
  ...PLANET_NAMES,
  ascendant: "Ascendant",
  mc: "Midheaven",
};

/** "on natal Sun (1.2°), opposite natal Ascendant (2.0°)". */
export function describeEclipseContacts(contacts: EclipseContact[]): string {
  return contacts
    .map(
      (c) =>
        `${c.type === "conjunction" ? "on" : "opposite"} natal ${POINT_NAMES[c.point]} (${c.orb.toFixed(1)}°)`,
    )
    .join(", ");
}

/** The natal points within `orb` of the eclipse degree or its opposite,
 *  tightest first. */
export function eclipseContacts(
  eclipseLongitude: number,
  points: NatalPoint[],
  orb = ECLIPSE_ORB,
): EclipseContact[] {
  const out: EclipseContact[] = [];
  for (const { point, longitude } of points) {
    const sep = separation(eclipseLongitude, longitude);
    if (sep <= orb) out.push({ point, type: "conjunction", orb: sep });
    else if (180 - sep <= orb) out.push({ point, type: "opposition", orb: 180 - sep });
  }
  return out.sort((a, b) => a.orb - b.orb);
}
