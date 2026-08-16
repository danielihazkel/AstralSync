/**
 * Memoize a time→degrees function on the exact timestamp (ms since epoch).
 *
 * Scans that walk the same coarse grid for several bodies (the VoC scan asks
 * for the Moon's longitude at identical hourly samples once per aspect
 * partner) re-evaluate an expensive pure function of the instant. Keying on
 * the exact millisecond is correct by construction — same input, same value —
 * so bisection refinement is unaffected; never round or bucket the key.
 *
 * The cache lives in the returned closure: create one per computation so it
 * dies with the call instead of growing for the session.
 */
export function memoizeByMs(fn: (t: Date) => number): (t: Date) => number {
  const cache = new Map<number, number>();
  return (t: Date) => {
    const key = t.getTime();
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const value = fn(t);
    cache.set(key, value);
    return value;
  };
}
