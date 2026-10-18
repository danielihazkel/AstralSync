import {
  PLANETS,
  ascendant,
  eclipticToRightAscension,
  meanObliquity,
  midheaven,
  norm360,
  positionsAt,
  ramcAt,
  separation,
  signOf,
  type Planet,
  type Sign,
} from "@astralsync/astro-core";
import type { LifeEventCategory, LifeEventPrecision } from "./lifeEventMeta";
import { resolveBirthMoment } from "./tz";

/**
 * Birth-time sensitivity and rectification.
 *
 * Sensitivity: sweep candidate birth times across a window and say where
 * the time-sensitive points — the Ascendant, the MC, the Moon's sign —
 * change. For an approximate time that is the honest answer to "how much
 * of my chart can I trust?".
 *
 * Rectification: score each candidate by how well it times the recorded
 * life events, using the three classic time-sensitive techniques — solar-arc
 * directions to and from the angles, the progressed angles, and slow-planet
 * transits over the angles. The angles move about a degree every four
 * minutes, so these are what a birth time actually changes; everything
 * else in the chart is the same for every candidate.
 *
 * This is a reading aid, not an oracle: rectification is a contested art
 * and a handful of events can fit several times. The page says so, shows
 * its working per hit, and never edits the profile itself.
 */

/** Candidate birth time: local minutes since midnight on the birth date. */
export interface CandidateChart {
  minutes: number;
  utc: Date;
  ascendant: number;
  mc: number;
  /** The candidate's RAMC — the progressed angles advance it by solar arc
   *  in right ascension. */
  ramc: number;
  /** Natal longitudes at this candidate (only the Moon moves noticeably). */
  planets: Record<Planet, number>;
}

export interface BirthPlace {
  birthDate: { year: number; month: number; day: number };
  tzIana: string;
  lat: number;
  lng: number;
  /** A manual UTC offset override (PRD §3.1), applied verbatim. */
  overrideOffsetMinutes: number | null;
}

function anglesAt(utc: Date, lat: number, lng: number) {
  const eps = meanObliquity(utc);
  const ramc = ramcAt(utc, lng);
  return { ascendant: ascendant(ramc, lat, eps), mc: midheaven(ramc, eps), ramc };
}

function utcFor(place: BirthPlace, minutes: number): Date {
  const wall = {
    ...place.birthDate,
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
  };
  if (place.overrideOffsetMinutes !== null) {
    return new Date(
      Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute) -
        place.overrideOffsetMinutes * 60_000,
    );
  }
  return resolveBirthMoment(place.tzIana, wall).utc;
}

/** Candidates from `fromMinutes` to `toMinutes` (clamped to the birth
 *  day) every `stepMinutes`. */
export function sweepCandidates(
  place: BirthPlace,
  fromMinutes: number,
  toMinutes: number,
  stepMinutes: number,
): CandidateChart[] {
  const from = Math.max(0, fromMinutes);
  const to = Math.min(24 * 60 - 1, toMinutes);
  const out: CandidateChart[] = [];
  for (let minutes = from; minutes <= to; minutes += stepMinutes) {
    const utc = utcFor(place, minutes);
    const angles = anglesAt(utc, place.lat, place.lng);
    const planets = Object.fromEntries(
      positionsAt(utc).map((p) => [p.planet, p.longitude]),
    ) as Record<Planet, number>;
    out.push({ minutes, utc, ...angles, planets });
  }
  return out;
}

// --- sensitivity -----------------------------------------------------------

export interface SignSpan {
  sign: Sign;
  fromMinutes: number;
  /** Inclusive: the last swept candidate still in this sign. */
  toMinutes: number;
}

function spans(candidates: CandidateChart[], lon: (c: CandidateChart) => number) {
  const out: SignSpan[] = [];
  for (const c of candidates) {
    const sign = signOf(lon(c));
    const last = out[out.length - 1];
    if (last && last.sign === sign) last.toMinutes = c.minutes;
    else out.push({ sign, fromMinutes: c.minutes, toMinutes: c.minutes });
  }
  return out;
}

export interface Sensitivity {
  ascendant: SignSpan[];
  mc: SignSpan[];
  moon: SignSpan[];
}

export function sensitivity(candidates: CandidateChart[]): Sensitivity {
  return {
    ascendant: spans(candidates, (c) => c.ascendant),
    mc: spans(candidates, (c) => c.mc),
    moon: spans(candidates, (c) => c.planets.moon),
  };
}

// --- rectification ---------------------------------------------------------

export interface RectifyEvent {
  id: number;
  title: string;
  /** Canonical "YYYY-MM-DD". */
  eventDate: string;
  precision: LifeEventPrecision;
  category: LifeEventCategory;
}

export type Technique = "solar_arc" | "progressed" | "transit";
export type Point = Planet | "ascendant" | "mc";

export interface Hit {
  eventId: number;
  technique: Technique;
  /** The moving point: directed, progressed or transiting. */
  mover: Point;
  /** The natal point it reaches. */
  target: Point;
  aspect: "conjunction" | "square" | "opposition";
  orb: number;
  weight: number;
}

