import {
  SIGNS,
  astronomyEngineProvider,
  findAspectHits,
  findIngresses,
  signOf,
  upcomingEclipses,
  type EclipseEvent,
  type Planet,
  type Sign,
} from "@astralsync/astro-core";
import * as Astronomy from "astronomy-engine";

/**
 * The Sky Calendar's month model — computed entirely in the browser from the
 * bundled engines (dynamic import, same stance as lib/today.ts) so the
 * /calendar page works offline. Profile-independent: nothing here touches
 * the DB or a natal chart.
 *
 * Days are bucketed in the machine's local timezone, matching the Journal
 * tab's "your day is your day" stance.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Modern VoC practice: aspects to Sun through Pluto, Moon excluded — the
 *  same set lib/today.ts uses. */
const VOC_PLANETS: Planet[] = [
  "sun",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];

const MAJOR_ANGLES = [0, 60, 90, 120, 180];

const QUARTER_NAMES = ["New Moon", "First Quarter", "Full Moon", "Third Quarter"];

export interface VocWindow {
  /** Last exact major lunar aspect — the void begins here. */
  fromUtc: string;
  /** The ingress that ends the void. */
  untilUtc: string;
  nextSign: Sign;
}

export interface MoonDayCell {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Moon sign at local noon. */
  signAtNoon: Sign;
  /** Illuminated fraction at local noon, 0–1. */
  illumination: number;
  /** Sign ingress falling on this local day, if any (rarely two). */
  ingresses: Array<{ utc: string; sign: Sign }>;
  /** Lunar quarter falling on this local day, if any. */
  quarter: { name: string; utc: string } | null;
  /** Void-of-course windows overlapping this local day (clipped refs — the
   *  full window is in `voc`, listed on every day it touches). */
  voc: VocWindow[];
  eclipses: EclipseEvent[];
}

export interface MoonMonth {
  year: number;
  /** 1-based month. */
  month: number;
  days: MoonDayCell[];
}

function localDayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function moonLonAt(t: Date): number {
  return astronomyEngineProvider.eclipticLongitude("moon", t);
}

/** The full void-of-course window ending at `ingress`: from the Moon's last
 *  exact major aspect inside [spanStart, ingress] to the ingress itself.
 *  Null when an aspect perfects within an hour of the ingress (no practical
 *  void) or none is found in the span. */
function vocWindowFor(
  spanStart: Date,
  ingress: Date,
  nextSign: Sign,
): VocWindow | null {
  let last: Date | null = null;
  for (const planet of VOC_PLANETS) {
    const hits = findAspectHits(
      moonLonAt,
      (t) => astronomyEngineProvider.eclipticLongitude(planet, t),
      MAJOR_ANGLES,
      spanStart,
      ingress,
      HOUR_MS,
    );
    for (const h of hits) {
      if (last === null || h.utc.getTime() > last.getTime()) last = h.utc;
    }
  }
  if (last === null) return null;
  if (ingress.getTime() - last.getTime() < HOUR_MS) return null;
  return {
    fromUtc: last.toISOString(),
    untilUtc: ingress.toISOString(),
    nextSign,
  };
}

/** Session-lifetime month memo, shared by every view that needs a month
 *  (the /calendar grid and the /calendar/[date] almanac) so navigating
 *  between them never recomputes the ~1s of ephemeris work. Module-level on
 *  purpose: a component-held cache dies on unmount. */
const monthCache = new Map<string, MoonMonth>();

export function computeMoonMonthCached(
  year: number,
  month1: number,
): MoonMonth {
  const key = `${year}-${month1}`;
  const hit = monthCache.get(key);
  if (hit) return hit;
  const computed = computeMoonMonth(year, month1);
  monthCache.set(key, computed);
  return computed;
}

/** Pure: a local calendar month → per-day Moon data. ~0.5–1s of ephemeris
 *  work for a month; callers should memoize per (year, month) — or use
 *  computeMoonMonthCached. */
export function computeMoonMonth(year: number, month1: number): MoonMonth {
  const monthStart = new Date(year, month1 - 1, 1);
  const monthEnd = new Date(year, month1, 1);
  // Pad so the first in-month ingress still has its preceding span (the
  // Moon spends ≤ ~2.7 days per sign).
  const scanFrom = new Date(monthStart.getTime() - 4 * DAY_MS);
  const scanTo = new Date(monthEnd.getTime() + DAY_MS);

  const ingresses = findIngresses("moon", scanFrom, scanTo);

  // One VoC window per inter-ingress span that ends inside (or just after)
  // the month.
  const vocWindows: VocWindow[] = [];
  for (let i = 1; i < ingresses.length; i++) {
    const ingress = ingresses[i];
    if (ingress.utc.getTime() < monthStart.getTime() - DAY_MS) continue;
    const w = vocWindowFor(
      ingresses[i - 1].utc,
      ingress.utc,
      SIGNS[ingress.signIndex],
    );
    if (w) vocWindows.push(w);
  }

  // Quarters across the month.
  const quarters: Array<{ name: string; utc: Date }> = [];
  let q = Astronomy.SearchMoonQuarter(monthStart);
  while (q.time.date.getTime() < monthEnd.getTime()) {
    quarters.push({ name: QUARTER_NAMES[q.quarter], utc: q.time.date });
    q = Astronomy.NextMoonQuarter(q);
  }

  const daysInMonth = new Date(year, month1, 0).getDate();
  const eclipses = upcomingEclipses(monthStart, daysInMonth + 1).filter(
    (e) => new Date(e.peakUtc).getTime() < monthEnd.getTime(),
  );

  const days: MoonDayCell[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStart = new Date(year, month1 - 1, day);
    const dayEnd = new Date(year, month1 - 1, day + 1);
    const noon = new Date(year, month1 - 1, day, 12);
    const key = localDayKey(dayStart);

    const inDay = (iso: string) => {
      const t = new Date(iso).getTime();
      return t >= dayStart.getTime() && t < dayEnd.getTime();
    };

    days.push({
      date: key,
      signAtNoon: signOf(moonLonAt(noon)),
      illumination: Astronomy.Illumination(Astronomy.Body.Moon, noon)
        .phase_fraction,
      ingresses: ingresses
        .filter((i) => inDay(i.utc.toISOString()))
        .map((i) => ({ utc: i.utc.toISOString(), sign: SIGNS[i.signIndex] })),
      quarter: (() => {
        const hit = quarters.find((x) => inDay(x.utc.toISOString()));
        return hit ? { name: hit.name, utc: hit.utc.toISOString() } : null;
      })(),
      voc: vocWindows.filter(
        (w) =>
          new Date(w.fromUtc).getTime() < dayEnd.getTime() &&
          new Date(w.untilUtc).getTime() > dayStart.getTime(),
      ),
      eclipses: eclipses.filter((e) => inDay(e.peakUtc)),
    });
  }

  return { year, month: month1, days };
}
