import {
  ascendant,
  astronomyEngineProvider,
  essentialDignity,
  findAspectHits,
  findIngresses,
  meanObliquity,
  norm360,
  separation,
  signOf,
  solarCondition,
  TRADITIONAL_RULERS,
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
import { lunarMansion } from "./lunarMansions";
import { isWaxing } from "./moonPhase";
import type { HomeLocation } from "./today";

/**
 * Electional day picker: score time windows for starting something, using
 * transparent classical rules — no AI, every window lists the factors that
 * moved it. Client-side and DB-free like lib/skyCalendar.ts.
 *
 * Factor set (small and defensible; each factor names itself in the list):
 *  - Moon void of course → the window is an "avoid", full stop.
 *  - The Moon's applying aspect: harmonious to a benefic lifts, hard to a
 *    malefic drags.
 *  - Planetary hour and day ruler matching the chosen intent.
 *  - Moon phase vs the intent: waxing favors beginnings (+1), except the
 *    Saturnian commitment intent, which prefers a waning consolidation.
 *  - The intent planet's solar condition: cazimi +2, combust −2, under the
 *    beams −1.
 *  - With a location: the elected Ascendant's ruler — essential dignity ±1,
 *    combustion −1 — and the hour ruler's essential dignity ±1, both read
 *    at the window's midpoint.
 *  - Mercury retrograde: a penalty for Mercury-ruled intents, otherwise a
 *    listed caution.
 *  - With a profile (natal-aware mode): transiting benefics supporting or
 *    malefics afflicting the natal luminaries (day-level, 3° orb), and the
 *    transiting Moon perfecting a contact to a natal luminary inside the
 *    window. Factors say "your natal …" so mundane and personal never blur.
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

/** The natal side of natal-aware scoring — the luminaries are enough for a
 *  small, defensible factor set. */
export interface ElectionalNatal {
  /** Stable cache key (profile id + snapshot version). */
  key: string;
  sunLongitude: number;
  /** Null when the natal Moon's degree is uncertain (unknown/approx birth
   *  time) — no personal factor is built on a guess. */
  moonLongitude: number | null;
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

/** Personal transits read tight — the factor claims a specific contact. */
const NATAL_TRANSIT_ORB = 3;

interface NatalLunarHit {
  utc: number;
  target: "sun" | "moon";
  angle: number;
}

/** Per-(date, natal) memo like dayScanCache — rescoring an intent or
 *  location change never re-pays the Moon-to-natal scan. */
const natalScanCache = new LruMap<string, NatalLunarHit[]>(62);

/** Exact transiting-Moon contacts to the natal luminaries across the same
 *  padded window lunarDayScan uses (late planetary hours run past civil
 *  midnight). */
export function lunarNatalScan(
  year: number,
  month1: number,
  day: number,
  natal: ElectionalNatal,
): NatalLunarHit[] {
  const p = (n: number) => String(n).padStart(2, "0");
  const key = `${year}-${p(month1)}-${p(day)}|${natal.key}`;
  const cached = natalScanCache.get(key);
  if (cached) return cached;

  const eph = astronomyEngineProvider;
  const dayStart = new Date(year, month1 - 1, day);
  const dayEnd = new Date(year, month1 - 1, day + 1);
  const scanFrom = new Date(dayStart.getTime() - 2 * DAY_MS);
  const scanTo = new Date(dayEnd.getTime() + 2 * DAY_MS);
  const moonAt = memoizeByMs((t) => eph.eclipticLongitude("moon", t));

  const targets: Array<{ target: "sun" | "moon"; longitude: number }> = [
    { target: "sun", longitude: natal.sunLongitude },
  ];
  if (natal.moonLongitude !== null) {
    targets.push({ target: "moon", longitude: natal.moonLongitude });
  }

  const hits: NatalLunarHit[] = [];
  for (const { target, longitude } of targets) {
    for (const h of findAspectHits(
      moonAt,
      () => longitude,
      MAJOR_ANGLES,
      scanFrom,
      scanTo,
      HOUR_MS,
    )) {
      hits.push({ utc: h.utc.getTime(), target, angle: h.angle });
    }
  }
  hits.sort((a, b) => a.utc - b.utc);
  natalScanCache.set(key, hits);
  return hits;
}

/** Day-level natal factors: transiting benefics supporting or malefics
 *  afflicting the natal luminaries at noon, within the tight personal orb.
 *  Only the scored doctrine combinations are emitted — quiet days stay
 *  quiet. */
function natalDayFactors(
  natal: ElectionalNatal,
  planetLonAt: (planet: Planet, t: Date) => number,
  noon: Date,
): ElectionalFactor[] {
  const targets: Array<{ target: "sun" | "moon"; longitude: number }> = [
    { target: "sun", longitude: natal.sunLongitude },
  ];
  if (natal.moonLongitude !== null) {
    targets.push({ target: "moon", longitude: natal.moonLongitude });
  }
  const factors: ElectionalFactor[] = [];
  for (const transiter of [...BENEFICS, ...MALEFICS]) {
    const lon = planetLonAt(transiter, noon);
    for (const { target, longitude } of targets) {
      const sep = separation(lon, longitude);
      const angle = MAJOR_ANGLES.find(
        (a) => Math.abs(sep - a) <= NATAL_TRANSIT_ORB,
      );
      if (angle === undefined) continue;
      const label = `Transiting ${cap(transiter)} in a ${ASPECT_WORD[angle]} to your natal ${cap(target)}`;
      if (BENEFICS.has(transiter) && (HARMONIOUS.has(angle) || angle === 0)) {
        factors.push({ label, score: 1 });
      } else if (MALEFICS.has(transiter) && (HARD.has(angle) || angle === 0)) {
        factors.push({ label, score: -1 });
      }
    }
  }
  return factors;
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
  /** Natal-aware mode: personal factors for this chart join the mundane
   *  ones (each labeled "your natal …"). */
  natal?: ElectionalNatal | null;
}): ElectionalDay {
  const { year, month, day, location, intent, natal = null } = opts;
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

  // Day-level conditions, read once at local noon like the Mercury flag:
  // the phase and a planet's solar separation drift far slower than a day.
  const sunNoonLon = eph.eclipticLongitude("sun", noon);
  const moonNoonLon = eph.eclipticLongitude("moon", noon);
  const moonWaxing = isWaxing(sunNoonLon, moonNoonLon);
  const mansion = lunarMansion(moonNoonLon);
  const intentSolar =
    intentPlanet && intentPlanet !== "sun"
      ? solarCondition(eph.eclipticLongitude(intentPlanet, noon), sunNoonLon)
      : null;

  // Window-midpoint longitudes: one memoized sampler per planet, so the
  // Ascendant ruler, hour ruler and Sun share evaluations when they meet.
  const lonSamplers = new Map<Planet, (t: Date) => number>();
  const planetLonAt = (planet: Planet, t: Date): number => {
    let fn = lonSamplers.get(planet);
    if (!fn) {
      fn = memoizeByMs((x) => eph.eclipticLongitude(planet, x));
      lonSamplers.set(planet, fn);
    }
    return fn(t);
  };

  // Natal-aware extras: day-level benefic/malefic contacts (shared by every
  // window) and the Moon's exact hits to the natal luminaries (window-level).
  const natalFactors = natal ? natalDayFactors(natal, planetLonAt, noon) : [];
  const natalHits = natal ? lunarNatalScan(year, month, day, natal) : [];

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

    // Moon phase vs intent. Commitment is the one consolidating intent —
    // it prefers the waning half; every other intent is a beginning. The
    // off-phase reading stays informational (score 0), not a penalty.
    if (intentPlanet) {
      if (intent === "commitment") {
        factors.push(
          moonWaxing
            ? { label: "Waxing Moon (growth over consolidation)", score: 0 }
            : { label: "Waning Moon suits consolidation", score: 1 },
        );
      } else {
        factors.push(
          moonWaxing
            ? { label: "Waxing Moon favors beginnings", score: 1 }
            : {
                label: "Waning Moon (better for release than launch)",
                score: 0,
              },
        );
      }
    }

    // Lunar mansion (Picatrix tradition, day-level like the phase): the
    // fortunate mansions help, the unfortunate ones count against; the
    // mixed ones are informational only.
    if (intentPlanet) {
      factors.push({
        label: `Moon in mansion ${mansion.index}, ${mansion.name} (${mansion.nature})`,
        score:
          mansion.nature === "fortunate"
            ? 1
            : mansion.nature === "unfortunate"
              ? -1
              : 0,
      });
    }

    if (intentSolar && intentPlanet) {
      factors.push(
        intentSolar === "cazimi"
          ? {
              label: `${cap(intentPlanet)} is cazimi — in the heart of the Sun`,
              score: 2,
            }
          : intentSolar === "combust"
            ? { label: `${cap(intentPlanet)} is combust`, score: -2 }
            : {
                label: `${cap(intentPlanet)} is under the Sun's beams`,
                score: -1,
              },
      );
    }

    // Chart-of-the-moment factors need a real timed window and a location:
    // the elected Ascendant's ruler and the hour ruler, read at the window
    // midpoint. Emitted only when non-neutral so quiet windows stay quiet.
    if (location && span.ruler) {
      const mid = new Date((span.start + span.end) / 2);
      const ramc = norm360(eph.siderealTimeDeg(mid) + location.lng);
      const ascSign = signOf(
        ascendant(ramc, location.lat, meanObliquity(mid)),
      );
      const ascRuler = TRADITIONAL_RULERS[ascSign];
      const ascRulerSign = signOf(planetLonAt(ascRuler, mid));
      const ascDignity = essentialDignity(ascRuler, ascRulerSign);
      if (ascDignity) {
        factors.push({
          label: `${cap(ascSign)} rises; ruler ${cap(ascRuler)} in ${cap(ascRulerSign)} (${ascDignity})`,
          score:
            ascDignity === "domicile" || ascDignity === "exaltation" ? 1 : -1,
        });
      }
      if (
        ascRuler !== "sun" &&
        solarCondition(
          planetLonAt(ascRuler, mid),
          planetLonAt("sun", mid),
        ) === "combust"
      ) {
        factors.push({
          label: `Ascendant ruler ${cap(ascRuler)} is combust`,
          score: -1,
        });
      }

      const hourSign = signOf(planetLonAt(span.ruler, mid));
      const hourDignity = essentialDignity(span.ruler, hourSign);
      if (hourDignity) {
        factors.push({
          label: `Hour ruler ${cap(span.ruler)} in ${cap(hourSign)} (${hourDignity})`,
          score:
            hourDignity === "domicile" || hourDignity === "exaltation"
              ? 1
              : -1,
        });
      }
    }

    // Personal factors: the day-level contacts apply to every window; a
    // Moon perfection lands only in the window that contains its instant.
    factors.push(...natalFactors);
    for (const h of natalHits) {
      if (h.utc < span.start || h.utc >= span.end) continue;
      const harmonious = HARMONIOUS.has(h.angle) || h.angle === 0;
      factors.push({
        label: `Moon perfects a ${ASPECT_WORD[h.angle]} to your natal ${cap(h.target)}`,
        score: harmonious ? 1 : -1,
      });
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
