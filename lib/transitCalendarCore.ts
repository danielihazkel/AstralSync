import {
  ALL_ASPECTS,
  MAJOR_ASPECTS,
  astronomyEngineProvider,
  findAspectHits,
  findIngresses,
  findStations,
  upcomingEclipses,
  type AspectType,
  type EclipseEvent,
  type Placement,
  type Planet,
} from "@astralsync/astro-core";
import type { WheelChart } from "./view-types";

/**
 * Transit calendar: exact events in a date range, scanned fresh on every
 * read and never persisted (the same PRD §9 stance as lib/transits.ts).
 * Where the Transits tab answers "what is within orb right now", this
 * answers "when does each contact perfect".
 *
 * The transiting Moon is deliberately excluded — it perfects every natal
 * aspect every month (~130 hits) and would bury everything else; lunar
 * timing lives in the sky calendar instead.
 *
 * This module is DB-free (the lib/electional.ts pattern) so client surfaces
 * — the Today dashboard's upcoming digest — can bundle it; the Prisma
 * wrapper lives in lib/transitCalendar.ts.
 */

const DAY_MS = 86_400_000;

/** Transiting bodies scanned, with sampling steps that keep per-step motion
 *  far under scan.ts's 90° wrap guard (Mercury peaks at ~2.2°/day). */
const SCAN_PLANETS: Array<{ planet: Planet; stepMs: number }> = [
  { planet: "sun", stepMs: DAY_MS },
  { planet: "mercury", stepMs: DAY_MS },
  { planet: "venus", stepMs: DAY_MS },
  { planet: "mars", stepMs: DAY_MS },
  { planet: "jupiter", stepMs: 5 * DAY_MS },
  { planet: "saturn", stepMs: 5 * DAY_MS },
  { planet: "uranus", stepMs: 10 * DAY_MS },
  { planet: "neptune", stepMs: 10 * DAY_MS },
  { planet: "pluto", stepMs: 10 * DAY_MS },
];

export interface CalendarAspectEvent {
  kind: "aspect";
  /** ISO instant the aspect perfects. */
  utc: string;
  /** Transiting planet. */
  a: Planet;
  /** Natal planet. */
  b: Planet;
  type: AspectType;
  angle: number;
  /** True when the transiting planet was retrograde at the hit. */
  retrograde: boolean;
  /** Retrograde loops perfect the same contact up to three times; n is
   *  1-based in time order, `of` counts hits inside the scanned range only. */
  pass: { n: number; of: number };
}

export interface CalendarIngressEvent {
  kind: "ingress";
  utc: string;
  planet: Planet;
  /** 0-based sign index from Aries of the sign entered. */
  signIndex: number;
  /** True for a retrograde (backwards) boundary crossing. */
  retrograde: boolean;
}

export interface CalendarStationEvent {
  kind: "station";
  utc: string;
  planet: Planet;
  direction: "retrograde" | "direct";
}

export interface CalendarEclipseEvent {
  kind: "eclipse";
  utc: string;
  eclipse: EclipseEvent;
}

export type TransitCalendarEvent =
  | CalendarAspectEvent
  | CalendarIngressEvent
  | CalendarStationEvent
  | CalendarEclipseEvent;

export interface TransitCalendarData {
  from: string;
  to: string;
  natal: {
    version: number;
    isSolarChart: boolean;
    moonUncertain: boolean;
  };
  /** All events in time order. */
  events: TransitCalendarEvent[];
  engine: { name: string; version: string };
}

export interface TransitCalendarOptions {
  includeMinors?: boolean;
}

/** The aspect sweep shared by the full calendar and the lean digest: every
 *  exact perfection of a scanned transiter to the given natal longitudes,
 *  with retrograde passes numbered per contact, time-ordered. */
export function scanAspectEvents(
  placements: Array<Pick<Placement, "planet" | "longitude">>,
  from: Date,
  to: Date,
  options: TransitCalendarOptions = {},
): CalendarAspectEvent[] {
  const eph = astronomyEngineProvider;
  const defs = options.includeMinors ? ALL_ASPECTS : MAJOR_ASPECTS;
  const typeByAngle = new Map(defs.map((d) => [d.angle, d.type]));
  const angles = defs.map((d) => d.angle);

  const events: CalendarAspectEvent[] = [];
  for (const { planet, stepMs } of SCAN_PLANETS) {
    const lonAt = (t: Date) => eph.eclipticLongitude(planet, t);
    for (const natalPlacement of placements) {
      const hits = findAspectHits(
        lonAt,
        () => natalPlacement.longitude,
        angles,
        from,
        to,
        stepMs,
      );
      for (const hit of hits) {
        events.push({
          kind: "aspect",
          utc: hit.utc.toISOString(),
          a: planet,
          b: natalPlacement.planet,
          type: typeByAngle.get(hit.angle)!,
          angle: hit.angle,
          retrograde: eph.isRetrograde(planet, hit.utc),
          pass: { n: 1, of: 1 },
        });
      }
    }
  }

  // Number the retrograde passes per contact, in time order.
  const groups = new Map<string, CalendarAspectEvent[]>();
  for (const e of events) {
    const key = `${e.a}|${e.b}|${e.type}`;
    const group = groups.get(key) ?? [];
    group.push(e);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.sort((x, y) => x.utc.localeCompare(y.utc));
    group.forEach((e, i) => {
      e.pass = { n: i + 1, of: group.length };
    });
  }

  events.sort((x, y) => x.utc.localeCompare(y.utc));
  return events;
}

/** Pure: natal chart + range → every exact transit event, time-ordered. */
export function computeTransitCalendar(
  natal: WheelChart,
  natalVersion: number,
  from: Date,
  to: Date,
  options: TransitCalendarOptions = {},
): TransitCalendarData {
  const eph = astronomyEngineProvider;

  const events: TransitCalendarEvent[] = scanAspectEvents(
    natal.placements,
    from,
    to,
    options,
  );

  for (const { planet } of SCAN_PLANETS) {
    for (const ingress of findIngresses(planet, from, to)) {
      events.push({
        kind: "ingress",
        utc: ingress.utc.toISOString(),
        planet,
        signIndex: ingress.signIndex,
        retrograde: !ingress.ascending,
      });
    }
  }

  for (const station of findStations(from, to)) {
    events.push({
      kind: "station",
      utc: station.utc.toISOString(),
      planet: station.planet,
      direction: station.direction,
    });
  }

  const horizonDays = Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
  for (const eclipse of upcomingEclipses(from, horizonDays)) {
    if (new Date(eclipse.peakUtc).getTime() <= to.getTime()) {
      events.push({ kind: "eclipse", utc: eclipse.peakUtc, eclipse });
    }
  }

  events.sort((x, y) => x.utc.localeCompare(y.utc));

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    natal: {
      version: natalVersion,
      isSolarChart: natal.isSolarChart,
      moonUncertain: natal.uncertainties.some((u) => u.field === "moon_sign"),
    },
    events,
    engine: { name: eph.name, version: eph.version },
  };
}
