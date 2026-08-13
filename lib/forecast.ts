import {
  DEFAULT_TRANSIT_ORBS,
  detectCrossAspects,
  overlayHouses,
  positionsAt,
  type AspectType,
  type Placement,
  type Planet,
  type Sign,
} from "@astralsync/astro-core";
import {
  MONTH_MAZAL,
  SEFER_YETZIRAH,
  civilToHebrewDateParts,
  dayPlanet,
  hebrewMonthStartCivil,
  type CivilDate,
  type ClassicalPlanet,
  type HebrewDateParts,
  type HebrewMonthKey,
  type MazalEntry,
  type SeferYetzirahEntry,
} from "@astralsync/hebrew-core";
import {
  hebrewDateGematria,
  type HebrewDateGematriaResult,
} from "@astralsync/numero-core";
import type { WheelChart } from "./view-types";

/**
 * Pure period-forecast computation (no DB, no clock): callers supply "today"
 * and the noon-instant mapping. Follows the transits stance — period data is
 * derived from the natal chart on demand; only the generated AI prose is
 * persisted (by lib/forecastStore.ts).
 *
 * Sampling model: one instant per civil day (noon). Ingresses and stations
 * are detected as diffs between consecutive samples, so their dates are
 * accurate to ±1 day — prompts phrase them as "around <date>".
 */

export type ForecastKind = "day" | "week" | "month";
export type ForecastMode = "western" | "hebrew";

export type { CivilDate } from "@astralsync/hebrew-core";

export interface ForecastPeriod {
  kind: ForecastKind;
  /** First civil day — the DB periodStart. */
  start: CivilDate;
  /** Last civil day, inclusive. */
  end: CivilDate;
  days: number;
}

// ---------------------------------------------------------------------------
// Civil-date arithmetic (local-tz day granularity; DST-safe because only the
// y/m/d components are ever read back).

export function civilFromDate(d: Date): CivilDate {
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

export function addDays(d: CivilDate, n: number): CivilDate {
  return civilFromDate(new Date(d.year, d.month - 1, d.day + n));
}

function weekdayOf(d: CivilDate): number {
  return new Date(d.year, d.month - 1, d.day).getDay();
}

function daysBetween(a: CivilDate, b: CivilDate): number {
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) /
      86_400_000,
  );
}

export function formatCivil(d: CivilDate): string {
  const mm = String(d.month).padStart(2, "0");
  const dd = String(d.day).padStart(2, "0");
  return `${d.year}-${mm}-${dd}`;
}

/** Noon local time of a civil day as a UTC instant — the daily sample point. */
export function localNoonUtc(d: CivilDate): Date {
  return new Date(d.year, d.month - 1, d.day, 12);
}

/**
 * Period boundaries. Weeks start on Sunday for BOTH modes (the Hebrew week
 * runs Sunday–Saturday and the day-planet cycle begins with the Sun);
 * months are per-mode: civil month (western) vs Hebrew calendar month
 * (hebrew — the mazal changes at the Hebrew month boundary).
 */
export function periodFor(
  kind: ForecastKind,
  mode: ForecastMode,
  today: CivilDate,
): ForecastPeriod {
  if (kind === "day") return { kind, start: today, end: today, days: 1 };
  if (kind === "week") {
    const start = addDays(today, -weekdayOf(today));
    return { kind, start, end: addDays(start, 6), days: 7 };
  }
  if (mode === "hebrew") {
    const start = hebrewMonthStartCivil(today);
    // Hebrew months are 29 or 30 days, so start+35 is always in the next month.
    const nextStart = hebrewMonthStartCivil(addDays(start, 35));
    const end = addDays(nextStart, -1);
    return { kind, start, end, days: daysBetween(start, end) + 1 };
  }
  const start: CivilDate = { year: today.year, month: today.month, day: 1 };
  const lastDay = new Date(today.year, today.month, 0).getDate();
  const end: CivilDate = { year: today.year, month: today.month, day: lastDay };
  return { kind, start, end, days: lastDay };
}

// ---------------------------------------------------------------------------
// Western summary