export interface ScoredCandidate {
  minutes: number;
  score: number;
  /** The hits that count — each event's best per technique — strongest first. */
  hits: Hit[];
}

/**
 * Hard aspects only. Rectification traditionally reads the angles'
 * conjunctions, squares and oppositions; adding trines and sextiles
 * multiplies the chance contacts every candidate time catches (two angles
 * × ten planets, both ways, per event) without adding signal.
 */
const ASPECTS = [
  { name: "conjunction", angle: 0 },
  { name: "opposition", angle: 180 },
  { name: "square", angle: 90 },
] as const;

const PRECISION_WEIGHT: Record<LifeEventPrecision, number> = {
  day: 1,
  month: 0.6,
  year: 0.3,
};

/** Directions and progressions move about a degree a year, so 1° is a
 *  year either side — wide enough for a year-only date. */
const DIRECTION_ORB = 1;

/** Transits move fast enough that a year-only date cannot place them. */
const TRANSIT_ORB: Partial<Record<LifeEventPrecision, number>> = {
  day: 1.5,
  month: 2.5,
};

const SLOW: Planet[] = ["jupiter", "saturn", "uranus", "neptune", "pluto"];

/** Which angle axis an event's category traditionally falls on. */
const CATEGORY_AXIS: Partial<Record<LifeEventCategory, "ascendant" | "mc">> = {
  career: "mc",
  education: "mc",
  relocation: "mc", // the IC end: home and roots
  marriage: "ascendant", // the DSC end: partnership
  health: "ascendant", // the body
};

const AXIS_BONUS = 1.5;

/**
 * How fast a hit's weight falls off with orb: a Gaussian of this width.
 * With a dozen events and orbs of a degree, nearly any birth time catches
 * some loose contact for most events — that is noise, and a linear falloff
 * let it drown the exact hits. About 0.35° (four months of arc) for the
 * directions; transits get their own, wider spread.
 */
const DIRECTION_SIGMA = 0.35;
const TRANSIT_SIGMA = 1;

const DAY_MS = 86_400_000;
const TROPICAL_YEAR_DAYS = 365.2422;

/** Every hit starts at this weight; precision, orb, technique and the
 *  category's axis scale it. */
const BASE_WEIGHT = 2;

function bestAspect(a: number, b: number, maxOrb: number) {
  let best: { name: Hit["aspect"]; orb: number; weight: number } | null = null;
  const sep = separation(a, b);
  for (const asp of ASPECTS) {
    const orb = Math.abs(sep - asp.angle);
    if (orb <= maxOrb && (!best || orb < best.orb)) {
      best = { name: asp.name, orb, weight: BASE_WEIGHT };
    }
  }
  return best;
}

interface EventSky {
  event: RectifyEvent;
  /** Event instant: noon UTC of its (canonical) date. */
  at: Date;
  /** Age in years at the event, from the reference birth instant. */
  ageYears: number;
  /** Solar arc: progressed Sun − natal Sun, from the reference instant. */
  arc: number;
  /** The same arc in right ascension — what the progressed RAMC advances
   *  by. */
  raArc: number;
  /** Obliquity at the reference instant, for the progressed angles. */
  eps: number;
  /** Slow transiting longitudes at the event. */
  transits: Partial<Record<Planet, number>>;
}

/**
 * Score candidates against events. Everything that does not depend on the
 * candidate — each event's solar arc and its slow transits — is computed
 * once per event from `reference` (any candidate; the arc changes by
 * arc-seconds across a day of birth times).
 */
