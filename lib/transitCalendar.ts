import {
  ALL_ASPECTS,
  MAJOR_ASPECTS,
  astronomyEngineProvider,
  findAspectHits,
  findIngresses,
  findStations,
  upcomingEclipses,
  type Aspect,
  type AspectType,
  type EclipseEvent,
  type Planet,
} from "@astralsync/astro-core";
import { prisma } from "./db";
import type { StoredChart, WheelChart } from "./view-types";

/**
 * Transit calendar: exact events in a date range, scanned fresh on every
 * read and never persisted (the same PRD §9 stance as lib/transits.ts).
 * Where the Transits tab answers "what is within orb right now", this
 * answers "when does each contact perfect".
 *
 * The transiting Moon is deliberately excluded — it perfects every natal
 * aspect every month (~130 hits) and would bury everything else; lunar
 * timing lives in the sky calendar instead.
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

/** Pure: natal chart + range → every exact transit event, time-ordered. */
export function computeTransitCalendar(
  natal: WheelChart,
  natalVersion: number,
  from: Date,
  to: Date,
  options: TransitCalendarOptions = {},
): TransitCalendarData {
  const eph = astronomyEngineProvider;
  const defs = options.includeMinors ? ALL_ASPECTS : MAJOR_ASPECTS;
  const typeByAngle = new Map(defs.map((d) => [d.angle, d.type]));
  const angles = defs.map((d) => d.angle);

  const events: TransitCalendarEvent[] = [];

  for (const { planet, stepMs } of SCAN_PLANETS) {
    const lonAt = (t: Date) => eph.eclipticLongitude(planet, t);

    for (const natalPlacement of natal.placements) {
      const hits = findAspectHits(
        lonAt,
        () => natalPlacement.longitude,
        angles,
        from,
        to,
        stepMs,
      );
      for (let i = 0; i < hits.length; i++) {
        // Hits for one (planet, natal, angle) arrive time-ordered from the
        // shared scan; pass numbering is filled per group below.
        events.push({
          kind: "aspect",
          utc: hits[i].utc.toISOString(),
          a: planet,
          b: natalPlacement.planet,
          type: typeByAngle.get(hits[i].angle)!,
          angle: hits[i].angle,
          retrograde: eph.isRetrograde(planet, hits[i].utc),
          pass: { n: 1, of: 1 },
        });
      }
    }

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

  // Number the retrograde passes per contact, in time order.
  const groups = new Map<string, CalendarAspectEvent[]>();
  for (const e of events) {
    if (e.kind !== "aspect") continue;
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

/** Ephemeral read against the profile's latest natal snapshot — the same
 *  loading path as getTransitView. Null when the profile has no snapshot. */
export async function getTransitCalendar(
  profileId: number,
  from: Date,
  to: Date,
  options?: TransitCalendarOptions,
): Promise<TransitCalendarData | null> {
  const snapshot = await prisma.astroSnapshot.findFirst({
    where: { profileId },
    orderBy: { version: "desc" },
  });
  if (!snapshot) return null;
  const natal: WheelChart = {
    ...(snapshot.placementsJson as unknown as StoredChart),
    aspects: (snapshot.aspectsJson as unknown as Aspect[]) ?? [],
  };
  return computeTransitCalendar(natal, snapshot.version, from, to, options);
}
