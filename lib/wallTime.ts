/**
 * Wall-clock time in an IANA zone ↔ UTC, through the runtime's own IANA
 * database (Intl) — no geo-tz, so it is safe in client bundles (the moment
 * chart casts in the browser). lib/tz.ts re-exports all of it beside the
 * coordinates → zone lookup, which does need geo-tz.
 */

export type TzWarning =
  | "pre_1970_offset_uncertain"
  | "dst_gap"
  | "dst_ambiguous";

export interface WallTime {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  hour: number;
  minute: number;
}

export interface ResolvedBirthMoment {
  utc: Date;
  offsetMinutes: number;
  warnings: TzWarning[];
}

function parseGmtOffset(value: string): number {
  // Formats seen from ICU: "GMT", "GMT+2", "GMT+05:30", "GMT+00:53:28" (LMT).
  const m = value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?/);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const minutes =
    Number(m[2]) * 60 + Number(m[3] ?? 0) + Number(m[4] ?? 0) / 60;
  return sign * Math.round(minutes);
}

/** UTC offset in minutes (east positive) of `zone` at a UTC instant. */
export function offsetMinutesAt(zone: string, utc: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    timeZoneName: "longOffset",
  }).formatToParts(utc);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  return parseGmtOffset(name);
}

/**
 * An inclusive civil-date range → the UTC instants bounding it: the start
 * of `from` through the start of the day after `to`. With a zone, the days
 * are that zone's (DST-correct at each end); without one they are UTC days,
 * the behaviour older clients were built against.
 *
 * Scanned ranges are grouped by the browser's local day, so UTC bounds
 * dropped a hit early on the 1st (it fell in the previous UTC month) and
 * listed a late hit on the last day under the next month's 1st.
 */
export function civilRangeToUtc(
  from: string,
  to: string,
  zone?: string,
): { from: Date; to: Date } {
  const [ty, tm, td] = to.split("-").map(Number);
  const dayAfter = new Date(Date.UTC(ty, tm - 1, td + 1))
    .toISOString()
    .slice(0, 10);
  const start = (date: string): Date => {
    if (!zone) return new Date(`${date}T00:00:00Z`);
    const [year, month, day] = date.split("-").map(Number);
    return resolveBirthMoment(zone, { year, month, day, hour: 0, minute: 0 })
      .utc;
  };
  return { from: start(from), to: start(dayAfter) };
}

/**
 * Convert a local wall-clock birth time to a UTC instant.
 *
 * DST edge handling (Temporal "compatible" semantics):
 * - a time skipped by a spring-forward gap is shifted forward past the gap
 *   and flagged `dst_gap`;
 * - a time repeated by a fall-back fold resolves to the earlier instant
 *   (the DST side) and is flagged `dst_ambiguous`.
 */
export function resolveBirthMoment(
  zone: string,
  wall: WallTime,
): ResolvedBirthMoment {
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
  );
  const dayMs = 86_400_000;
  const before = offsetMinutesAt(zone, new Date(wallAsUtc - dayMs));
  const after = offsetMinutesAt(zone, new Date(wallAsUtc + dayMs));
  const candidates = [...new Set([before, after])];
  const valid = candidates.filter(
    (o) => offsetMinutesAt(zone, new Date(wallAsUtc - o * 60_000)) === o,
  );

  const warnings: TzWarning[] = [];
  let offsetMinutes: number;
  if (valid.length === 1) {
    offsetMinutes = valid[0];
  } else if (valid.length > 1) {
    // Fold: both offsets reproduce the wall time; larger offset = earlier instant.
    offsetMinutes = Math.max(...valid);
    warnings.push("dst_ambiguous");
  } else {
    // Gap: the wall time never existed; use the pre-transition offset, which
    // lands just after the gap.
    offsetMinutes = before;
    warnings.push("dst_gap");
  }

  if (wall.year < 1970) warnings.push("pre_1970_offset_uncertain");

  return {
    utc: new Date(wallAsUtc - offsetMinutes * 60_000),
    offsetMinutes,
    warnings,
  };
}