export type TransitEvent =
  | {
      type: "ingress";
      planet: Planet;
      fromSign: Sign;
      toSign: Sign;
      aroundDate: CivilDate;
    }
  | {
      type: "station";
      planet: Planet;
      direction: "retrograde" | "direct";
      aroundDate: CivilDate;
    };

/** One (transiting a, natal b, aspect type) contact tracked across the period. */
export interface AspectWindow {
  a: Planet;
  b: Planet;
  type: AspectType;
  minOrb: number;
  closestDate: CivilDate;
  /** In orb on every sampled day of the period. */
  appliedAllPeriod: boolean;
}

export interface WesternPeriodSummary {
  period: ForecastPeriod;
  /** First-day noon placements with the natal-house overlay (null on solar). */
  startPlacements: Placement[];
  natal: { version: number; isSolarChart: boolean; moonUncertain: boolean };
  /** Consecutive Moon-sign spans across the sampled days. */
  moonBySign: { sign: Sign; fromDate: CivilDate; toDate: CivilDate }[];
  /** kind=day only: next-day noon Moon sign when it differs (Moon moves into). */
  moonNext: { sign: Sign; date: CivilDate } | null;
  events: TransitEvent[];
  topAspects: AspectWindow[];
}

const OUTER_PLANETS: readonly Planet[] = [
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];
const ASPECT_CAP: Record<ForecastKind, number> = { day: 99, week: 8, month: 10 };

export function computeWesternPeriodSummary(
  natal: WheelChart,
  natalVersion: number,
  period: ForecastPeriod,
  noonUtcFor: (d: CivilDate) => Date = localNoonUtc,
): WesternPeriodSummary {
  const dates: CivilDate[] = [];
  for (let i = 0; i < period.days; i++) dates.push(addDays(period.start, i));
  const samples = dates.map((d) => positionsAt(noonUtcFor(d)));

  const startPlacements = overlayHouses(samples[0], natal.houses?.cusps ?? null);

  // Moon sign spans across the period.
  const moonBySign: WesternPeriodSummary["moonBySign"] = [];
  for (let i = 0; i < samples.length; i++) {
    const sign = samples[i].find((p) => p.planet === "moon")?.sign;
    if (!sign) continue;
    const last = moonBySign[moonBySign.length - 1];
    if (last && last.sign === sign) last.toDate = dates[i];
    else moonBySign.push({ sign, fromDate: dates[i], toDate: dates[i] });
  }

  // Daily forecasts sample the next day too, purely for the Moon's motion.
  let moonNext: WesternPeriodSummary["moonNext"] = null;
  if (period.kind === "day") {
    const nextDate = addDays(period.end, 1);
    const next = positionsAt(noonUtcFor(nextDate)).find(
      (p) => p.planet === "moon",
    );
    const today = moonBySign[0]?.sign;
    if (next && today && next.sign !== today) {
      moonNext = { sign: next.sign, date: nextDate };
    }
  }

  // Ingresses and stations from consecutive-sample diffs. The Moon is
  // excluded from ingress events — its sign motion is the moonBySign spans.
  const events: TransitEvent[] = [];
  for (let i = 1; i < samples.length; i++) {
    for (const curr of samples[i]) {
      const prev = samples[i - 1].find((p) => p.planet === curr.planet);
      if (!prev) continue;
      if (curr.planet !== "moon" && prev.sign !== curr.sign) {
        events.push({
          type: "ingress",
          planet: curr.planet,
          fromSign: prev.sign,
          toSign: curr.sign,
          aroundDate: dates[i],
        });
      }
      if (prev.retrograde !== curr.retrograde) {
        events.push({
          type: "station",
          planet: curr.planet,
          direction: curr.retrograde ? "retrograde" : "direct",
          aroundDate: dates[i],
        });
      }
    }
  }

  // Aspect windows: per-day cross aspects grouped by (a, b, type).
  const windows = new Map<string, AspectWindow & { hits: number }>();
  for (let i = 0; i < samples.length; i++) {
    for (const ca of detectCrossAspects(
      samples[i],
      natal.placements,
      DEFAULT_TRANSIT_ORBS,
    )) {
      const key = `${ca.a}|${ca.b}|${ca.type}`;
      const w = windows.get(key);
      if (!w) {
        windows.set(key, {
          a: ca.a,
          b: ca.b,
          type: ca.type,
          minOrb: ca.orb,
          closestDate: dates[i],
          appliedAllPeriod: false,
          hits: 1,
        });
      } else {
        w.hits += 1;
        if (ca.orb < w.minOrb) {
          w.minOrb = ca.orb;
          w.closestDate = dates[i];
        }
      }
    }
  }
  let all = [...windows.values()].map((w) => ({
    a: w.a,
    b: w.b,
    type: w.type,
    minOrb: w.minOrb,
    closestDate: w.closestDate,
    appliedAllPeriod: w.hits === samples.length,
  }));
  // Transiting-Moon contacts last hours, so at noon sampling they're spurious
  // for multi-day periods; slow outer-planet transits are period-defining and
  // always kept, the rest fill the per-kind cap tightest-first.
  if (period.kind !== "day") all = all.filter((w) => w.a !== "moon");
  all.sort((x, y) => x.minOrb - y.minOrb);
  const kept = all.filter((w) => OUTER_PLANETS.includes(w.a));
  for (const w of all) {
    if (kept.length >= ASPECT_CAP[period.kind]) break;
    if (!kept.includes(w)) kept.push(w);
  }
  kept.sort((x, y) => x.minOrb - y.minOrb);

  return {
    period,
    startPlacements,
    natal: {
      version: natalVersion,
      isSolarChart: natal.isSolarChart,
      moonUncertain: natal.uncertainties.some((u) => u.field === "moon_sign"),
    },
    moonBySign,
    moonNext,
    events,
    topAspects: kept,
  };
}

