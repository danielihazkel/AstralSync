import {
  DEFAULT_TRANSIT_ORBS,
  detectCrossAspects,
  positionsAt,
  type Placement,
} from "@astralsync/astro-core";
import {
  featuresFromPlacements,
  type BaselineDay,
  type SkyFeatures,
} from "./journalInsights";

/**
 * The Insights baseline: the sky sampled at local noon of every day in the
 * span the journal covers, so entry distributions can be compared against
 * "how often is the sky actually like that". Value-imports astro-core, so
 * load it via dynamic import only (the lib/skyCalendar.ts stance); the pure
 * statistics stay in lib/journalInsights.ts.
 *
 * Noon sampling deliberately mirrors the stored skies (the client captures
 * entries at local noon via `at`) and the Sky Calendar's signAtNoon —
 * apples to apples. Aspects use the same default transit orbs the stored
 * skies were computed with.
 */

/** Spans are capped to the most recent ~3 years — the sampler costs a few
 *  ms per day, and a decade-old first entry shouldn't freeze the tab. */
export const BASELINE_CAP_DAYS = 1096;

const DAY_MS = 86_400_000;

/** One local-noon day → features. Natal placements enable the aspect facet;
 *  pass null to omit it. */
export function baselineDayFeatures(
  date: string,
  natal: Placement[] | null,
): SkyFeatures {
  const placements = positionsAt(new Date(`${date}T12:00:00`));
  const aspects = natal
    ? detectCrossAspects(placements, natal, DEFAULT_TRANSIT_ORBS)
    : [];
  // Sun and Moon are always present in positionsAt output.
  return featuresFromPlacements(placements, aspects)!;
}

function toUtcDay(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Inclusive daily sample of [from, to], capped to the most recent
 * BASELINE_CAP_DAYS. Async on purpose: it yields to the event loop every 60
 * days so a multi-year span cannot freeze the tab; onProgress reports
 * sampled-day counts for a progress line.
 */
export async function sampleBaseline(
  from: string,
  to: string,
  natal: Placement[] | null,
  onProgress?: (done: number, total: number) => void,
): Promise<BaselineDay[]> {
  const end = toUtcDay(to);
  const start = Math.max(
    toUtcDay(from),
    end - (BASELINE_CAP_DAYS - 1) * DAY_MS,
  );
  if (end < start) return [];
  const total = Math.round((end - start) / DAY_MS) + 1;
  const out: BaselineDay[] = [];
  for (let i = 0; i < total; i++) {
    const date = fromUtcDay(start + i * DAY_MS);
    out.push({ date, features: baselineDayFeatures(date, natal) });
    if ((i + 1) % 60 === 0 && i + 1 < total) {
      onProgress?.(i + 1, total);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  onProgress?.(total, total);
  return out;
}
