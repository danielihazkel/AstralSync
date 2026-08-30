import * as Astronomy from "astronomy-engine";
import { julianDay, norm360 } from "./angles";
import { signOf } from "./chart";
import type { Sign } from "./types";

/**
 * Calculated chart points beyond the ten planets: the lunar nodes and mean
 * Black Moon Lilith. Kept out of `Planet`/`PLANETS` on purpose — stored
 * snapshots, aspect detection, dominance, and content keys are all keyed by
 * planet and must stay byte-identical. Points are ephemeral: recomputed from
 * the snapshot's stored UTC instant on every read, never persisted.
 *
 * Chiron is deliberately absent: astronomy-engine has no ephemeris for it,
 * and two-body propagation from published elements drifts by degrees over
 * decades. Revisit if a Swiss Ephemeris provider lands.
 */

export type PointName =
  | "north_node"
  | "south_node"
  | "lilith"
  | "part_of_fortune"
  | "part_of_spirit"
  | "vertex"
  | "east_point";
export type NodeVariant = "mean" | "true";

export interface PointPlacement {
  point: PointName;
  /** Tropical ecliptic longitude of date, degrees [0, 360). */
  longitude: number;
  sign: Sign;
  /** Degrees into the sign, [0, 30). */
  degreeInSign: number;
  /** 1–12 via house overlay, or null on a solar chart. */
  house: number | null;
  retrograde: boolean;
}

/** Julian centuries since J2000.0. TT−UTC (~70 s) shifts the node by under
 *  0.0001° and is ignored. */
function centuries(utc: Date): number {
  return (julianDay(utc) - 2_451_545.0) / 36_525;
}

/** Mean ascending lunar node (Meeus, Astronomical Algorithms ch. 47). */
export function meanNode(utc: Date): number {
  const t = centuries(utc);
  return norm360(
    125.0445479 -
      1934.1362891 * t +
      0.0020754 * t * t +
      (t * t * t) / 467_441 -
      (t * t * t * t) / 60_616_000,
  );
}

/** Mean Black Moon Lilith: the mean lunar apogee, i.e. the Meeus mean perigee
 *  (ch. 47, argument of latitude companion series) plus 180°. */
export function meanLilith(utc: Date): number {
  const t = centuries(utc);
  const perigee =
    83.3532465 +
    4069.0137287 * t -
    0.01032 * t * t -
    (t * t * t) / 80_053 +
    (t * t * t * t) / 18_999_000;
  return norm360(perigee + 180);
}

/** Moon's geocentric position in ecliptic-of-date cartesian coordinates. */
function moonEclipticVec(utc: Date): { x: number; y: number; z: number } {
  const { vec } = Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body.Moon, utc, true));
  return { x: vec.x, y: vec.y, z: vec.z };
}

/**
 * True (osculating) ascending node from the instantaneous orbit: with the
 * Moon's ecliptic position r and velocity v, the orbit normal is h = r × v
 * and the ascending-node direction is ẑ × h, giving Ω = atan2(h_x, −h_y).
 * When the Moon sits exactly on the ecliptic this reduces to the Moon's own
 * longitude — the property the tests pin against SearchMoonNode crossings.
 */
export function trueNode(utc: Date): number {
  const dtMs = 3_600_000; // ±1 hour central difference for velocity
  const r = moonEclipticVec(utc);
  const before = moonEclipticVec(new Date(utc.getTime() - dtMs));
  const after = moonEclipticVec(new Date(utc.getTime() + dtMs));
  const v = {
    x: (after.x - before.x) / 2,
    y: (after.y - before.y) / 2,
    z: (after.z - before.z) / 2,
  };
  const hx = r.y * v.z - r.z * v.y;
  const hy = r.z * v.x - r.x * v.z;
  return norm360(Math.atan2(hx, -hy) / (Math.PI / 180));
}

function toPlacement(point: PointName, longitude: number, retrograde: boolean): PointPlacement {
  return {
    point,
    longitude,
    sign: signOf(longitude),
    degreeInSign: norm360(longitude) % 30,
    house: null,
    retrograde,
  };
}

/**
 * All chart points at an instant. `house` is null — overlay against a chart's
 * cusps with `overlayHouses` (it is generic over `{longitude}` shapes via
 * `houseOf`; see lib usage). The mean node is always retrograde; the true
 * node's direction is taken from its own daily motion; Lilith is prograde.
 */
export function pointsAt(
  utc: Date,
  nodeVariant: NodeVariant = "true",
): PointPlacement[] {
  const node = nodeVariant === "mean" ? meanNode(utc) : trueNode(utc);
  let nodeRetrograde = true;
  if (nodeVariant === "true") {
    const dayMs = 86_400_000;
    const prev = trueNode(new Date(utc.getTime() - dayMs));
    // Signed motion over one day; the true node wobbles and can run direct.
    let motion = norm360(node - prev);
    if (motion > 180) motion -= 360;
    nodeRetrograde = motion < 0;
  }
  return [
    toPlacement("north_node", node, nodeRetrograde),
    toPlacement("south_node", norm360(node + 180), nodeRetrograde),
    toPlacement("lilith", meanLilith(utc), false),
  ];
}
