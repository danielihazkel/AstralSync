import type { CrossAspect, Placement, Planet } from "@astralsync/astro-core";
import type { LifeEventPrecision } from "./lifeEventMeta";

/**
 * What the chart was doing when a recorded life event happened.
 *
 * Every technique involved is already built and already a pure function of
 * (natal chart, instant) — transits, profections, firdaria, zodiacal
 * releasing, secondary progressions — and both /api/transits/[id] and
 * /api/cycles/[id] have always accepted `?at=`. This module is the pure
 * middle: it decides what is *honest* to show for an event whose date the
 * user may only remember to the year.
 *
 * The honesty rule is the point. A life event dated "2014" is stored as
 * 2014-01-01, so the Moon's position is an artefact of that convention, not
 * a fact about the event — and Mercury, Venus and the Sun move far enough in
 * a year that their aspects say nothing either. Showing them anyway would be
 * the astrological equivalent of a fake precision bar on a chart. So the
 * fast movers are suppressed below day precision, and the UI says why. This
 * mirrors the minimum-sample guards in lib/journalInsights.
 */

/** Bodies that move too fast to survive a month- or year-precision date. */
export const FAST_MOVERS: readonly Planet[] = [
  "moon",
  "mercury",
  "venus",
  "sun",
  "mars",
] as const;

/**
 * Which bodies are meaningful at a given date precision.
 *
 * - `day`: everything. The instant is real (local noon of a known day).
 * - `month`: the slow movers only. Mars is borderline over a month, but it
 *   can cross a whole sign, so it goes with the fast group.
 * - `year`: the slow movers only, and even Jupiter has moved a sign — the
 *   time-lord layer carries most of the meaning at this precision.
 */
export function meaningfulAtPrecision(
  planet: Planet,
  precision: LifeEventPrecision,
): boolean {
  if (precision === "day") return true;
  return !FAST_MOVERS.includes(planet);
}

/** Drop transit rows whose moving body is meaningless at this precision. */
export function filterAspectsForPrecision(
  aspects: CrossAspect[],
  precision: LifeEventPrecision,
): CrossAspect[] {
  if (precision === "day") return aspects;
  return aspects.filter((x) => meaningfulAtPrecision(x.a as Planet, precision));
}

/** Same filter for the positions table. */
export function filterPlacementsForPrecision(
  placements: Placement[],
  precision: LifeEventPrecision,
): Placement[] {
  if (precision === "day") return placements;
  return placements.filter((p) => meaningfulAtPrecision(p.planet, precision));
}

/**
 * The sentence the UI shows when it has hidden something. Null at day
 * precision, where nothing is hidden.
 */
export function precisionCaveat(precision: LifeEventPrecision): string | null {
  if (precision === "day") return null;
  const span = precision === "month" ? "month" : "year";
  return (
    `Dated to the ${span}, so the sky here is the ${span}'s starting day. ` +
    `The Moon, Sun, Mercury, Venus and Mars move too far in a ${span} for ` +
    `their positions to mean anything — they are hidden. The slower planets ` +
    `and the time-lords below barely move, so they still hold.`
  );
}

/**
 * One "who was in charge" row, in raw engine keys.
 *
 * Deliberately not pre-formatted: signs, planets and firdaria lords already
 * have label and glyph maps in components/format.ts and CyclesPanel, and a
 * second set of names here would be one more thing to keep in step. The
 * component labels; this decides what to say.
 */
export type TimeLordLine =
  | {
      kind: "profection";
      age: number;
      house: number;
      sign: string;
      lord: string;
    }
  | {
      kind: "firdaria";
      major: string;
      /** Null during the node periods, which take no sub-lord. */
      sub: string | null;
      secondCycle: boolean;
    }
  | {
      kind: "releasing";
      lot: "fortune" | "spirit";
      sign: string;
      lord: string;
      /** The L2 subdivision, when the lot has one (Fortune only here). */
      subSign: string | null;
      peak: boolean;
      loosedBond: boolean;
    }
  | { kind: "progressed-sun"; sign: string };

/**
 * The minimal cycles shape this module reads. Declared structurally rather
 * than importing CyclesData so the module stays free of the Prisma-bearing
 * lib/cycles import chain and can be unit-tested with plain fixtures.
 */
export interface EventCyclesInput {
  profection: {
    age: number;
    profectedHouse: number;
    profectedSign: string;
    yearLord: string;
  } | null;
  firdaria: {
    major: { lord: string };
    sub: { lord: string } | null;
    secondCycle: boolean;
  } | null;
  zodiacalReleasing: {
    fortune: { current: { l1: ZrLike; l2: ZrLike } | null } | null;
    spirit: { current: { l1: ZrLike } | null } | null;
  } | null;
  progressions: { placements: { planet: string; sign: string }[] } | null;
}

interface ZrLike {
  sign: string;
  lord: string;
  loosedBond: boolean;
  angular: string | null;
}

/**
 * Turn a cycles payload into the "who was in charge" rows. Returns an empty
 * list for a solar chart, where none of these techniques apply — they all
 * need an Ascendant, and the caller shows the solar-chart notice instead.
 */
export function timeLordLines(data: EventCyclesInput): TimeLordLine[] {
  const lines: TimeLordLine[] = [];

  if (data.profection) {
    const p = data.profection;
    lines.push({
      kind: "profection",
      age: p.age,
      house: p.profectedHouse,
      sign: p.profectedSign,
      lord: p.yearLord,
    });
  }

  if (data.firdaria) {
    const f = data.firdaria;
    lines.push({
      kind: "firdaria",
      major: f.major.lord,
      sub: f.sub?.lord ?? null,
      secondCycle: f.secondCycle,
    });
  }

  const zr = data.zodiacalReleasing;
  if (zr?.fortune?.current) {
    const { l1, l2 } = zr.fortune.current;
    lines.push({
      kind: "releasing",
      lot: "fortune",
      sign: l1.sign,
      lord: l1.lord,
      subSign: l2.sign,
      peak: l1.angular === "10th",
      loosedBond: l1.loosedBond,
    });
  }
  if (zr?.spirit?.current) {
    const l1 = zr.spirit.current.l1;
    lines.push({
      kind: "releasing",
      lot: "spirit",
      sign: l1.sign,
      lord: l1.lord,
      subSign: null,
      peak: l1.angular === "10th",
      loosedBond: l1.loosedBond,
    });
  }

  const progSun = data.progressions?.placements.find((p) => p.planet === "sun");
  if (progSun) {
    lines.push({ kind: "progressed-sun", sign: progSun.sign });
  }

  return lines;
}
