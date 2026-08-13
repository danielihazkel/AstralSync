export const DEG = Math.PI / 180;

/** Normalize an angle to [0, 360). */
export function norm360(deg: number): number {
  const x = deg % 360;
  return x < 0 ? x + 360 : x;
}

/** Signed smallest difference a − b, in (−180, 180]. */
export function angleDiff(a: number, b: number): number {
  let d = norm360(a - b);
  if (d > 180) d -= 360;
  return d;
}

/** Unsigned angular separation in [0, 180]. */
export function separation(a: number, b: number): number {
  return Math.abs(angleDiff(a, b));
}

/** Shorter-arc midpoint of two longitudes. Exact oppositions are ambiguous;
 *  angleDiff maps them to +180, so the midpoint deterministically lands 90°
 *  east of `a`. */
export function circularMidpoint(a: number, b: number): number {
  return norm360(a + angleDiff(b, a) / 2);
}

/** Julian Day for a JS Date (UTC). */
export function julianDay(utc: Date): number {
  return utc.getTime() / 86_400_000 + 2_440_587.5;
}

/** Mean obliquity of the ecliptic (IAU 2006), degrees. Nutation (±9″) is
 *  negligible at the arcminute precision astrology requires. */
export function meanObliquity(utc: Date): number {
  const t = (julianDay(utc) - 2_451_545.0) / 36_525;
  const seconds =
    84381.406 - 46.836769 * t - 0.0001831 * t * t + 0.0020034 * t * t * t;
  return seconds / 3600;
}
