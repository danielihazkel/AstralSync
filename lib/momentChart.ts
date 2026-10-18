import {
  buildChart,
  overlayHouses,
  partOfFortunePlacement,
  pointsAt,
  type HouseSystem,
  type PointPlacement,
} from "@astralsync/astro-core";
import type { WheelChart } from "./view-types";
import type { MomentPlace } from "./momentQuery";
import { resolveBirthMoment } from "./wallTime";

export type { MomentPlace };

/**
 * The chart of a moment: any date, time and place cast on the spot, with
 * no profile behind it — an event, a question (horary), the sky right now.
 * Pure and client-safe (no geo-tz: the place arrives with its IANA zone
 * from the city search), so the /chart page computes in the browser and
 * works offline once loaded.
 */

export interface MomentInput {
  /** "YYYY-MM-DD" in the place's zone. */
  date: string;
  /** "HH:MM" in the place's zone. */
  time: string;
  place: MomentPlace;
  houseSystem: HouseSystem;
}

export interface MomentChart {
  utc: Date;
  /** The zone's offset at that instant, minutes east of UTC. */
  offsetMinutes: number;
  chart: WheelChart;
  /** Nodes and Lilith (both node variants) plus the Part of Fortune — the
   *  ChartWheel points ring. */
  points: { mean: PointPlacement[]; true: PointPlacement[] };
}

export function castMoment(input: MomentInput): MomentChart {
  const [year, month, day] = input.date.split("-").map(Number);
  const [hour, minute] = input.time.split(":").map(Number);
  const moment = resolveBirthMoment(input.place.tzIana, {
    year,
    month,
    day,
    hour,
    minute,
  });
  const snapshot = buildChart({
    utc: moment.utc,
    latitude: input.place.lat,
    longitude: input.place.lng,
    houseSystem: input.houseSystem,
  });
  const chart: WheelChart = {
    ...snapshot,
    // The moment is a clock reading, not a birth record: only the clock
    // changes matter (a pre-1970 offset caveat is about birth records).
    tzWarnings: moment.warnings.filter((w) => w !== "pre_1970_offset_uncertain"),
  };
  const cusps = chart.houses?.cusps ?? null;
  const points = {
    mean: overlayHouses(pointsAt(moment.utc, "mean"), cusps),
    true: overlayHouses(pointsAt(moment.utc, "true"), cusps),
  };
  if (chart.houses) {
    const sun = chart.placements.find((p) => p.planet === "sun")!.longitude;
    const moon = chart.placements.find((p) => p.planet === "moon")!.longitude;
    const fortune = partOfFortunePlacement(chart.houses.ascendant, sun, moon, chart.houses.cusps);
    points.mean.push(fortune);
    points.true.push(fortune);
  }
  return { utc: moment.utc, offsetMinutes: moment.offsetMinutes, chart, points };
}

/** The current wall-clock date and time in `zone` — "now" at the place,
 *  not in the browser. */
export function wallNowIn(zone: string, now: Date = new Date()): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}
