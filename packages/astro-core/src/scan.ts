import * as Astronomy from "astronomy-engine";
import { angleDiff, norm360 } from "./angles";
import { astronomyEngineProvider } from "./ephemeris/astronomyEngine";
import type { EphemerisProvider } from "./ephemeris/interface";
import type { Planet } from "./types";
import { PLANETS } from "./types";

/**
 * Time-domain scanning: find the instants where an angle crosses a target.
 * Generalizes the root-finding that lib/cycles.ts (slow-planet returns) and
 * lib/today.ts (void-of-course) hand-roll for their own cases; consumers are
 * the transit calendar, the moon calendar, and the electional picker.
 *
 * Method everywhere: coarse samples bracket a crossing (the caller's step
 * must keep per-step motion well under 90° so nothing hides between
 * samples), then Astronomy.Search refines the bracket. Search finds
 * ascending roots only, so descending crossings (retrograde re-passes)
 * negate the delta. Brackets that straddle the ±180° wrap are the far point
 * of the cycle, not a crossing, and are skipped by the |delta| < 90° guard.
 */

export interface ScanHit {
  utc: Date;
  /** The target value that was crossed, as passed in. */
  target: number;
  /** True when the signed delta was increasing through zero. */
  ascending: boolean;
}

const MS_PER_DAY = 86_400_000;

function refine(
  deltaAt: (t: Date) => number,
  from: Date,
  to: Date,
  ascending: boolean,
): Date | null {
  const found = Astronomy.Search(
    (t) => (ascending ? deltaAt(t.date) : -deltaAt(t.date)),
    Astronomy.MakeTime(from),
    Astronomy.MakeTime(to),
  );
  return found ? found.date : null;
}

/**
 * All instants in [from, to] where `valueAt` (degrees, any range) crosses
 * any of `targets`, in time order. Both directions count.
 */
export function findLongitudeCrossings(
  valueAt: (t: Date) => number,
  targets: number[],
  from: Date,
  to: Date,
  stepMs: number,
): ScanHit[] {
  const out: ScanHit[] = [];
  let prevT = from;
  // One ephemeris evaluation per sample, shared across all targets — with
  // 12 sign boundaries (or 8 signed aspect angles) a per-target call would
  // multiply the dominant cost of every scan by that factor.
  const prevVal = valueAt(prevT);
  let prevD = targets.map((v) => angleDiff(prevVal, v));
  while (prevT.getTime() < to.getTime()) {
    const t = new Date(Math.min(prevT.getTime() + stepMs, to.getTime()));
    const val = valueAt(t);
    const d = targets.map((v) => angleDiff(val, v));
    for (let i = 0; i < targets.length; i++) {
      const d0 = prevD[i];
      const d1 = d[i];
      if (Math.abs(d0) < 90 && Math.abs(d1) < 90 && d0 * d1 < 0) {
        const deltaAt = (x: Date) => angleDiff(valueAt(x), targets[i]);
        const found = refine(deltaAt, prevT, t, d1 > d0);
        if (found) out.push({ utc: found, target: targets[i], ascending: d1 > d0 });
      }
    }
    prevT = t;
    prevD = d;
  }
  return out.sort((a, b) => a.utc.getTime() - b.utc.getTime());
}

const SIGN_BOUNDARIES = Array.from({ length: 12 }, (_, i) => i * 30);

/** Sampling steps that keep per-step motion far under the 90° wrap guard:
 *  the Moon moves ≤ ~15°/day, Mercury ≤ ~2.2°/day, Jupiter+ ≤ ~0.24°/day.
 *  Safe for any longitude/aspect scan against a slow or fixed target, not
 *  just ingresses — exported so new scan callers don't grow their own
 *  step tables. */
export const PLANET_SCAN_STEP_MS: Record<Planet, number> = {
  sun: MS_PER_DAY,
  moon: MS_PER_DAY / 4,
  mercury: MS_PER_DAY,
  venus: MS_PER_DAY,
  mars: MS_PER_DAY,
  jupiter: 10 * MS_PER_DAY,
  saturn: 10 * MS_PER_DAY,
  uranus: 10 * MS_PER_DAY,
  neptune: 10 * MS_PER_DAY,
  pluto: 10 * MS_PER_DAY,
};

export interface IngressEvent extends ScanHit {
  planet: Planet;
  /** The sign entered (as a 0-based index into the zodiac from Aries). */
  signIndex: number;
}

/**
 * Sign ingresses of a planet within [from, to]. A retrograde planet crossing
 * a boundary backwards is an ingress into the *earlier* sign (ascending
 * false); signIndex reflects the sign actually entered.
 */
export function findIngresses(
  planet: Planet,
  from: Date,
  to: Date,
  provider: EphemerisProvider = astronomyEngineProvider,
): IngressEvent[] {
  const hits = findLongitudeCrossings(
    (t) => provider.eclipticLongitude(planet, t),
    SIGN_BOUNDARIES,
    from,
    to,
    PLANET_SCAN_STEP_MS[planet],
  );
  return hits.map((h) => {
    const boundary = Math.round(norm360(h.target) / 30) % 12;
    return {
      ...h,
      planet,
      signIndex: h.ascending ? boundary : (boundary + 11) % 12,
    };
  });
}

