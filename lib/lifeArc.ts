import type { LifeEventCategory, LifeEventPrecision } from "./lifeEventMeta";

/**
 * The life arc: recorded events laid against the time-lord periods that were
 * running when they happened.
 *
 * Four datasets the app already computes — zodiacal releasing L1 periods,
 * firdaria major periods, annual profections, and the user's own events —
 * become legible together only on one shared axis. Separately they are four
 * lists of dates; together they are the question the app exists to answer:
 * does this system describe what actually happened?
 *
 * Pure geometry and pure band arithmetic, the components/chart/geometry
 * stance: everything here is unit-testable and the SVG that renders it stays
 * dumb. No ephemeris, no Prisma.
 */

export interface ArcBand {
  /** Engine key — the component owns the label. */
  key: string;
  /** Secondary key (a releasing period's ruling planet), when there is one. */
  lord?: string;
  startUtc: string;
  endUtc: string;
  /** A releasing peak (10th-sign period from the lot). */
  peak?: boolean;
  /** A releasing period that began by loosing the bond. */
  loosedBond?: boolean;
}

export interface ArcEvent {
  id: number;
  title: string;
  /** Canonical "YYYY-MM-DD". */
  eventDate: string;
  precision: LifeEventPrecision;
  category: LifeEventCategory;
}

export interface ArcRow {
  /** "releasing" | "firdaria" | "profection" — the component labels it. */
  technique: string;
  bands: ArcBand[];
}

/** A band positioned on the axis, as fractions of the arc's width [0,1]. */
export interface PlacedBand extends ArcBand {
  /** Left edge, 0–1. */
  x: number;
  /** Width, 0–1. Never negative; clipped to the arc window. */
  width: number;
}

export interface PlacedEvent extends ArcEvent {
  /** Position along the axis, 0–1. */
  x: number;
}

export interface ArcScale {
  startMs: number;
  endMs: number;
}

/**
 * The window the arc covers: birth to whichever is later, today or the last
 * recorded event, plus a small tail so a final event is not flush against
 * the right edge.
 */
export function arcScale(
  birthUtc: string,
  events: ArcEvent[],
  now: Date = new Date(),
): ArcScale {
  const startMs = Date.parse(birthUtc);
  const lastEventMs = events.reduce(
    (max, e) => Math.max(max, Date.parse(`${e.eventDate}T12:00:00Z`)),
    -Infinity,
  );
  // -Infinity when there are no events; Math.max with now handles it.
  const endBase = Math.max(now.getTime(), lastEventMs);
  // 2% tail, floored at a year so a short arc still has breathing room.
  const tail = Math.max((endBase - startMs) * 0.02, 365.2425 * 864e5);
  return { startMs, endMs: endBase + tail };
}

/** Fraction along the arc, clamped into [0,1]. */
export function fractionAt(scale: ArcScale, ms: number): number {
  const span = scale.endMs - scale.startMs;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (ms - scale.startMs) / span));
}

/**
 * Place bands on the axis, dropping any that fall entirely outside the
 * window and clipping those that straddle an edge — a firdaria wheel runs
 * 75 years whether or not the person has lived that long.
 */
export function placeBands(bands: ArcBand[], scale: ArcScale): PlacedBand[] {
  const placed: PlacedBand[] = [];
  for (const band of bands) {
    const startMs = Date.parse(band.startUtc);
    const endMs = Date.parse(band.endUtc);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    if (endMs <= scale.startMs || startMs >= scale.endMs) continue;
    const x = fractionAt(scale, startMs);
    const width = fractionAt(scale, endMs) - x;
    if (width <= 0) continue;
    placed.push({ ...band, x, width });
  }
  return placed;
}

/** Place events on the axis. Out-of-window events are dropped, not clamped:
 *  a pin at the very edge would claim a date it doesn't have. */
export function placeEvents(
  events: ArcEvent[],
  scale: ArcScale,
): PlacedEvent[] {
  const placed: PlacedEvent[] = [];
  for (const e of events) {
    const ms = Date.parse(`${e.eventDate}T12:00:00Z`);
    if (!Number.isFinite(ms)) continue;
    if (ms < scale.startMs || ms > scale.endMs) continue;
    placed.push({ ...e, x: fractionAt(scale, ms) });
  }
  return placed;
}

/**
 * Annual profection bands from birth to the end of the window: one whole
 * year each, cycling the 12 houses. Generated rather than fetched, because
 * the profection is pure calendar arithmetic — the house is (age mod 12) + 1
 * and the bounds are birthday anniversaries.
 */
export function profectionBands(
  birthUtc: string,
  scale: ArcScale,
): ArcBand[] {
  const birth = new Date(birthUtc);
  const bands: ArcBand[] = [];
  for (let age = 0; age < 120; age++) {
    const start = anniversary(birth, age);
    const end = anniversary(birth, age + 1);
    if (start.getTime() >= scale.endMs) break;
    bands.push({
      key: String((age % 12) + 1),
      startUtc: start.toISOString(),
      endUtc: end.toISOString(),
    });
  }
  return bands;
}

/** The nth birthday anniversary, UTC — Feb 29 births roll to Mar 1 in common
 *  years, which is what Date does and what annualProfection assumes. */
function anniversary(birth: Date, years: number): Date {
  const d = new Date(birth.getTime());
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

/** Decade gridlines across the window, for orientation. */
export function decadeTicks(
  birthUtc: string,
  scale: ArcScale,
): { age: number; x: number }[] {
  const birth = new Date(birthUtc);
  const ticks: { age: number; x: number }[] = [];
  for (let age = 10; age < 120; age += 10) {
    const ms = anniversary(birth, age).getTime();
    if (ms > scale.endMs) break;
    ticks.push({ age, x: fractionAt(scale, ms) });
  }
  return ticks;
}
