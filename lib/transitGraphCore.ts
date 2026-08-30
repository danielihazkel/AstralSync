import {
  ALL_ASPECTS,
  DEFAULT_TRANSIT_ORBS,
  MAJOR_ASPECTS,
  PLANETS,
  PLANET_SCAN_STEP_MS,
  angleDiff,
  astronomyEngineProvider,
  findAspectHits,
  findOrbWindow,
  maxOrb,
  type AspectType,
  type OrbConfig,
  type Placement,
  type Planet,
} from "@astralsync/astro-core";
import type { WheelChart } from "./view-types";

/**
 * Transit time-graph: for a date range, every transiting contact's in-orb
 * window (entry → exact → exit) against the natal chart, grouped by natal
 * target. Where the calendar lists exact instants and the Now view lists
 * what is within orb this minute, the graph shows *how long* each contact
 * lasts and how the passes of a retrograde loop overlap. Ephemeral like the
 * rest (PRD §9): scanned fresh, never stored. DB-free so it could bundle
 * client-side later; the Prisma wrapper lives in lib/transitGraph.ts.
 *
 * The transiting Moon is excluded for the calendar's reason (it perfects
 * everything every month).
 */

const DAY_MS = 86_400_000;

/** How far around an exact hit the orb window may extend — generous enough
 *  for the slowest bodies' retrograde loops; windows that still overflow are
 *  flagged truncated. Also the margin the scan extends past the requested
 *  range so a window that straddles its edge is drawn. */
const WINDOW_SPAN_MS: Record<Planet, number> = {
  sun: 60 * DAY_MS,
  moon: 2 * DAY_MS,
  mercury: 90 * DAY_MS,
  venus: 90 * DAY_MS,
  mars: 150 * DAY_MS,
  jupiter: 300 * DAY_MS,
  saturn: 450 * DAY_MS,
  uranus: 700 * DAY_MS,
  neptune: 900 * DAY_MS,
  pluto: 900 * DAY_MS,
};

const GRAPH_TRANSITERS: Planet[] = PLANETS.filter((p) => p !== "moon");

export interface GraphBar {
  transiter: Planet;
  target: Planet;
  type: AspectType;
  angle: number;
  /** ISO instants. */
  entryUtc: string;
  exactUtc: string;
  exitUtc: string;
  /** True when the transiter was retrograde at the exact hit. */
  retrograde: boolean;
  /** Retrograde passes numbered per contact inside the scanned span. */
  pass: { n: number; of: number };
  truncated: { entry: boolean; exit: boolean };
}

export interface TransitGraphRow {
  target: Planet;
  bars: GraphBar[];
}

export interface TransitGraphData {
  from: string;
  to: string;
  natal: { version: number; isSolarChart: boolean; moonUncertain: boolean };
  orbs: OrbConfig;
  includeMinors: boolean;
  rows: TransitGraphRow[];
  engine: { name: string; version: string };
}

export interface TransitGraphOptions {
  orbs?: OrbConfig;
  includeMinors?: boolean;
}

/** Pure: natal placements + range → in-orb bars per natal target. */
export function computeTransitGraphRows(
  placements: Array<Pick<Placement, "planet" | "longitude">>,
  from: Date,
  to: Date,
  options: TransitGraphOptions = {},
): TransitGraphRow[] {
  const eph = astronomyEngineProvider;
  const orbs = options.orbs ?? DEFAULT_TRANSIT_ORBS;
  const defs = options.includeMinors ? ALL_ASPECTS : MAJOR_ASPECTS;
  const angles = defs.map((d) => d.angle);
  const typeByAngle = new Map(defs.map((d) => [d.angle, d.type]));
  const minorOrb = orbs.minor ?? 2;

  const bars: GraphBar[] = [];
  for (const transiter of GRAPH_TRANSITERS) {
    const span = WINDOW_SPAN_MS[transiter];
    const step = PLANET_SCAN_STEP_MS[transiter];
    const lonAt = (t: Date) => eph.eclipticLongitude(transiter, t);
    const scanFrom = new Date(from.getTime() - span);
    const scanTo = new Date(to.getTime() + span);
    for (const natal of placements) {
      const fixed = () => natal.longitude;
      const hits = findAspectHits(lonAt, fixed, angles, scanFrom, scanTo, step);
      for (const hit of hits) {
        const def = defs.find((d) => d.angle === hit.angle)!;
        const orb =
          def.class === "minor" ? minorOrb : maxOrb(transiter, natal.planet, orbs);
        const sep = angleDiff(lonAt(hit.utc), natal.longitude);
        const signedAngle =
          hit.angle === 0 || hit.angle === 180
            ? hit.angle
            : Math.sign(sep) * hit.angle;
        const w = findOrbWindow(lonAt, fixed, signedAngle, orb, hit.utc, span, step);
        // Keep only windows that touch the requested range.
        if (w.exitUtc.getTime() < from.getTime() || w.entryUtc.getTime() > to.getTime()) {
          continue;
        }
        bars.push({
          transiter,
          target: natal.planet,
          type: typeByAngle.get(hit.angle)!,
          angle: hit.angle,
          entryUtc: w.entryUtc.toISOString(),
          exactUtc: hit.utc.toISOString(),
          exitUtc: w.exitUtc.toISOString(),
          retrograde: eph.isRetrograde(transiter, hit.utc),
          pass: { n: 1, of: 1 },
          truncated: w.truncated,
        });
      }
    }
  }

  // Number passes per contact (in time order) among the bars kept.
  const groups = new Map<string, GraphBar[]>();
  for (const b of bars) {
    const key = `${b.transiter}|${b.target}|${b.type}`;
    const g = groups.get(key) ?? [];
    g.push(b);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    g.sort((x, y) => x.exactUtc.localeCompare(y.exactUtc));
    g.forEach((b, i) => {
      b.pass = { n: i + 1, of: g.length };
    });
  }

  const byTarget = new Map<Planet, GraphBar[]>();
  for (const b of bars) {
    const list = byTarget.get(b.target) ?? [];
    list.push(b);
    byTarget.set(b.target, list);
  }
  return placements.map((p) => ({
    target: p.planet,
    bars: (byTarget.get(p.planet) ?? []).sort((x, y) =>
      x.entryUtc.localeCompare(y.entryUtc),
    ),
  }));
}

export function computeTransitGraph(
  natal: WheelChart,
  natalVersion: number,
  from: Date,
  to: Date,
  options: TransitGraphOptions = {},
): TransitGraphData {
  const eph = astronomyEngineProvider;
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    natal: {
      version: natalVersion,
      isSolarChart: natal.isSolarChart,
      moonUncertain: natal.uncertainties.some((u) => u.field === "moon_sign"),
    },
    orbs: options.orbs ?? DEFAULT_TRANSIT_ORBS,
    includeMinors: options.includeMinors === true,
    rows: computeTransitGraphRows(natal.placements, from, to, options),
    engine: { name: eph.name, version: eph.version },
  };
}