export interface AspectHit {
  utc: Date;
  /** The aspect angle perfected, in [0, 180]. */
  angle: number;
  /** True when the signed separation was increasing at the hit. */
  ascending: boolean;
}

/**
 * Instants in [from, to] where the signed separation moving−fixed perfects
 * one of `aspectAngles` (values in [0, 180], e.g. [0, 60, 90, 120, 180]).
 * `fixedLonAt` is a function so the "fixed" body may itself move (VoC scans
 * against a moving Sun); pass `() => lon` for a natal longitude.
 */
export function findAspectHits(
  movingLonAt: (t: Date) => number,
  fixedLonAt: (t: Date) => number,
  aspectAngles: number[],
  from: Date,
  to: Date,
  stepMs: number,
): AspectHit[] {
  // Signed targets: ±60 etc. both perfect the sextile; 0 and 180 are their
  // own reflections.
  const targets: number[] = [];
  for (const a of aspectAngles) {
    targets.push(a);
    if (a !== 0 && a !== 180) targets.push(-a);
  }
  const hits = findLongitudeCrossings(
    (t) => angleDiff(movingLonAt(t), fixedLonAt(t)),
    targets,
    from,
    to,
    stepMs,
  );
  return hits.map((h) => ({
    utc: h.utc,
    angle: Math.abs(h.target),
    ascending: h.ascending,
  }));
}

export interface MundaneAspectHit {
  /** The faster body of the pair (by mean geocentric motion). */
  a: Planet;
  b: Planet;
  /** The aspect angle perfected, in [0, 180]. */
  angle: number;
  utc: Date;
}

/** Mean geocentric daily motion, fastest first — fixes each pair's (a, b)
 *  orientation and its sampling step. */
const SPEED_ORDER: Planet[] = [
  "moon",
  "mercury",
  "venus",
  "sun",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];

const MAJOR_ASPECT_ANGLES = [0, 60, 90, 120, 180];

/**
 * Exact perfection instants (no orb semantics) of `angles` between every
 * pair drawn from `planets`, in time order. Relative motion is bounded by
 * the faster body's own motion, so each pair samples at half that body's
 * ingress step — comfortably under the 90° wrap guard even when the pair
 * closes head-on.
 */
export function findMundaneAspects(
  from: Date,
  to: Date,
  opts?: {
    planets?: Planet[];
    angles?: number[];
    provider?: EphemerisProvider;
  },
): MundaneAspectHit[] {
  const planets = opts?.planets ?? PLANETS;
  const angles = opts?.angles ?? MAJOR_ASPECT_ANGLES;
  const provider = opts?.provider ?? astronomyEngineProvider;
  const ordered = SPEED_ORDER.filter((p) => planets.includes(p));
  const out: MundaneAspectHit[] = [];
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i];
      const b = ordered[j];
      const hits = findAspectHits(
        (t) => provider.eclipticLongitude(a, t),
        (t) => provider.eclipticLongitude(b, t),
        angles,
        from,
        to,
        PLANET_SCAN_STEP_MS[a] / 2,
      );
      for (const h of hits) out.push({ a, b, angle: h.angle, utc: h.utc });
    }
  }
  return out.sort((x, y) => x.utc.getTime() - y.utc.getTime());
}

export interface StationEvent {
  planet: Planet;
  utc: Date;
  /** The motion the planet stations *into*. */
  direction: "retrograde" | "direct";
}

const STATIONING_PLANETS = PLANETS.filter(
  (p) => p !== "sun" && p !== "moon",
);

/**
 * Direction flips within [from, to]: daily samples of the retrograde flag,
 * with each flip bisected to ~1 minute.
 */
export function findStations(
  from: Date,
  to: Date,
  planets: Planet[] = STATIONING_PLANETS,
  provider: EphemerisProvider = astronomyEngineProvider,
): StationEvent[] {
  const out: StationEvent[] = [];
  for (const planet of planets) {
    let prevT = from;
    let prevRx = provider.isRetrograde(planet, prevT);
    while (prevT.getTime() < to.getTime()) {
      const t = new Date(Math.min(prevT.getTime() + MS_PER_DAY, to.getTime()));
      const rx = provider.isRetrograde(planet, t);
      if (rx !== prevRx) {
        let lo = prevT.getTime();
        let hi = t.getTime();
        while (hi - lo > 60_000) {
          const mid = (lo + hi) / 2;
          if (provider.isRetrograde(planet, new Date(mid)) === prevRx) lo = mid;
          else hi = mid;
        }
        out.push({
          planet,
          utc: new Date((lo + hi) / 2),
          direction: rx ? "retrograde" : "direct",
        });
      }
      prevT = t;
      prevRx = rx;
    }
  }
  return out.sort((a, b) => a.utc.getTime() - b.utc.getTime());
}