export function scoreCandidates(
  candidates: CandidateChart[],
  events: RectifyEvent[],
  place: Pick<BirthPlace, "lat" | "lng">,
): ScoredCandidate[] {
  if (candidates.length === 0) return [];
  const reference = candidates[Math.floor(candidates.length / 2)];
  const skies: EventSky[] = events.map((event) => {
    const at = new Date(`${event.eventDate}T12:00:00Z`);
    const ageYears =
      (at.getTime() - reference.utc.getTime()) / (TROPICAL_YEAR_DAYS * DAY_MS);
    const progressed = new Date(reference.utc.getTime() + ageYears * DAY_MS);
    const progSun = positionsAt(progressed).find((p) => p.planet === "sun")!;
    const transits: Partial<Record<Planet, number>> = {};
    if (TRANSIT_ORB[event.precision] !== undefined) {
      for (const p of positionsAt(at)) {
        if (SLOW.includes(p.planet)) transits[p.planet] = p.longitude;
      }
    }
    const eps = meanObliquity(reference.utc);
    return {
      event,
      at,
      ageYears,
      arc: norm360(progSun.longitude - reference.planets.sun),
      raArc:
        eclipticToRightAscension(progSun.longitude, meanObliquity(progressed)) -
        eclipticToRightAscension(reference.planets.sun, eps),
      eps,
      transits,
    };
  });

  return candidates.map((c) => {
    const hits: Hit[] = [];
    const natalAngles = { ascendant: c.ascendant, mc: c.mc };
    for (const sky of skies) {
      if (sky.ageYears < 0) continue;
      const { event } = sky;
      const pw = PRECISION_WEIGHT[event.precision];
      const axis = CATEGORY_AXIS[event.category];
      const push = (
        technique: Technique,
        mover: Point,
        target: Point,
        found: { name: Hit["aspect"]; orb: number; weight: number },
        sigma: number,
        angle: "ascendant" | "mc",
      ) => {
        const tightness = Math.exp(-((found.orb / sigma) ** 2));
        const bonus = axis === angle ? AXIS_BONUS : 1;
        hits.push({
          eventId: event.id,
          technique,
          mover,
          target,
          aspect: found.name,
          orb: found.orb,
          weight: found.weight * pw * tightness * bonus,
        });
      };

      // Solar arc: directed angles to natal planets, directed planets to
      // natal angles.
      for (const angle of ["ascendant", "mc"] as const) {
        const directed = norm360(natalAngles[angle] + sky.arc);
        for (const planet of PLANETS) {
          const f = bestAspect(directed, c.planets[planet], DIRECTION_ORB);
          if (f) push("solar_arc", angle, planet, f, DIRECTION_SIGMA, angle);
          const g = bestAspect(
            norm360(c.planets[planet] + sky.arc),
            natalAngles[angle],
            DIRECTION_ORB,
          );
          if (g) push("solar_arc", planet, angle, g, DIRECTION_SIGMA, angle);
        }
      }

      // Progressed angles (solar arc in right ascension on the candidate's
      // RAMC, at the birthplace) to natal planets.
      const progRamc = norm360(c.ramc + sky.raArc);
      const prog = {
        ascendant: ascendant(progRamc, place.lat, sky.eps),
        mc: midheaven(progRamc, sky.eps),
      };
      for (const angle of ["ascendant", "mc"] as const) {
        for (const planet of PLANETS) {
          const f = bestAspect(prog[angle], c.planets[planet], DIRECTION_ORB);
          if (f) push("progressed", angle, planet, f, DIRECTION_SIGMA, angle);
        }
      }

      // Slow transits over the natal angles.
      const transitOrb = TRANSIT_ORB[event.precision];
      if (transitOrb !== undefined) {
        for (const planet of SLOW) {
          const lon = sky.transits[planet];
          if (lon === undefined) continue;
          for (const angle of ["ascendant", "mc"] as const) {
            const f = bestAspect(lon, natalAngles[angle], transitOrb);
            // A transit is weaker evidence than a direction: half weight.
            if (f) push("transit", planet, angle, { ...f, weight: f.weight / 2 }, TRANSIT_SIGMA, angle);
          }
        }
      }
    }
    // Each event counts once per technique — its best hit. A time that
    // explains one event five loose ways has not explained five events.
    const best = new Map<string, Hit>();
    for (const h of hits) {
      const key = `${h.eventId}:${h.technique}`;
      const cur = best.get(key);
      if (!cur || h.weight > cur.weight) best.set(key, h);
    }
    const counted = [...best.values()].sort((a, b) => b.weight - a.weight);
    const score = counted.reduce((sum, h) => sum + h.weight, 0);
    return { minutes: c.minutes, score, hits: counted };
  });
}

/**
 * The best-scoring candidates that are genuinely different times: local
 * maxima, at least `minGapMinutes` apart, best first. A run of neighbouring
 * minutes scoring alike is one answer, not five.
 */
export function topCandidates(
  scored: ScoredCandidate[],
  count: number,
  minGapMinutes: number,
): ScoredCandidate[] {
  const ranked = [...scored]
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  const picked: ScoredCandidate[] = [];
  for (const s of ranked) {
    if (picked.every((p) => Math.abs(p.minutes - s.minutes) >= minGapMinutes)) {
      picked.push(s);
      if (picked.length === count) break;
    }
  }
  return picked;
}

/** Events precise enough to rectify with: day or month dates. */
export function usableEventCount(events: RectifyEvent[]): number {
  return events.filter((e) => e.precision !== "year").length;
}

export type Verdict = "clear" | "suggestive" | "inconclusive";

/**
 * How much the best time stands out from the window it was picked from:
 * its score over the median candidate's. A handful of events lets almost
 * any time catch a few contacts, so the winner alone means little — the
 * contrast is what the page reports.
 */
export function decisiveness(scored: ScoredCandidate[]): {
  best: number;
  median: number;
  ratio: number;
  verdict: Verdict;
} {
  const scores = scored.map((s) => s.score).sort((a, b) => a - b);
  if (scores.length === 0) return { best: 0, median: 0, ratio: 0, verdict: "inconclusive" };
  const best = scores[scores.length - 1];
  const median = scores[Math.floor(scores.length / 2)];
  const ratio = median > 0 ? best / median : best > 0 ? Infinity : 0;
  const verdict: Verdict =
    ratio >= 2.5 ? "clear" : ratio >= 1.6 ? "suggestive" : "inconclusive";
  return { best, median, ratio, verdict };
}
