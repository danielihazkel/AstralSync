import type {
  CrossAspect,
  Placement,
  Planet,
  Sign,
} from "@astralsync/astro-core";
import { SIGN_ELEMENTS, type Element } from "./dominance";
import type { EntrySky } from "./journal";
import { moodScore, type JournalMood } from "./journalMeta";
import { moonPhaseFromLongitudes } from "./moonPhase";

/**
 * Journal↔sky correlation statistics (Batch B). Pure and client-safe:
 * astro-core is imported type-only (the lib/dominance.ts stance) and the
 * baseline sky sample is injected as data — lib/journalBaseline.ts computes
 * it behind a dynamic import so this module can be statically imported by
 * the Journal tab without pulling in the ephemeris.
 *
 * The honesty rule: raw counts mislead (the Moon is in water signs ~25% of
 * all days no matter when you write), so every share is paired with the
 * baseline share over the same span, and headlines require both a minimum
 * sample and a minimum lift.
 */

/** Canonical display orders, duplicated rather than value-imported from
 *  astro-core (which would drag the ephemeris into client bundles). */
const SIGN_ORDER: Sign[] = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
];
const ELEMENT_ORDER: Element[] = ["fire", "earth", "air", "water"];
const PHASE_ORDER = [
  "New Moon",
  "Waxing Crescent",
  "First Quarter",
  "Waxing Gibbous",
  "Full Moon",
  "Waning Gibbous",
  "Third Quarter",
  "Waning Crescent",
];
const PLANET_ORDER: Planet[] = [
  "sun",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];

/** The sky facets an entry's stored sky and a baseline day both reduce to. */
export interface SkyFeatures {
  moonSign: Sign;
  moonElement: Element;
  /** Phase name from the Sun–Moon elongation. */
  phase: string;
  /** Planets retrograde that day (Sun/Moon excluded — they never are). */
  retrogrades: Planet[];
  /** Transiting planets making ≥1 aspect to the natal chart. */
  aspectPlanets: Planet[];
}

/** Shared reduction for stored skies and baseline days. */
export function featuresFromPlacements(
  placements: Placement[],
  crossAspects: CrossAspect[],
): SkyFeatures | null {
  const sun = placements.find((p) => p.planet === "sun");
  const moon = placements.find((p) => p.planet === "moon");
  if (!sun || !moon) return null;
  return {
    moonSign: moon.sign,
    moonElement: SIGN_ELEMENTS[moon.sign],
    phase: moonPhaseFromLongitudes(sun.longitude, moon.longitude),
    retrogrades: placements
      .filter(
        (p) => p.retrograde && p.planet !== "sun" && p.planet !== "moon",
      )
      .map((p) => p.planet),
    aspectPlanets: [...new Set(crossAspects.map((c) => c.a))],
  };
}

/** Stored EntrySky → features; null when placements lack Sun or Moon. */
export function featuresFromEntrySky(sky: EntrySky): SkyFeatures | null {
  return featuresFromPlacements(sky.placements, sky.crossAspects);
}

export interface BaselineDay {
  /** Local civil date, YYYY-MM-DD. */
  date: string;
  features: SkyFeatures;
}

/** An entry trimmed to what the statistics need. */
export interface InsightEntry {
  entryDate: string;
  mood: JournalMood | null;
  tags: string[];
  /** Null when the entry has no stored sky (excluded from distributions). */
  features: SkyFeatures | null;
}

export interface CategoryStat {
  /** Sign / element / phase name / planet, per section. */
  key: string;
  entryCount: number;
  /** Share of entries-with-sky, 0–1. */
  entryShare: number;
  /** Share of baseline days, 0–1. */
  baselineShare: number;
  /** entryShare − baselineShare. */
  lift: number;
}

export interface MoodSlice {
  key: string;
  count: number;
  /** Mean mood, 1–5. */
  avgMood: number;
}

export interface InsightsReport {
  totalEntries: number;
  entriesWithSky: number;
  baselineDays: number;
  moonSign: CategoryStat[];
  moonElement: CategoryStat[];
  phase: CategoryStat[];
  retrograde: CategoryStat[];
  aspectPlanet: CategoryStat[];
  /** Mean of recorded moods (1–5), null when none are recorded. */
  moodAverage: number | null;
  moodCounts: Array<{ mood: JournalMood; count: number }>;
  /** Only slices with ≥ MIN_CATEGORY moods. */
  moodByElement: MoodSlice[];
  moodByPhase: MoodSlice[];
}

/** Below this many entries-with-sky the view leads with "keep journaling". */
export const MIN_ENTRIES = 5;
/** A category needs at least this many entries to make a headline. */
export const MIN_CATEGORY = 3;
/** Minimum |entryShare − baselineShare| for a headline. */
export const MIN_LIFT = 0.15;
/** Headlines also need a baseline that isn't a handful of days. */
export const MIN_BASELINE_DAYS = 30;

