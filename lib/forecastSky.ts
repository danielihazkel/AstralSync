import {
  getEntry,
  loadContentIndex,
  type ContentEntry,
  type ContentIndex,
} from "./content";
import { natalAspectKey, transitAspectKey } from "./contentKeys";
import {
  computeHebrewPeriodSummary,
  computeWesternPeriodSummary,
  type AspectWindow,
  type ForecastMode,
  type ForecastPeriod,
  type HebrewPeriodSummary,
  type WesternPeriodSummary,
} from "./forecast";
import type { WheelChart } from "./view-types";

/**
 * The deterministic half of a forecast: the same period summary the AI
 * prompt is built from, returned to the Forecast tab so it has something to
 * show with no model configured — and something to check a generated
 * forecast against when there is one.
 *
 * It is a read like /api/transits: recomputed on every GET (a month costs
 * ~30 ms), never stored. Only the AI prose is cached per period.
 */

/** Authored prose for one aspect window. */
export interface WindowProse {
  key: string;
  title: string;
  bodyMd: string;
}

export type ForecastSky =
  | {
      mode: "western";
      summary: WesternPeriodSummary;
      /** Parallel to summary.topAspects; null where nothing is authored. */
      prose: (WindowProse | null)[];
    }
  | { mode: "hebrew"; summary: HebrewPeriodSummary };

/**
 * The content behind one transiting contact. Authored `transit_aspect`
 * prose (directional: `w.a` is the transiting body) wins; otherwise the
 * natal `aspect` archetype for the pair, which reads as a description of a
 * birth chart and so is only fit for a prompt that is told to adapt it.
 */
export function windowEntry(
  w: AspectWindow,
  index: ContentIndex,
): { entry: ContentEntry; kind: "transit" | "natal_archetype" } | null {
  const transit = getEntry(index, transitAspectKey(w.a, w.b, w.type));
  if (transit) return { entry: transit, kind: "transit" };
  const natal = getEntry(index, natalAspectKey(w.a, w.b, w.type));
  return natal ? { entry: natal, kind: "natal_archetype" } : null;
}

export function computeForecastSky(
  mode: ForecastMode,
  period: ForecastPeriod,
  natal: { chart: WheelChart; version: number },
  index: ContentIndex = loadContentIndex(),
): ForecastSky {
  if (mode === "hebrew") {
    return { mode, summary: computeHebrewPeriodSummary(period) };
  }
  const summary = computeWesternPeriodSummary(natal.chart, natal.version, period);
  const prose = summary.topAspects.map((w) => {
    const found = windowEntry(w, index);
    // Shown to the reader as-is, so transit-framed prose only: a natal
    // archetype here would describe a birth chart, not this week.
    return found?.kind === "transit"
      ? {
          key: found.entry.key,
          title: found.entry.title,
          bodyMd: found.entry.bodyMd,
        }
      : null;
  });
  return { mode, summary, prose };
}
