import {
  astronomyEngineProvider,
  findAspectHits,
  findIngresses,
  signOf,
  type Planet,
  type Sign,
} from "@astralsync/astro-core";
import {
  DAY_PLANETS,
  planetaryDayHours,
  type ClassicalPlanet,
} from "@astralsync/hebrew-core";
import { memoizeByMs } from "./ephemerisMemo";
import { LruMap } from "./lruCache";
import type { HomeLocation } from "./today";

/**
 * Electional day picker: score time windows for starting something, using
 * transparent classical rules — no AI, every window lists the factors that
 * moved it. Client-side and DB-free like lib/skyCalendar.ts.
 *
 * v1 factor set (deliberately small and defensible):
 *  - Moon void of course → the window is an "avoid", full stop.
 *  - The Moon's applying aspect: harmonious to a benefic lifts, hard to a
 *    malefic drags.
 *  - Planetary hour and day ruler matching the chosen intent.
 *  - Mercury retrograde: a penalty for Mercury-ruled intents, otherwise a
 *    listed caution.
 * Moon-sign scoring is deliberately display-only — the doctrine is contested.
 */

export const INTENT_PLANETS = {
  communication: "mercury",
  love: "venus",
  action: "mars",
  growth: "jupiter",
  commitment: "saturn",
  visibility: "sun",
  home: "moon",
} as const satisfies Record<string, ClassicalPlanet>;

export type Intent = keyof typeof INTENT_PLANETS;

export const INTENT_LABELS: Record<Intent, string> = {
  communication: "Communication & contracts",
  love: "Love & beauty",
  action: "Action & courage",
  growth: "Growth & fortune",
  commitment: "Commitment & structure",
  visibility: "Visibility & leadership",
  home: "Home & family",
};

export interface ElectionalFactor {
  label: string;
  /** Contribution to the window score; 0 = informational caution. */
  score: number;
}

export interface ScoredWindow {
  startUtc: string;
  endUtc: string;
  /** Null when no location is known (whole-day window). */
  hourRuler: ClassicalPlanet | null;
  isDay: boolean | null;
  score: number;
  verdict: "good" | "mixed" | "avoid";
  factors: ElectionalFactor[];
}