function categoryStats(
  order: readonly string[],
  entryKeys: string[][],
  baselineKeys: string[][],
): CategoryStat[] {
  const entryCounts = new Map<string, number>();
  for (const keys of entryKeys)
    for (const k of keys) entryCounts.set(k, (entryCounts.get(k) ?? 0) + 1);
  const baseCounts = new Map<string, number>();
  for (const keys of baselineKeys)
    for (const k of keys) baseCounts.set(k, (baseCounts.get(k) ?? 0) + 1);
  const stats: CategoryStat[] = [];
  for (const key of order) {
    const entryCount = entryCounts.get(key) ?? 0;
    const baseCount = baseCounts.get(key) ?? 0;
    if (entryCount === 0 && baseCount === 0) continue;
    const entryShare = entryKeys.length > 0 ? entryCount / entryKeys.length : 0;
    const baselineShare =
      baselineKeys.length > 0 ? baseCount / baselineKeys.length : 0;
    stats.push({
      key,
      entryCount,
      entryShare,
      baselineShare,
      lift: entryShare - baselineShare,
    });
  }
  return stats;
}

function moodSlices(
  entries: InsightEntry[],
  keysOf: (f: SkyFeatures) => string[],
  order: readonly string[],
): MoodSlice[] {
  const sums = new Map<string, { total: number; count: number }>();
  for (const e of entries) {
    if (e.mood === null || e.features === null) continue;
    for (const key of keysOf(e.features)) {
      const s = sums.get(key) ?? { total: 0, count: 0 };
      s.total += moodScore(e.mood);
      s.count += 1;
      sums.set(key, s);
    }
  }
  return order
    .filter((key) => (sums.get(key)?.count ?? 0) >= MIN_CATEGORY)
    .map((key) => {
      const s = sums.get(key)!;
      return { key, count: s.count, avgMood: s.total / s.count };
    });
}

export function computeInsights(
  entries: InsightEntry[],
  baseline: BaselineDay[],
): InsightsReport {
  const withSky = entries.filter(
    (e): e is InsightEntry & { features: SkyFeatures } => e.features !== null,
  );
  const base = baseline.map((d) => d.features);

  const moods = entries.filter((e) => e.mood !== null);
  const moodCounts = (
    ["very_low", "low", "neutral", "high", "very_high"] as JournalMood[]
  ).map((mood) => ({
    mood,
    count: moods.filter((e) => e.mood === mood).length,
  }));

  return {
    totalEntries: entries.length,
    entriesWithSky: withSky.length,
    baselineDays: baseline.length,
    moonSign: categoryStats(
      SIGN_ORDER,
      withSky.map((e) => [e.features.moonSign]),
      base.map((f) => [f.moonSign]),
    ),
    moonElement: categoryStats(
      ELEMENT_ORDER,
      withSky.map((e) => [e.features.moonElement]),
      base.map((f) => [f.moonElement]),
    ),
    phase: categoryStats(
      PHASE_ORDER,
      withSky.map((e) => [e.features.phase]),
      base.map((f) => [f.phase]),
    ),
    retrograde: categoryStats(
      PLANET_ORDER,
      withSky.map((e) => e.features.retrogrades),
      base.map((f) => f.retrogrades),
    ),
    aspectPlanet: categoryStats(
      PLANET_ORDER,
      withSky.map((e) => e.features.aspectPlanets),
      base.map((f) => f.aspectPlanets),
    ),
    moodAverage:
      moods.length > 0
        ? moods.reduce((sum, e) => sum + moodScore(e.mood!), 0) / moods.length
        : null,
    moodCounts,
    moodByElement: moodSlices(entries, (f) => [f.moonElement], ELEMENT_ORDER),
    moodByPhase: moodSlices(entries, (f) => [f.phase], PHASE_ORDER),
  };
}

/** Distinct tags with counts, descending (ties alphabetical). */
export function tagCounts(
  entries: InsightEntry[],
): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const e of entries)
    for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface Highlight {
  text: string;
  lift: number;
}

/** Only differences that clear every guard become headlines — this is what
 *  stops three entries from producing "you always write under a Full Moon". */
export function highlights(report: InsightsReport): Highlight[] {
  if (
    report.entriesWithSky < MIN_ENTRIES ||
    report.baselineDays < MIN_BASELINE_DAYS
  ) {
    return [];
  }
  const out: Highlight[] = [];
  const add = (stats: CategoryStat[], label: (key: string) => string) => {
    for (const s of stats) {
      if (s.entryCount < MIN_CATEGORY || Math.abs(s.lift) < MIN_LIFT) continue;
      out.push({
        text: `${label(s.key)}: ${formatShare(s.entryShare)} of your notes vs ${formatShare(s.baselineShare)} of days.`,
        lift: s.lift,
      });
    }
  };
  add(report.moonSign, (k) => `Moon in ${capitalize(k)}`);
  add(report.moonElement, (k) => `Moon in ${k} signs`);
  add(report.phase, (k) => k);
  add(report.retrograde, (k) => `${capitalize(k)} retrograde`);
  add(report.aspectPlanet, (k) => `Transiting ${capitalize(k)} touching your chart`);
  return out.sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift)).slice(0, 5);
}