// ---------------------------------------------------------------------------
// Hebrew summary

export interface HebrewForecastDay {
  civil: CivilDate;
  hebrew: HebrewDateParts;
  dayPlanet: ClassicalPlanet;
  dateGematria: HebrewDateGematriaResult;
}

export interface HebrewForecastMonth {
  monthKey: HebrewMonthKey;
  /** Display name, Adar I/II distinction preserved. */
  monthName: string;
  mazal: MazalEntry;
  seferYetzirah: SeferYetzirahEntry;
  fromCivil: CivilDate;
  toCivil: CivilDate;
}

export interface HebrewPeriodSummary {
  period: ForecastPeriod;
  /** One entry per civil day, daytime mapping (no sunset adjustment). */
  days: HebrewForecastDay[];
  /** ≥1; two entries when a Hebrew month boundary falls mid-period. */
  months: HebrewForecastMonth[];
}

export function computeHebrewPeriodSummary(
  period: ForecastPeriod,
): HebrewPeriodSummary {
  const days: HebrewForecastDay[] = [];
  for (let i = 0; i < period.days; i++) {
    const civil = addDays(period.start, i);
    const hebrew = civilToHebrewDateParts(civil);
    days.push({
      civil,
      hebrew,
      dayPlanet: dayPlanet(hebrew.weekday, null).planet,
      dateGematria: hebrewDateGematria({ day: hebrew.day, year: hebrew.year }),
    });
  }

  const months: HebrewForecastMonth[] = [];
  // hebcal month numbers keep Adar I (12) and Adar II (13) distinct.
  let lastKey: string | null = null;
  for (const d of days) {
    const key = `${d.hebrew.year}-${d.hebrew.month}`;
    if (lastKey === key) {
      months[months.length - 1].toCivil = d.civil;
    } else {
      lastKey = key;
      months.push({
        monthKey: d.hebrew.monthKey,
        monthName: d.hebrew.monthName,
        mazal: MONTH_MAZAL[d.hebrew.monthKey],
        seferYetzirah: SEFER_YETZIRAH[d.hebrew.monthKey],
        fromCivil: d.civil,
        toCivil: d.civil,
      });
    }
  }

  return { period, days, months };
}