export interface ElectionalDay {
  /** Local civil date scored, YYYY-MM-DD. */
  date: string;
  moonSign: Sign;
  dayRuler: ClassicalPlanet;
  mercuryRetrograde: boolean;
  /** 24 planetary-hour windows with a location, one whole-day window without. */
  windows: ScoredWindow[];
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

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

const BENEFICS = new Set<Planet>(["venus", "jupiter"]);
const MALEFICS = new Set<Planet>(["mars", "saturn"]);
const HARMONIOUS = new Set([60, 120]);
const HARD = new Set([90, 180]);

const ASPECT_WORD: Record<number, string> = {
  0: "conjunction",
  60: "sextile",
  90: "square",
  120: "trine",
  180: "opposition",
};

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

export interface LunarHit {
  utc: number;
  planet: Planet;
  angle: number;
}

export interface LunarDayScan {
  /** Exact lunar aspects across the padded scan window, time-ascending. */
  hits: LunarHit[];
  /** Moon ingress instants (epoch ms) across the same window. */
  ingresses: number[];
  /** Void periods: last exact aspect before each ingress → the ingress. */
  voids: Array<{ from: number; until: number }>;
}

/** Session-lifetime scan memo keyed by local civil date — the expensive part
 *  of scoring depends on the date alone, so intent and location changes
 *  rescore instantly. Entries are a few hundred numbers; LRU-capped at two
 *  months of days like the month cache in lib/skyCalendar.ts. */
const dayScanCache = new LruMap<string, LunarDayScan>(62);

/**
 * The ephemeris work for one local civil day: exact lunar aspects and
 * ingresses from just before the day (an already-running void reaches into
 * it) to well past it (late windows need their "next" aspect), plus the void
 * periods they imply (same construction as lib/skyCalendar.ts).
 */
export function lunarDayScan(
  year: number,
  month1: number,
  day: number,
): LunarDayScan {
  const p = (n: number) => String(n).padStart(2, "0");
  const key = `${year}-${p(month1)}-${p(day)}`;
  const cached = dayScanCache.get(key);
  if (cached) return cached;

  const eph = astronomyEngineProvider;
  const dayStart = new Date(year, month1 - 1, day);
  const dayEnd = new Date(year, month1 - 1, day + 1);
  const scanFrom = new Date(dayStart.getTime() - 2 * DAY_MS);
  const scanTo = new Date(dayEnd.getTime() + 2 * DAY_MS);
  // The nine partner scans walk the same hourly grid — one Moon sample each.
  const moonAt = memoizeByMs((t) => eph.eclipticLongitude("moon", t));

  const hits: LunarHit[] = [];
  for (const planet of VOC_PLANETS) {
    for (const h of findAspectHits(
      moonAt,
      (t) => eph.eclipticLongitude(planet, t),
      MAJOR_ANGLES,
      scanFrom,
      scanTo,
      HOUR_MS,
    )) {
      hits.push({ utc: h.utc.getTime(), planet, angle: h.angle });
    }
  }
  hits.sort((a, b) => a.utc - b.utc);
  const ingresses = findIngresses("moon", scanFrom, scanTo).map((i) =>
    i.utc.getTime(),
  );

  const voids: Array<{ from: number; until: number }> = [];
  for (const ingress of ingresses) {
    const before = hits.filter((h) => h.utc < ingress);
    if (before.length === 0) continue;
    voids.push({ from: before[before.length - 1].utc, until: ingress });
  }

  const scan: LunarDayScan = { hits, ingresses, voids };
  dayScanCache.set(key, scan);
  return scan;
}

/** The Moon's applying-aspect factor for a window starting at `startMs`:
 *  the next exact lunar aspect before the Moon's next ingress. */
function applyingFactor(
  startMs: number,
  hits: LunarHit[],
  ingresses: number[],
): ElectionalFactor | null {
  const nextIngress = ingresses.find((t) => t > startMs) ?? Infinity;
  const next = hits.find((h) => h.utc >= startMs && h.utc < nextIngress);
  if (!next) return null;
  const word = ASPECT_WORD[next.angle];
  const label = `Moon applying to a ${word} with ${cap(next.planet)}`;
  if (BENEFICS.has(next.planet) && HARMONIOUS.has(next.angle)) {
    return { label, score: 2 };
  }
  if (BENEFICS.has(next.planet) && next.angle === 0) {
    return { label, score: 1 };
  }
  if (MALEFICS.has(next.planet) && HARD.has(next.angle)) {
    return { label, score: -2 };
  }
  if (MALEFICS.has(next.planet) && next.angle === 0) {
    return { label, score: -1 };
  }
  return { label, score: 0 };
}

/** One local civil day (+ optional location and intent) → scored windows.
 *  The ephemeris work is cached per date via lunarDayScan, so only the first
 *  call for a date pays it; rescoring for a new intent or location is ~ms. */
export function scoreDay(opts: {
  year: number;
  /** 1-based month. */
  month: number;
  day: number;
  location: HomeLocation | null;
  intent: Intent | null;
}): ElectionalDay {
  const { year, month, day, location, intent } = opts;
  const eph = astronomyEngineProvider;
  const dayStart = new Date(year, month - 1, day);
  const dayEnd = new Date(year, month - 1, day + 1);
  const noon = new Date(year, month - 1, day, 12);
  const p = (n: number) => String(n).padStart(2, "0");
  const dateKey = `${year}-${p(month)}-${p(day)}`;

  // One scan pass feeds every window; cached per date across calls.
  const { hits, ingresses, voids } = lunarDayScan(year, month, day);

  const intentPlanet = intent ? INTENT_PLANETS[intent] : null;
  const mercuryRetrograde = eph.isRetrograde("mercury", noon);

  const planetaryDay = location
    ? planetaryDayHours({
        civilDate: { year, month, day },
        latitude: location.lat,
        longitude: location.lng,
        tzId: location.tzIana,
      })
    : null;
  const dayRuler =
    planetaryDay?.dayRuler ?? DAY_PLANETS[dayStart.getDay()];

  const spans = planetaryDay
    ? planetaryDay.hours.map((h) => ({
        start: new Date(h.startUtc).getTime(),
        end: new Date(h.endUtc).getTime(),
        ruler: h.planet as ClassicalPlanet | null,
        isDay: h.isDay as boolean | null,
      }))
    : [
        {
          start: dayStart.getTime(),
          end: dayEnd.getTime(),
          ruler: null,
          isDay: null,
        },
      ];

  const windows: ScoredWindow[] = spans.map((span) => {
    const factors: ElectionalFactor[] = [];

    const voidOverlap = voids.some(
      (v) => v.from < span.end && v.until > span.start,
    );
    if (voidOverlap) {
      factors.push({ label: "Moon void of course", score: -2 });
    }

    const applying = applyingFactor(span.start, hits, ingresses);
    if (applying) factors.push(applying);

    if (intentPlanet && span.ruler === intentPlanet) {
      factors.push({
        label: `${cap(intentPlanet)} rules this hour`,
        score: 1,
      });
    }
    if (intentPlanet && dayRuler === intentPlanet) {
      factors.push({ label: `${cap(intentPlanet)} rules the day`, score: 1 });
    }

    if (mercuryRetrograde) {
      factors.push(
        intentPlanet === "mercury"
          ? { label: "Mercury is retrograde", score: -1 }
          : { label: "Mercury is retrograde (caution)", score: 0 },
      );
    }

    const score = factors.reduce((s, f) => s + f.score, 0);
    const verdict: ScoredWindow["verdict"] = voidOverlap
      ? "avoid"
      : score >= 2
        ? "good"
        : score <= -2
          ? "avoid"
          : "mixed";

    return {
      startUtc: new Date(span.start).toISOString(),
      endUtc: new Date(span.end).toISOString(),
      hourRuler: span.ruler,
      isDay: span.isDay,
      score,
      verdict,
      factors,
    };
  });

  return {
    date: dateKey,
    moonSign: signOf(eph.eclipticLongitude("moon", noon)),
    dayRuler,
    mercuryRetrograde,
    windows,
  };
}
